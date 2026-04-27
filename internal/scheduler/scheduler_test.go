package scheduler

import (
	"context"
	"database/sql"
	"testing"
	"time"

	miniredis "github.com/alicebob/miniredis/v2"
	"github.com/jmoiron/sqlx"
	"github.com/redis/go-redis/v9"

	"github.com/432539/gpt2api/internal/account"
	"github.com/432539/gpt2api/internal/config"
	"github.com/432539/gpt2api/internal/model"
	"github.com/432539/gpt2api/internal/proxy"
	cryptopkg "github.com/432539/gpt2api/pkg/crypto"
	"github.com/432539/gpt2api/pkg/lock"

	_ "github.com/mattn/go-sqlite3"
)

func TestDispatchUsesTemporaryProxyForChatAndImage(t *testing.T) {
	deps := newSchedulerTestDeps(t)
	ctx := context.Background()

	accountID := deps.mustInsertAccount(t, schedulerTestAccountRow{
		Email:          "runtime@example.com",
		OAIDeviceID:    "device-runtime",
		OAISessionID:   "session-runtime",
		TokenExpiresAt: time.Now().Add(24 * time.Hour),
	})
	deps.mustInsertProxy(t, schedulerTestProxyRow{
		ID:      11,
		Scheme:  "http",
		Host:    "persistent.local",
		Port:    8080,
		Health:  10,
		Enabled: true,
	})
	deps.mustInsertProxy(t, schedulerTestProxyRow{
		ID:      22,
		Scheme:  "http",
		Host:    "temporary.local",
		Port:    9090,
		Health:  100,
		Enabled: true,
	})
	deps.mustBindProxy(t, accountID, 11)

	chatLease, err := deps.sched.Dispatch(ctx, model.TypeChat)
	if err != nil {
		t.Fatalf("dispatch chat: %v", err)
	}
	if chatLease.ProxyID != 22 {
		t.Fatalf("chat proxy id = %d, want 22", chatLease.ProxyID)
	}
	if chatLease.ProxyURL != "http://temporary.local:9090" {
		t.Fatalf("chat proxy url = %q", chatLease.ProxyURL)
	}
	if err := chatLease.Release(ctx); err != nil {
		t.Fatalf("release chat lease: %v", err)
	}

	deps.resetAccountLastUsed(t, accountID)

	imageLease, err := deps.sched.Dispatch(ctx, model.TypeImage)
	if err != nil {
		t.Fatalf("dispatch image: %v", err)
	}
	if imageLease.ProxyID != 22 {
		t.Fatalf("image proxy id = %d, want 22", imageLease.ProxyID)
	}
	if imageLease.ProxyURL != "http://temporary.local:9090" {
		t.Fatalf("image proxy url = %q", imageLease.ProxyURL)
	}
	if err := imageLease.Release(ctx); err != nil {
		t.Fatalf("release image lease: %v", err)
	}
}

func TestDispatchKeepsPersistentBindingForNonRuntimeTypes(t *testing.T) {
	deps := newSchedulerTestDeps(t)
	ctx := context.Background()

	accountID := deps.mustInsertAccount(t, schedulerTestAccountRow{
		Email:          "refresh@example.com",
		OAIDeviceID:    "device-refresh",
		OAISessionID:   "session-refresh",
		TokenExpiresAt: time.Now().Add(24 * time.Hour),
	})
	deps.mustInsertProxy(t, schedulerTestProxyRow{
		ID:      11,
		Scheme:  "http",
		Host:    "persistent.local",
		Port:    8080,
		Health:  10,
		Enabled: true,
	})
	deps.mustInsertProxy(t, schedulerTestProxyRow{
		ID:      22,
		Scheme:  "http",
		Host:    "temporary.local",
		Port:    9090,
		Health:  100,
		Enabled: true,
	})
	deps.mustBindProxy(t, accountID, 11)

	lease, err := deps.sched.Dispatch(ctx, "refresh")
	if err != nil {
		t.Fatalf("dispatch refresh: %v", err)
	}
	if lease.ProxyID != 11 {
		t.Fatalf("refresh proxy id = %d, want 11", lease.ProxyID)
	}
	if lease.ProxyURL != "http://persistent.local:8080" {
		t.Fatalf("refresh proxy url = %q", lease.ProxyURL)
	}
	if err := lease.Release(ctx); err != nil {
		t.Fatalf("release refresh lease: %v", err)
	}
}

