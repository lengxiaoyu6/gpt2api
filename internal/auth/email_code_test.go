package auth_test

import (
	"bufio"
	"bytes"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
	"unsafe"

	miniredis "github.com/alicebob/miniredis/v2"
	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
	_ "github.com/mattn/go-sqlite3"
	"github.com/redis/go-redis/v9"
	gozap "go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"

	"github.com/432539/gpt2api/internal/auth"
	"github.com/432539/gpt2api/internal/config"
	"github.com/432539/gpt2api/internal/server"
	"github.com/432539/gpt2api/internal/settings"
	"github.com/432539/gpt2api/internal/user"
	pkgjwt "github.com/432539/gpt2api/pkg/jwt"
	"github.com/432539/gpt2api/pkg/mailer"
	"github.com/432539/gpt2api/pkg/resp"
)

type testEnv struct {
	t      *testing.T
	app    http.Handler
	db     *sqlx.DB
	redis  *miniredis.Miniredis
	client *redis.Client
	mail   *mailer.Mailer
	smtp   *fakeSMTPServer
}

func newTestEnv(t *testing.T, settingValues map[string]string, withRedis bool, withMail bool) *testEnv {
	t.Helper()
	gin.SetMode(gin.TestMode)

	db := sqlx.MustOpen("sqlite3", ":memory:")
	t.Cleanup(func() { _ = db.Close() })
	mustExec(t, db, `
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nickname TEXT NOT NULL DEFAULT '',
  group_id INTEGER NOT NULL DEFAULT 1,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  credit_balance INTEGER NOT NULL DEFAULT 0,
  credit_frozen INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  last_login_ip TEXT NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL
);
`)

	userDAO := user.NewDAO(db)
	jwtManager := pkgjwt.NewManager(pkgjwt.Config{Secret: "test-secret", Issuer: "test", AccessTTLSec: 3600, RefreshTTLSec: 86400})
	authSvc := auth.NewService(userDAO, jwtManager, bcrypt.MinCost)

	settingsSvc := settings.NewService(nil)
	cache := map[string]string{
		settings.AuthAllowRegister:      "true",
		settings.AuthRequireEmailVerify: "false",
		settings.AuthPasswordMinLength:  "6",
		settings.AuthDefaultGroupID:     "1",
	}
	for k, v := range settingValues {
		cache[k] = v
	}
	setSettingsCache(settingsSvc, cache)
	authSvc.SetSettings(settingsSvc)

	env := &testEnv{t: t, db: db}
	if withRedis {
		mr := miniredis.RunT(t)
		rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
		t.Cleanup(func() { _ = rdb.Close() })
		setStructFieldIfPresent(authSvc, "rdb", rdb)
		env.redis = mr
		env.client = rdb
	}
	if withMail {
		smtpSrv := startFakeSMTPServer(t)
		host, port := smtpSrv.hostPort(t)
		mailSvc := mailer.New(mailer.Config{
			Host:     host,
			Port:     port,
			Username: "mailer@example.test",
			Password: "secret",
			From:     "noreply@example.test",
			FromName: "GPT2API Test",
			UseTLS:   false,
		}, gozap.NewNop())
		t.Cleanup(func() { mailSvc.Close() })
		authSvc.SetMailer(mailSvc, "https://console.example.test")
		env.mail = mailSvc
		env.smtp = smtpSrv
	}

	settingsH := settings.NewHandler(settingsSvc, nil, nil)
	authH := auth.NewHandler(authSvc)
	env.app = server.New(&server.Deps{
		Config:    &config.Config{},
		AuthH:     authH,
		SettingsH: settingsH,
	})
	return env
}

func TestRegisterRequiresEmailCodeWhenVerificationEnabled(t *testing.T) {
	env := newTestEnv(t, map[string]string{
		settings.AuthRequireEmailVerify: "true",
	}, false, false)

	res := env.postJSON("/api/auth/register", map[string]any{
		"email":    "demo@example.com",
		"password": "secret123",
		"nickname": "Demo",
	})
	assertBody(t, res, http.StatusOK, resp.CodeBadRequest, "email verification code is required")
}

func TestSendRegisterEmailCodeDisabledWhenVerificationSwitchOff(t *testing.T) {
	env := newTestEnv(t, map[string]string{
		settings.AuthRequireEmailVerify: "false",
	}, false, false)

	res := env.postJSON("/api/auth/email-code/send", map[string]any{
		"email": "demo@example.com",
	})
	assertBody(t, res, http.StatusOK, resp.CodeBadRequest, "email verification is disabled")
}

