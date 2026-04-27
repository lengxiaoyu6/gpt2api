package gateway

import (
	"context"
	"strings"
	"testing"
	"time"

	miniredis "github.com/alicebob/miniredis/v2"
	"github.com/jmoiron/sqlx"
	"github.com/redis/go-redis/v9"

	"github.com/432539/gpt2api/internal/account"
	"github.com/432539/gpt2api/internal/config"
	modelpkg "github.com/432539/gpt2api/internal/model"
	"github.com/432539/gpt2api/internal/proxy"
	"github.com/432539/gpt2api/internal/scheduler"
	"github.com/432539/gpt2api/internal/upstream/chatgpt"
	cryptopkg "github.com/432539/gpt2api/pkg/crypto"
	"github.com/432539/gpt2api/pkg/lock"

	_ "github.com/mattn/go-sqlite3"
)

func TestChatProxyFailureDeductsHealthOnce(t *testing.T) {
	deps := newChatProxyFailureTestDeps(t)
	ctx := context.Background()

	lease, err := deps.sched.Dispatch(ctx, modelpkg.TypeChat)
	if err != nil {
		t.Fatalf("dispatch: %v", err)
	}
	defer func() { _ = lease.Release(context.Background()) }()

	proxyErr := assertChatProxyFailureMarked(t, ctx, lease)
	if proxyErr == nil {
		t.Fatal("proxy failure helper returned nil")
	}
	if err := markProxyFailureIfNeeded(ctx, lease, proxyErr); err != nil {
		t.Fatalf("second mark proxy failure: %v", err)
	}

	score, lastErr := deps.proxyHealth(t, 1)
	if score != 80 {
		t.Fatalf("health_score = %d, want 80", score)
	}
	if !strings.Contains(lastErr, "dial proxy") {
		t.Fatalf("last_error = %q, want contains %q", lastErr, "dial proxy")
	}
}

func TestChatBusinessFailureDoesNotDeductProxyHealth(t *testing.T) {
	deps := newChatProxyFailureTestDeps(t)
	ctx := context.Background()

	lease, err := deps.sched.Dispatch(ctx, modelpkg.TypeChat)
	if err != nil {
		t.Fatalf("dispatch: %v", err)
	}
	defer func() { _ = lease.Release(context.Background()) }()

	upstreamErr := &chatgpt.UpstreamError{Status: 429, Message: "chat-requirements failed"}
	if err := markProxyFailureIfNeeded(ctx, lease, upstreamErr); err != nil {
		t.Fatalf("mark proxy failure: %v", err)
	}

	score, lastErr := deps.proxyHealth(t, 1)
	if score != 100 {
		t.Fatalf("health_score = %d, want 100", score)
	}
	if lastErr != "" {
		t.Fatalf("last_error = %q, want empty", lastErr)
	}
}

func assertChatProxyFailureMarked(t *testing.T, ctx context.Context, lease *scheduler.Lease) error {
	t.Helper()

	proxyErr := context.DeadlineExceeded
	proxyErr = &proxyTransportErr{msg: "dial proxy 127.0.0.1:8080: connect: connection refused"}
	if err := markProxyFailureIfNeeded(ctx, lease, proxyErr); err != nil {
		t.Fatalf("first mark proxy failure: %v", err)
	}
	return proxyErr
}

type chatProxyFailureTestDeps struct {
	db     *sqlx.DB
	cipher *cryptopkg.AESGCM
	sched  *scheduler.Scheduler
}