type schedulerTestDeps struct {
	db      *sqlx.DB
	cipher  *cryptopkg.AESGCM
	accDAO  *account.DAO
	proxyDAO *proxy.DAO
	sched   *Scheduler
}

type schedulerTestAccountRow struct {
	Email          string
	OAIDeviceID    string
	OAISessionID   string
	TokenExpiresAt time.Time
}

type schedulerTestProxyRow struct {
	ID         uint64
	Scheme     string
	Host       string
	Port       int
	Health     int
	Enabled    bool
	LastUsedAt sql.NullTime
}

func newSchedulerTestDeps(t *testing.T) *schedulerTestDeps {
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

	mr := miniredis.RunT(t)
	redisClient := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = redisClient.Close() })
	redisLock := lock.NewRedisLock(redisClient)

	accDAO := account.NewDAO(db)
	proxyDAO := proxy.NewDAO(db)
	accSvc := account.NewService(accDAO, cipher)
	proxySvc := proxy.NewService(proxyDAO, nil)

	sched := New(accSvc, proxySvc, redisLock, config.SchedulerConfig{
		MinIntervalSec:   1,
		DailyUsageRatio:  1,
		LockTTLSec:       60,
		Cooldown429Sec:   60,
		WarnedPauseHours: 1,
	})
	sched.cfg.MinIntervalSec = 0
	sched.SetRuntime(RuntimeParams{QueueWaitSec: func() int { return 0 }})

	return &schedulerTestDeps{
		db:       db,
		cipher:   cipher,
		accDAO:   accDAO,
		proxyDAO: proxyDAO,
		sched:    sched,
	}
}

func (d *schedulerTestDeps) mustInsertAccount(t *testing.T, row schedulerTestAccountRow) uint64 {
	t.Helper()

	tokenEnc, err := d.cipher.EncryptString("test-auth-token")
	if err != nil {
		t.Fatalf("encrypt token: %v", err)
	}
	res, err := d.db.Exec(
		`INSERT INTO oai_accounts
			(email, auth_token_enc, token_expires_at, oai_session_id, oai_device_id, daily_image_quota, status, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, 100, 'healthy', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
		row.Email, tokenEnc, row.TokenExpiresAt, row.OAISessionID, row.OAIDeviceID,
	)
	if err != nil {
		t.Fatalf("insert account: %v", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		t.Fatalf("account last insert id: %v", err)
	}
	return uint64(id)
}

func (d *schedulerTestDeps) mustInsertProxy(t *testing.T, row schedulerTestProxyRow) {
	t.Helper()

	var lastUsed any
	if row.LastUsedAt.Valid {
		lastUsed = row.LastUsedAt.Time
	}
	if _, err := d.db.Exec(
		`INSERT INTO proxies
			(id, scheme, host, port, health_score, enabled, last_used_at, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
		row.ID, row.Scheme, row.Host, row.Port, row.Health, schedulerBoolToInt(row.Enabled), lastUsed,
	); err != nil {
		t.Fatalf("insert proxy: %v", err)
	}
}

func (d *schedulerTestDeps) mustBindProxy(t *testing.T, accountID, proxyID uint64) {
	t.Helper()

	if _, err := d.db.Exec(
		`INSERT INTO account_proxy_bindings (account_id, proxy_id, bound_at) VALUES (?, ?, CURRENT_TIMESTAMP)`,
		accountID, proxyID,
	); err != nil {
		t.Fatalf("bind proxy: %v", err)
	}
}

func (d *schedulerTestDeps) resetAccountLastUsed(t *testing.T, accountID uint64) {
	t.Helper()

	if _, err := d.db.Exec(`UPDATE oai_accounts SET last_used_at = NULL WHERE id = ?`, accountID); err != nil {
		t.Fatalf("reset last_used_at: %v", err)
	}
}

func schedulerBoolToInt(v bool) int {
	if v {
		return 1
	}
	return 0
}
