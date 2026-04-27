package auth

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"

	"github.com/432539/gpt2api/internal/billing"
	"github.com/432539/gpt2api/internal/settings"
	"github.com/432539/gpt2api/internal/user"
	pkgjwt "github.com/432539/gpt2api/pkg/jwt"
	"github.com/432539/gpt2api/pkg/mailer"
)

// 错误码
var (
	ErrEmailExists               = errors.New("auth: email already exists")
	ErrInvalidCredential         = errors.New("auth: invalid email or password")
	ErrUserBanned                = errors.New("auth: user banned")
	ErrRegisterDisabled          = errors.New("auth: user registration is disabled")
	ErrEmailNotAllowed           = errors.New("auth: email domain is not allowed by whitelist")
	ErrPasswordTooShort          = errors.New("auth: password too short")
	ErrEmailVerifyDisabled       = errors.New("auth: email verification is disabled")
	ErrEmailServiceUnavailable   = errors.New("auth: email service is unavailable")
	ErrEmailCodeSendFailed       = errors.New("auth: failed to send email verification code")
	ErrEmailCodeRequired         = errors.New("auth: email verification code is required")
	ErrEmailCodeInvalidOrExpired = errors.New("auth: invalid or expired email verification code")
	ErrEmailCodeCooldown         = errors.New("auth: email code requested too frequently")
	ErrEmailCodeRateLimited      = errors.New("auth: email code request rate limit exceeded")
)

const (
	registerEmailCodeTTL         = 10 * time.Minute
	registerEmailCodeCooldownTTL = 60 * time.Second
	registerEmailCodeRateWindow  = 10 * time.Minute
	registerEmailCodeEmailLimit  = 5
	registerEmailCodeIPLimit     = 20
)

var consumeRegisterEmailCodeScript = redis.NewScript(`
if redis.call("GET", KEYS[1]) == ARGV[1] then
    redis.call("DEL", KEYS[1])
    return 1
end
return 0
`)

type retryAfterError struct {
	cause         error
	retryAfterSec int
}

func (e *retryAfterError) Error() string { return e.cause.Error() }
func (e *retryAfterError) Unwrap() error { return e.cause }

type sendRegisterEmailCodeResult struct {
	Sent          bool `json:"sent"`
	ExpireSec     int  `json:"expire_sec"`
	RetryAfterSec int  `json:"retry_after_sec"`
}

// Service 封装注册、登录、刷新业务。
type Service struct {
	users      *user.DAO
	jwt        *pkgjwt.Manager
	bcryptCost int
	rdb        *redis.Client

	mail    *mailer.Mailer // 可为 nil;为 nil 时不发邮件
	baseURL string

	// 以下两个用于注册开关 / 赠送积分,均为可选依赖。
	// 未注入时:允许注册(兼容旧行为),不发放赠送积分。
	settings *settings.Service
	billing  *billing.Engine
}

func NewService(udao *user.DAO, jm *pkgjwt.Manager, bcryptCost int) *Service {
	if bcryptCost < bcrypt.MinCost || bcryptCost > bcrypt.MaxCost {
		bcryptCost = 10
	}
	return &Service{users: udao, jwt: jm, bcryptCost: bcryptCost}
}

// SetMailer 把邮件发送器注入进来(可选)。传 nil 或 disabled 的 mailer 即不发邮件。
// 单独出接口,避免 NewService 签名膨胀。
func (s *Service) SetMailer(m *mailer.Mailer, baseURL string) {
	s.mail = m
	s.baseURL = baseURL
}

// SetSettings 注入系统设置服务(用于注册开关 / 默认分组)。
func (s *Service) SetSettings(ss *settings.Service) { s.settings = ss }

// SetBilling 注入计费引擎(用于注册赠送积分)。
func (s *Service) SetBilling(b *billing.Engine) { s.billing = b }

// SetRedis 注入 Redis 客户端(用于注册邮箱验证码)。
func (s *Service) SetRedis(rdb *redis.Client) { s.rdb = rdb }