func TestSendRegisterEmailCodeThenRegisterWithCode(t *testing.T) {
	env := newTestEnv(t, map[string]string{
		settings.AuthRequireEmailVerify: "true",
		settings.MailSMTPEnabled:        "true",
		settings.MailSMTPHost:           "smtp.example.test",
	}, true, true)

	sendRes := env.postJSON("/api/auth/email-code/send", map[string]any{
		"email": "demo@example.com",
	})
	body := assertBody(t, sendRes, http.StatusOK, resp.CodeOK, "ok")
	data, _ := body.Data.(map[string]any)
	if got := int(data["expire_sec"].(float64)); got != 600 {
		t.Fatalf("expire_sec = %d", got)
	}
	if got := int(data["retry_after_sec"].(float64)); got != 60 {
		t.Fatalf("retry_after_sec = %d", got)
	}

	code := env.smtp.waitForCode(t)
	registerRes := env.postJSON("/api/auth/register", map[string]any{
		"email":      "demo@example.com",
		"password":   "secret123",
		"nickname":   "Demo",
		"email_code": code,
	})
	body = assertBody(t, registerRes, http.StatusOK, resp.CodeOK, "ok")
	userData, _ := body.Data.(map[string]any)
	if got := userData["email"].(string); got != "demo@example.com" {
		t.Fatalf("registered email = %q", got)
	}
}

func TestSendRegisterEmailCodeCooldownReturnsRetryAfter(t *testing.T) {
	env := newTestEnv(t, map[string]string{
		settings.AuthRequireEmailVerify: "true",
		settings.MailSMTPEnabled:        "true",
		settings.MailSMTPHost:           "smtp.example.test",
	}, true, true)

	first := env.postJSON("/api/auth/email-code/send", map[string]any{"email": "demo@example.com"})
	assertBody(t, first, http.StatusOK, resp.CodeOK, "ok")

	second := env.postJSON("/api/auth/email-code/send", map[string]any{"email": "demo@example.com"})
	body := assertBody(t, second, http.StatusTooManyRequests, resp.CodeRateLimited, "email code requested too frequently")
	data, _ := body.Data.(map[string]any)
	if data == nil {
		t.Fatal("expected retry_after_sec in response data")
	}
	if got := int(data["retry_after_sec"].(float64)); got < 1 || got > 60 {
		t.Fatalf("retry_after_sec = %d", got)
	}
}

func TestRegisterRejectsInvalidEmailVerificationCode(t *testing.T) {
	env := newTestEnv(t, map[string]string{
		settings.AuthRequireEmailVerify: "true",
		settings.MailSMTPEnabled:        "true",
		settings.MailSMTPHost:           "smtp.example.test",
	}, true, true)

	sendRes := env.postJSON("/api/auth/email-code/send", map[string]any{"email": "demo@example.com"})
	assertBody(t, sendRes, http.StatusOK, resp.CodeOK, "ok")

	registerRes := env.postJSON("/api/auth/register", map[string]any{
		"email":      "demo@example.com",
		"password":   "secret123",
		"nickname":   "Demo",
		"email_code": "000000",
	})
	assertBody(t, registerRes, http.StatusOK, resp.CodeBadRequest, "invalid or expired email verification code")
}

func (e *testEnv) postJSON(path string, payload map[string]any) *httptest.ResponseRecorder {
	e.t.Helper()
	buf, err := json.Marshal(payload)
	if err != nil {
		e.t.Fatalf("marshal payload: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(buf))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	e.app.ServeHTTP(w, req)
	return w
}

func assertBody(t *testing.T, w *httptest.ResponseRecorder, wantStatus int, wantCode int, wantMessage string) resp.Body {
	t.Helper()
	if w.Code != wantStatus {
		t.Fatalf("status = %d, want %d, body=%s", w.Code, wantStatus, w.Body.String())
	}
	var body resp.Body
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v, body=%s", err, w.Body.String())
	}
	if body.Code != wantCode {
		t.Fatalf("code = %d, want %d, body=%s", body.Code, wantCode, w.Body.String())
	}
	if body.Message != wantMessage {
		t.Fatalf("message = %q, want %q, body=%s", body.Message, wantMessage, w.Body.String())
	}
	return body
}

func mustExec(t *testing.T, db *sqlx.DB, query string) {
	t.Helper()
	if _, err := db.Exec(query); err != nil {
		t.Fatalf("exec schema: %v", err)
	}
}

func setSettingsCache(svc *settings.Service, values map[string]string) {
	setStructFieldIfPresent(svc, "cache", values)
}

func setStructFieldIfPresent(target any, fieldName string, value any) {
	v := reflect.ValueOf(target)
	if v.Kind() != reflect.Pointer || v.IsNil() {
		return
	}
	field := v.Elem().FieldByName(fieldName)
	if !field.IsValid() {
		return
	}
	next := reflect.ValueOf(value)
	if !next.Type().AssignableTo(field.Type()) {
		return
	}
	reflect.NewAt(field.Type(), unsafe.Pointer(field.UnsafeAddr())).Elem().Set(next)
}

type fakeSMTPServer struct {
	listener net.Listener
	mu       sync.Mutex
	messages []string
}

func startFakeSMTPServer(t *testing.T) *fakeSMTPServer {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen smtp: %v", err)
	}
	s := &fakeSMTPServer{listener: ln}
	go s.serve(t)
	t.Cleanup(func() { _ = ln.Close() })
	return s
}