func newChatProxyFailureTestDeps(t *testing.T) *chatProxyFailureTestDeps {
	t.Helper()

	db := sqlx.MustOpen("sqlite3", ":memory:")
	t.Cleanup(func() { _ = db.Close() })

	for _, stmt := range []string{
		`CREATE TABLE oai_accounts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			email TEXT NOT NULL,
			auth_token_enc TEXT NOT NULL,
			token_expires_at DATETIME NULL,
			oai_session_id TEXT NOT NULL DEFAULT '',
			oai_device_id TEXT NOT NULL DEFAULT '',
			daily_image_quota INTEGER NOT NULL DEFAULT 100,
			status TEXT NOT NULL DEFAULT 'healthy',
			cooldown_until DATETIME NULL,
			last_used_at DATETIME NULL,
			today_used_count INTEGER NOT NULL DEFAULT 0,
			today_used_date DATETIME NULL,
			notes TEXT NOT NULL DEFAULT '',
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			deleted_at DATETIME NULL
		)`,
		`CREATE TABLE proxies (
			id INTEGER PRIMARY KEY,
			scheme TEXT NOT NULL DEFAULT 'http',
			host TEXT NOT NULL,
			port INTEGER NOT NULL,
			username TEXT NOT NULL DEFAULT '',
			password_enc TEXT NOT NULL DEFAULT '',
			country TEXT NOT NULL DEFAULT '',
			isp TEXT NOT NULL DEFAULT '',
			health_score INTEGER NOT NULL DEFAULT 100,
			last_probe_at DATETIME NULL,
			last_used_at DATETIME NULL,
			last_error TEXT NOT NULL DEFAULT '',
			enabled INTEGER NOT NULL DEFAULT 1,
			remark TEXT NOT NULL DEFAULT '',
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			deleted_at DATETIME NULL
		)`,
		`CREATE TABLE account_proxy_bindings (
			account_id INTEGER PRIMARY KEY,
			proxy_id INTEGER NOT NULL,
			bound_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
	} {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatalf("create test schema: %v", err)
		}
	}

	cipher, err := cryptopkg.NewAESGCM("00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff")
	if err != nil {
		t.Fatalf("new cipher: %v", err)
	}
	tokenEnc, err := cipher.EncryptString("test-auth-token")
	if err != nil {
		t.Fatalf("encrypt token: %v", err)
	}
	if _, err := db.Exec(
		`INSERT INTO oai_accounts
			(email, auth_token_enc, token_expires_at, oai_session_id, oai_device_id, daily_image_quota, status, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, 100, 'healthy', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
		"chat-proxy@example.com", tokenEnc, time.Now().Add(24*time.Hour), "session-chat", "device-chat",
	); err != nil {
		t.Fatalf("insert account: %v", err)
	}
	if _, err := db.Exec(
		`INSERT INTO proxies
			(id, scheme, host, port, health_score, enabled, created_at, updated_at)
		 VALUES (1, 'http', 'runtime-proxy.local', 8080, 100, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
	); err != nil {
		t.Fatalf("insert proxy: %v", err)
	}

	mr := miniredis.RunT(t)
	redisClient := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = redisClient.Close() })
	redisLock := lock.NewRedisLock(redisClient)

	accSvc := account.NewService(account.NewDAO(db), cipher)
	proxySvc := proxy.NewService(proxy.NewDAO(db), nil)
	sched := scheduler.New(accSvc, proxySvc, redisLock, config.SchedulerConfig{
		MinIntervalSec:   1,
		DailyUsageRatio:  1,
		LockTTLSec:       60,
		Cooldown429Sec:   60,
		WarnedPauseHours: 1,
	})
	sched.SetRuntime(scheduler.RuntimeParams{QueueWaitSec: func() int { return 0 }})

	return &chatProxyFailureTestDeps{db: db, cipher: cipher, sched: sched}
}

func (d *chatProxyFailureTestDeps) proxyHealth(t *testing.T, proxyID uint64) (int, string) {
	t.Helper()

	var row struct {
		HealthScore int    `db:"health_score"`
		LastError   string `db:"last_error"`
	}
	if err := d.db.Get(&row, `SELECT health_score, last_error FROM proxies WHERE id = ?`, proxyID); err != nil {
		t.Fatalf("select proxy health: %v", err)
	}
	return row.HealthScore, row.LastError
}

type proxyTransportErr struct {
	msg string
}

func (e *proxyTransportErr) Error() string { return e.msg }