// SendRegisterEmailCode 发送注册邮箱验证码。
func (s *Service) SendRegisterEmailCode(ctx context.Context, email, ip string) (*sendRegisterEmailCodeResult, error) {
	email = normalizeEmail(email)
	if email == "" {
		return nil, errors.New("email required")
	}
	if s.settings == nil || !s.settings.RequireEmailVerify() {
		return nil, ErrEmailVerifyDisabled
	}
	if s.mail == nil || s.mail.Disabled() {
		return nil, ErrEmailServiceUnavailable
	}
	if err := s.ensureEmailAllowed(email); err != nil {
		return nil, err
	}
	if err := s.ensureEmailAvailable(ctx, email); err != nil {
		return nil, err
	}
	if _, err := s.registerRole(ctx); err != nil {
		return nil, err
	}
	if err := s.ensureRegisterEmailCodeSendAllowed(ctx, email, ip); err != nil {
		return nil, err
	}
	if s.rdb == nil {
		return nil, errors.New("auth: redis not configured")
	}

	code, err := generateEmailCode()
	if err != nil {
		return nil, err
	}
	valueKey, cooldownKey, emailRateKey, ipRateKey := registerEmailCodeKeys(email, ip)
	if err := s.rdb.Set(ctx, valueKey, code, registerEmailCodeTTL).Err(); err != nil {
		return nil, err
	}
	if err := s.rdb.Set(ctx, cooldownKey, "1", registerEmailCodeCooldownTTL).Err(); err != nil {
		_, _ = s.rdb.Del(ctx, valueKey).Result()
		return nil, err
	}
	subject, html := mailer.RenderRegisterEmailCode(s.siteName(), email, code, registerEmailCodeTTL)
	if err := s.mail.SendSync(mailer.Message{To: email, Subject: subject, HTML: html}); err != nil {
		_, _ = s.rdb.Del(ctx, valueKey, cooldownKey).Result()
		return nil, ErrEmailCodeSendFailed
	}
	_ = s.bumpRegisterEmailCodeRate(ctx, emailRateKey)
	_ = s.bumpRegisterEmailCodeRate(ctx, ipRateKey)
	return &sendRegisterEmailCodeResult{
		Sent:          true,
		ExpireSec:     int(registerEmailCodeTTL / time.Second),
		RetryAfterSec: int(registerEmailCodeCooldownTTL / time.Second),
	}, nil
}

// Register 新用户注册。
func (s *Service) Register(ctx context.Context, email, password, nickname, emailCode string) (*user.User, error) {
	email = normalizeEmail(email)
	nickname = normalizeNickname(nickname)
	emailCode = normalizeEmailCode(emailCode)
	if email == "" || password == "" {
		return nil, errors.New("email and password required")
	}

	// 动态密码长度阈值(默认 6);>0 才检查,避免 settings 未初始化时把所有注册阻塞
	if s.settings != nil {
		if min := s.settings.PasswordMinLength(); min > 0 && len(password) < min {
			return nil, ErrPasswordTooShort
		}
	}
	if err := s.ensureEmailAllowed(email); err != nil {
		return nil, err
	}

	if err := s.ensureEmailAvailable(ctx, email); err != nil {
		return nil, err
	}

	role, err := s.registerRole(ctx)
	if err != nil {
		return nil, err
	}
	if s.settings != nil && s.settings.RequireEmailVerify() {
		if emailCode == "" {
			return nil, ErrEmailCodeRequired
		}
		if err := s.verifyAndConsumeRegisterEmailCode(ctx, email, emailCode); err != nil {
			return nil, err
		}
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), s.bcryptCost)
	if err != nil {
		return nil, err
	}

	var groupID uint64 = 1
	if s.settings != nil {
		if g := s.settings.DefaultGroupID(); g > 0 {
			groupID = g
		}
	}

	u := &user.User{
		Email:         email,
		PasswordHash:  string(hash),
		Nickname:      nickname,
		GroupID:       groupID,
		Role:          role,
		Status:        "active",
		CreditBalance: 0,
	}
	id, err := s.users.Create(ctx, u)
	if err != nil {
		return nil, err
	}
	u.ID = id

	// 注册赠送积分(失败不阻断注册流程,仅打日志)
	if s.settings != nil && s.billing != nil {
		if bonus := s.settings.SignupBonusCredits(); bonus > 0 {
			_, _ = s.billing.AdminAdjust(ctx, u.ID, 0, bonus, "signup_bonus", "auto grant on register")
		}
	}

	// 欢迎邮件(可选,失败不影响注册)
	if s.mail != nil && !s.mail.Disabled() {
		subject, html := mailer.RenderWelcome(u.Nickname, u.Email, s.baseURL)
		s.mail.Send(mailer.Message{To: u.Email, Subject: subject, HTML: html})
	}
	return u, nil
}