func (s *fakeSMTPServer) hostPort(t *testing.T) (string, int) {
	t.Helper()
	host, portText, err := net.SplitHostPort(s.listener.Addr().String())
	if err != nil {
		t.Fatalf("split host port: %v", err)
	}
	port, err := strconv.Atoi(portText)
	if err != nil {
		t.Fatalf("parse port: %v", err)
	}
	return host, port
}

func (s *fakeSMTPServer) waitForCode(t *testing.T) string {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		s.mu.Lock()
		var joined string
		if len(s.messages) > 0 {
			joined = strings.Join(s.messages, "\n")
		}
		s.mu.Unlock()
		if joined != "" {
			re := regexp.MustCompile(`\b\d{6}\b`)
			if code := re.FindString(joined); code != "" {
				return code
			}
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("verification code not received")
	return ""
}

func (s *fakeSMTPServer) serve(t *testing.T) {
	for {
		conn, err := s.listener.Accept()
		if err != nil {
			if isClosedNetworkError(err) {
				return
			}
			t.Logf("accept smtp: %v", err)
			return
		}
		go s.handleConn(t, conn)
	}
}

func (s *fakeSMTPServer) handleConn(t *testing.T, conn net.Conn) {
	defer conn.Close()
	reader := bufio.NewReader(conn)
	writer := bufio.NewWriter(conn)
	writeLine := func(line string) bool {
		if _, err := writer.WriteString(line + "\r\n"); err != nil {
			return false
		}
		return writer.Flush() == nil
	}
	if !writeLine("220 fake-smtp ESMTP") {
		return
	}
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			if err != io.EOF {
				t.Logf("smtp read command: %v", err)
			}
			return
		}
		cmd := strings.TrimSpace(line)
		switch {
		case strings.HasPrefix(strings.ToUpper(cmd), "EHLO"), strings.HasPrefix(strings.ToUpper(cmd), "HELO"):
			if _, err := writer.WriteString("250-fake-smtp\r\n250-AUTH PLAIN\r\n250 OK\r\n"); err != nil {
				return
			}
			if err := writer.Flush(); err != nil {
				return
			}
		case strings.HasPrefix(strings.ToUpper(cmd), "AUTH PLAIN"):
			if !writeLine("235 2.7.0 Authentication successful") {
				return
			}
		case strings.HasPrefix(strings.ToUpper(cmd), "MAIL FROM:"), strings.HasPrefix(strings.ToUpper(cmd), "RCPT TO:"):
			if !writeLine("250 OK") {
				return
			}
		case strings.EqualFold(cmd, "DATA"):
			if !writeLine("354 End data with <CR><LF>.<CR><LF>") {
				return
			}
			msg, err := readSMTPData(reader)
			if err != nil {
				t.Logf("smtp read data: %v", err)
				return
			}
			s.mu.Lock()
			s.messages = append(s.messages, msg)
			s.mu.Unlock()
			if !writeLine("250 2.0.0 queued") {
				return
			}
		case strings.EqualFold(cmd, "QUIT"):
			writeLine("221 Bye")
			return
		default:
			if !writeLine("250 OK") {
				return
			}
		}
	}
}

func readSMTPData(reader *bufio.Reader) (string, error) {
	var buf strings.Builder
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			return "", err
		}
		trimmed := strings.TrimRight(line, "\r\n")
		if trimmed == "." {
			return buf.String(), nil
		}
		buf.WriteString(line)
	}
}

func isClosedNetworkError(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "use of closed network connection")
}
