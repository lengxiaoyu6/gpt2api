package proxy

import (
	"context"
	"database/sql"
	"testing"
	"time"

	miniredis "github.com/alicebob/miniredis/v2"
	"github.com/jmoiron/sqlx"
	"github.com/redis/go-redis/v9"

	"github.com/432539/gpt2api/pkg/lock"

	_ "github.com/mattn/go-sqlite3"
)

func TestAllocatorLeaseOrdersByHealthThenLastUsedThenID(t *testing.T) {
	db := newAllocatorTestDB(t)
	dao := NewDAO(db)
	svc := NewService(dao, nil)
	alloc, _ := newAllocatorTestDeps(t, dao, svc)

	ctx := context.Background()
	base := time.Now().Add(-2 * time.Hour).UTC()
	mustInsertTestProxy(t, db, proxyRow{
		ID:         1,
		Scheme:     "http",
		Host:       "proxy-1.local",
		Port:       8080,
		Health:     100,
		Enabled:    true,
		LastUsedAt: sql.NullTime{Time: base, Valid: true},
	})
	mustInsertTestProxy(t, db, proxyRow{
		ID:         2,
		Scheme:     "http",
		Host:       "proxy-2.local",
		Port:       8080,
		Health:     100,
		Enabled:    true,
		LastUsedAt: sql.NullTime{Time: base.Add(30 * time.Minute), Valid: true},
	})
	mustInsertTestProxy(t, db, proxyRow{
		ID:      3,
		Scheme:  "http",
		Host:    "proxy-3.local",
		Port:    8080,
		Health:  90,
		Enabled: true,
	})

	lease1, err := alloc.Lease(ctx)
	if err != nil {
		t.Fatalf("first lease: %v", err)
	}
	if lease1 == nil {
		t.Fatal("first lease = nil")
	}
	if lease1.ProxyID != 1 {
		t.Fatalf("first proxy id = %d, want 1", lease1.ProxyID)
	}
	if err := lease1.Release(ctx); err != nil {
		t.Fatalf("release first lease: %v", err)
	}

	var touched sql.NullTime
	if err := db.GetContext(ctx, &touched,
		`SELECT last_used_at FROM proxies WHERE id = ?`, 1); err != nil {
		t.Fatalf("select last_used_at: %v", err)
	}
	if !touched.Valid {
		t.Fatal("last_used_at not updated")
	}
	if !touched.Time.After(base) {
		t.Fatalf("last_used_at = %v, want after %v", touched.Time, base)
	}

	lease2, err := alloc.Lease(ctx)
	if err != nil {
		t.Fatalf("second lease: %v", err)
	}
	if lease2 == nil {
		t.Fatal("second lease = nil")
	}
	if lease2.ProxyID != 2 {
		t.Fatalf("second proxy id = %d, want 2", lease2.ProxyID)
	}
	if err := lease2.Release(ctx); err != nil {
		t.Fatalf("release second lease: %v", err)
	}
}

func TestAllocatorLeaseFallsBackToDirectWhenAllHealthyBusy(t *testing.T) {
	db := newAllocatorTestDB(t)
	dao := NewDAO(db)
	svc := NewService(dao, nil)
	alloc, redisClient := newAllocatorTestDeps(t, dao, svc)

	ctx := context.Background()
	mustInsertTestProxy(t, db, proxyRow{
		ID:      1,
		Scheme:  "http",
		Host:    "proxy-busy.local",
		Port:    8080,
		Health:  100,
		Enabled: true,
	})

	if err := redisClient.SetNX(ctx, "proxy:lease:1", "busy-token", time.Minute).Err(); err != nil {
		t.Fatalf("acquire busy lock: %v", err)
	}

	lease, err := alloc.Lease(ctx)
	if err != nil {
		t.Fatalf("lease: %v", err)
	}
	if lease != nil {
		t.Fatalf("lease = %#v, want nil fallback", lease)
	}
}

func TestAllocatorReleaseFreesRedisLock(t *testing.T) {
	db := newAllocatorTestDB(t)
	dao := NewDAO(db)
	svc := NewService(dao, nil)
	alloc, redisClient := newAllocatorTestDeps(t, dao, svc)

	ctx := context.Background()
	mustInsertTestProxy(t, db, proxyRow{
		ID:      1,
		Scheme:  "http",
		Host:    "proxy-release.local",
		Port:    8080,
		Health:  100,
		Enabled: true,
	})

	lease, err := alloc.Lease(ctx)
	if err != nil {
		t.Fatalf("lease: %v", err)
	}
	if lease == nil {
		t.Fatal("lease = nil")
	}
	if err := redisClient.Get(ctx, "proxy:lease:1").Err(); err != nil {
		t.Fatalf("lock missing before release: %v", err)
	}
	if err := lease.Release(ctx); err != nil {
		t.Fatalf("release: %v", err)
	}
	if err := redisClient.Get(ctx, "proxy:lease:1").Err(); err == nil {
		t.Fatal("proxy lock still exists after release")
	}
}

type proxyRow struct {
	ID         uint64
	Scheme     string
	Host       string
	Port       int
	Health     int
	Enabled    bool
	LastUsedAt sql.NullTime
}

func newAllocatorTestDB(t *testing.T) *sqlx.DB {
	t.Helper()

	db := sqlx.MustOpen("sqlite3", ":memory:")
	t.Cleanup(func() { _ = db.Close() })

	schema := `CREATE TABLE proxies (
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
	)`
	if _, err := db.Exec(schema); err != nil {
		t.Fatalf("create proxies schema: %v", err)
	}
	return db
}

func newAllocatorTestDeps(t *testing.T, dao *DAO, svc *Service) (*Allocator, *redis.Client) {
	t.Helper()

	mr := miniredis.RunT(t)
	redisClient := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = redisClient.Close() })

	redisLock := lock.NewRedisLock(redisClient)
	return NewAllocator(dao, svc, redisLock, time.Minute), redisClient
}

func mustInsertTestProxy(t *testing.T, db *sqlx.DB, row proxyRow) {
	t.Helper()

	var lastUsed any
	if row.LastUsedAt.Valid {
		lastUsed = row.LastUsedAt.Time
	}
	if _, err := db.Exec(
		`INSERT INTO proxies
			(id, scheme, host, port, health_score, enabled, last_used_at, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
		row.ID, row.Scheme, row.Host, row.Port, row.Health, boolToInt(row.Enabled), lastUsed,
	); err != nil {
		t.Fatalf("insert proxy %d: %v", row.ID, err)
	}
}

func boolToInt(v bool) int {
	if v {
		return 1
	}
	return 0
}