// Login 校验邮箱密码并签发 token。
func (s *Service) Login(ctx context.Context, email, password, ip string) (*user.User, *pkgjwt.TokenPair, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	u, err := s.users.GetByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, user.ErrNotFound) {
			return nil, nil, ErrInvalidCredential
		}
		return nil, nil, err
	}
	if u.Status == "banned" {
		return nil, nil, ErrUserBanned
	}
	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)); err != nil {
		return nil, nil, ErrInvalidCredential
	}
	pair, err := s.jwt.Issue(u.ID, u.Role)
	if err != nil {
		return nil, nil, err
	}
	_ = s.users.UpdateLoginInfo(ctx, u.ID, ip)
	return u, pair, nil
}

// HashPassword 对外暴露 bcrypt 哈希(cost 由 service 持有),admin 重置密码走这里。
func (s *Service) HashPassword(plain string) (string, error) {
	min := 6
	if s.settings != nil {
		if v := s.settings.PasswordMinLength(); v > 0 {
			min = v
		}
	}
	if len(plain) < min {
		return "", ErrPasswordTooShort
	}
	h, err := bcrypt.GenerateFromPassword([]byte(plain), s.bcryptCost)
	if err != nil {
		return "", err
	}
	return string(h), nil
}

// VerifyPassword 校验指定 user 的明文密码是否正确(不签发 token)。
// 主要用于"高危操作二次确认"场景(如恢复数据库、调整积分)。
// 正确返回 nil;错误返回 ErrInvalidCredential / ErrUserBanned 等。
func (s *Service) VerifyPassword(ctx context.Context, userID uint64, password string) error {
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		if errors.Is(err, user.ErrNotFound) {
			return ErrInvalidCredential
		}
		return err
	}
	if u.Status == "banned" {
		return ErrUserBanned
	}
	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)); err != nil {
		return ErrInvalidCredential
	}
	return nil
}

// Refresh 用 refresh_token 换新的 access_token 对。
func (s *Service) Refresh(ctx context.Context, refreshToken string) (*pkgjwt.TokenPair, error) {
	claims, err := s.jwt.VerifyRefresh(refreshToken)
	if err != nil {
		return nil, err
	}
	u, err := s.users.GetByID(ctx, claims.UserID)
	if err != nil {
		return nil, err
	}
	if u.Status == "banned" {
		return nil, ErrUserBanned
	}
	return s.jwt.Issue(u.ID, u.Role)
}

func (s *Service) ensureEmailAllowed(email string) error {
	if s.settings == nil {
		return nil
	}
	if wl := s.settings.EmailDomainWhitelist(); len(wl) > 0 {
		at := strings.LastIndex(email, "@")
		if at < 0 {
			return ErrEmailNotAllowed
		}
		if _, ok := wl[email[at+1:]]; !ok {
			return ErrEmailNotAllowed
		}
	}
	return nil
}

func (s *Service) ensureEmailAvailable(ctx context.Context, email string) error {
	n, err := s.users.CountByEmail(ctx, email)
	if err != nil {
		return err
	}
	if n > 0 {
		return ErrEmailExists
	}
	return nil
}

func (s *Service) registerRole(ctx context.Context) (string, error) {
	total, err := s.users.CountAll(ctx)
	if err != nil {
		return "", err
	}
	if total == 0 {
		return "admin", nil
	}
	if s.settings != nil && !s.settings.AllowRegister() {
		return "", ErrRegisterDisabled
	}
	return "user", nil
}

func (s *Service) ensureRegisterEmailCodeSendAllowed(ctx context.Context, email, ip string) error {
	if s.rdb == nil {
		return errors.New("auth: redis not configured")
	}
	_, cooldownKey, emailRateKey, ipRateKey := registerEmailCodeKeys(email, ip)
	if ttlSec, err := s.redisTTLSeconds(ctx, cooldownKey, registerEmailCodeCooldownTTL); err != nil {
		return err
	} else if ttlSec > 0 {
		return &retryAfterError{cause: ErrEmailCodeCooldown, retryAfterSec: ttlSec}
	}
	if count, err := s.redisCounter(ctx, emailRateKey); err != nil {
		return err
	} else if count >= registerEmailCodeEmailLimit {
		ttlSec, ttlErr := s.redisTTLSeconds(ctx, emailRateKey, registerEmailCodeRateWindow)
		if ttlErr != nil {
			return ttlErr
		}
		return &retryAfterError{cause: ErrEmailCodeRateLimited, retryAfterSec: ttlSec}
	}
	if count, err := s.redisCounter(ctx, ipRateKey); err != nil {
		return err
	} else if count >= registerEmailCodeIPLimit {
		ttlSec, ttlErr := s.redisTTLSeconds(ctx, ipRateKey, registerEmailCodeRateWindow)
		if ttlErr != nil {
			return ttlErr
		}
		return &retryAfterError{cause: ErrEmailCodeRateLimited, retryAfterSec: ttlSec}
	}
	return nil
}

func (s *Service) verifyAndConsumeRegisterEmailCode(ctx context.Context, email, code string) error {
	if s.rdb == nil {
		return errors.New("auth: redis not configured")
	}
	valueKey, _, _, _ := registerEmailCodeKeys(email, "")
	res, err := consumeRegisterEmailCodeScript.Run(ctx, s.rdb, []string{valueKey}, code).Result()
	if err != nil {
		return err
	}
	switch v := res.(type) {
	case int64:
		if v == 1 {
			return nil
		}
	case string:
		if v == "1" {
			return nil
		}
	}
	return ErrEmailCodeInvalidOrExpired
}

func (s *Service) bumpRegisterEmailCodeRate(ctx context.Context, key string) error {
	n, err := s.rdb.Incr(ctx, key).Result()
	if err != nil {
		return err
	}
	if ttl, ttlErr := s.rdb.TTL(ctx, key).Result(); ttlErr == nil && ttl <= 0 {
		return s.rdb.Expire(ctx, key, registerEmailCodeRateWindow).Err()
	}
	if n == 1 {
		return s.rdb.Expire(ctx, key, registerEmailCodeRateWindow).Err()
	}
	return nil
}

func (s *Service) redisCounter(ctx context.Context, key string) (int64, error) {
	if s.rdb == nil {
		return 0, errors.New("auth: redis not configured")
	}
	n, err := s.rdb.Get(ctx, key).Int64()
	if errors.Is(err, redis.Nil) {
		return 0, nil
	}
	return n, err
}

func (s *Service) redisTTLSeconds(ctx context.Context, key string, fallback time.Duration) (int, error) {
	if s.rdb == nil {
		return 0, errors.New("auth: redis not configured")
	}
	ttl, err := s.rdb.TTL(ctx, key).Result()
	if err != nil {
		return 0, err
	}
	if ttl == -2*time.Nanosecond {
		return 0, nil
	}
	if ttl <= 0 {
		ttl = fallback
	}
	return int((ttl + time.Second - 1) / time.Second), nil
}

func (s *Service) siteName() string {
	if s.settings == nil {
		return "GPT2API"
	}
	return s.settings.SiteName()
}

func registerEmailCodeKeys(email, ip string) (valueKey, cooldownKey, emailRateKey, ipRateKey string) {
	valueKey = "auth:register:email_code:value:" + email
	cooldownKey = "auth:register:email_code:cooldown:" + email
	emailRateKey = "auth:register:email_code:rate:email:" + email
	ipRateKey = "auth:register:email_code:rate:ip:" + strings.TrimSpace(ip)
	return
}

func normalizeEmail(v string) string    { return strings.ToLower(strings.TrimSpace(v)) }
func normalizeNickname(v string) string { return strings.TrimSpace(v) }
func normalizeEmailCode(v string) string {
	return strings.TrimSpace(v)
}

func generateEmailCode() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return "", fmt.Errorf("generate email code: %w", err)
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}
