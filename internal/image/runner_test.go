package image

import (
	"context"
	"errors"
	"slices"
	"strings"
	"sync/atomic"
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

func TestFilterOutReferenceFileIDsRemovesReferenceSedimentRefs(t *testing.T) {
	refSet := referenceUploadFileIDSet([]*chatgpt.UploadedFile{{FileID: "ref_upload_1"}})
	got := filterOutReferenceFileIDs([]string{"sed:ref_upload_1", "generated_file_1"}, refSet)
	want := []string{"generated_file_1"}
	if !slices.Equal(got, want) {
		t.Fatalf("file refs = %v, want %v", got, want)
	}
}

func TestRunnerRunUsesConfiguredPollMaxWaitWhenUnset(t *testing.T) {
	r := &Runner{
		cfg: config.ImageConfig{PollMaxWaitSec: 120},
		runOnceFn: func(ctx context.Context, opt RunOptions, result *RunResult) (bool, string, error) {
			if opt.PollMaxWait != 120*time.Second {
				t.Fatalf("PollMaxWait = %s", opt.PollMaxWait)
			}
			result.ConversationID = "conv_cfg_wait"
			result.FileIDs = []string{"sed:preview_1"}
			result.SignedURLs = []string{"https://example.com/preview.png"}
			result.ContentTypes = []string{"image/png"}
			return true, "", nil
		},
	}

	res := r.Run(context.Background(), RunOptions{TaskID: "img_cfg_wait"})
	if res.Status != StatusSuccess {
		t.Fatalf("status = %s", res.Status)
	}
	if got := len(res.FileIDs); got != 1 || res.FileIDs[0] != "sed:preview_1" {
		t.Fatalf("file ids = %v", res.FileIDs)
	}
}

func TestRunnerImageWaitConfigUsesConfiguredValues(t *testing.T) {
	r := &Runner{cfg: config.ImageConfig{
		SameConversationMaxTurns: 2,
		PollMaxWaitSec:           120,
		PollIntervalSec:          3,
		PollStableRounds:         2,
		PreviewWaitSec:           15,
	}}

	cfg := r.imageWaitConfig()
	if cfg.SameConversationMaxTurns != 2 {
		t.Fatalf("SameConversationMaxTurns = %d", cfg.SameConversationMaxTurns)
	}
	if cfg.PollIntervalSec != 3 {
		t.Fatalf("PollIntervalSec = %d", cfg.PollIntervalSec)
	}
	if cfg.PreviewWaitSec != 15 {
		t.Fatalf("PreviewWaitSec = %d", cfg.PreviewWaitSec)
	}
}

func TestRunnerRunPreservesReturnedRefs(t *testing.T) {
	r := &Runner{
		cfg: config.ImageConfig{SameConversationMaxTurns: 2, PollMaxWaitSec: 120},
		runOnceFn: func(ctx context.Context, opt RunOptions, result *RunResult) (bool, string, error) {
			result.ConversationID = "conv_preview"
			result.FileIDs = []string{"sed:preview_2"}
			result.SignedURLs = []string{"https://example.com/preview-2.png"}
			result.ContentTypes = []string{"image/png"}
			return true, "", nil
		},
	}

	res := r.Run(context.Background(), RunOptions{TaskID: "img_preview_fallback"})
	if res.Status != StatusSuccess {
		t.Fatalf("status = %s", res.Status)
	}
	if got := len(res.FileIDs); got != 1 || res.FileIDs[0] != "sed:preview_2" {
		t.Fatalf("file ids = %v", res.FileIDs)
	}
}

func TestRunnerRunPassesRequestedSizeToAttempt(t *testing.T) {
	r := &Runner{
		runOnceFn: func(ctx context.Context, opt RunOptions, result *RunResult) (bool, string, error) {
			if opt.Size != "3840x2160" {
				t.Fatalf("Size = %q", opt.Size)
			}
			result.ConversationID = "conv_size_passthrough"
			result.FileIDs = []string{"file:size_passthrough"}
			result.SignedURLs = []string{"https://example.com/size_passthrough.png"}
			result.ContentTypes = []string{"image/png"}
			return true, "", nil
		},
	}

	res := r.Run(context.Background(), RunOptions{TaskID: "img_size_passthrough", Size: "3840x2160"})
	if res.Status != StatusSuccess {
		t.Fatalf("status = %s", res.Status)
	}
}

func TestRunnerRunRetriesUpstreamErrorOnceWhenMaxAttemptsIsOne(t *testing.T) {
	attempts := 0
	r := &Runner{
		runOnceFn: func(ctx context.Context, opt RunOptions, result *RunResult) (bool, string, error) {
			attempts++
			return false, ErrUpstream, errors.New("upstream boom")
		},
	}

	res := r.Run(context.Background(), RunOptions{TaskID: "img_retry_ok", MaxAttempts: 1})
	if attempts != 2 {
		t.Fatalf("expected 2 attempts, got %d", attempts)
	}
	if res.Status != StatusFailed {
		t.Fatalf("expected failed status, got %s", res.Status)
	}
	if res.ErrorCode != ErrUpstream {
		t.Fatalf("expected error code %q, got %q", ErrUpstream, res.ErrorCode)
	}
	if res.Attempts != 2 {
		t.Fatalf("expected result attempts=2, got %d", res.Attempts)
	}
}

func TestRunnerRunLimitsUpstreamErrorRetryToOneExtraAttempt(t *testing.T) {
	attempts := 0
	r := &Runner{
		runOnceFn: func(ctx context.Context, opt RunOptions, result *RunResult) (bool, string, error) {
			attempts++
			return false, ErrUpstream, errors.New("still upstream boom")
		},
	}

	res := r.Run(context.Background(), RunOptions{TaskID: "img_retry_fail", MaxAttempts: 3})
	if attempts != 2 {
		t.Fatalf("expected 2 attempts, got %d", attempts)
	}
	if res.Status != StatusFailed {
		t.Fatalf("expected failed status, got %s", res.Status)
	}
	if res.ErrorCode != ErrUpstream {
		t.Fatalf("expected error code %q, got %q", ErrUpstream, res.ErrorCode)
	}
	if res.Attempts != 2 {
		t.Fatalf("expected result attempts=2, got %d", res.Attempts)
	}
}

func TestRunnerRunRetriesUpstreamErrorThenSucceeds(t *testing.T) {
	attempts := 0
	r := &Runner{
		runOnceFn: func(ctx context.Context, opt RunOptions, result *RunResult) (bool, string, error) {
			attempts++
			if attempts == 1 {
				result.AccountID = 101
				return false, ErrUpstream, errors.New("first upstream boom")
			}
			result.AccountID = 202
			result.ConversationID = "conv_retry_ok"
			result.FileIDs = []string{"file:retry_ok"}
			result.SignedURLs = []string{"https://example.com/retry_ok.png"}
			result.ContentTypes = []string{"image/png"}
			return true, "", nil
		},
	}

	res := r.Run(context.Background(), RunOptions{TaskID: "img_retry_then_ok", MaxAttempts: 1})
	if attempts != 2 {
		t.Fatalf("expected 2 attempts, got %d", attempts)
	}
	if res.Status != StatusSuccess {
		t.Fatalf("expected success status, got %s", res.Status)
	}
	if res.Attempts != 2 {
		t.Fatalf("expected result attempts=2, got %d", res.Attempts)
	}
	if res.AccountID != 202 {
		t.Fatalf("expected account 202, got %d", res.AccountID)
	}
	if got := len(res.FileIDs); got != 1 || res.FileIDs[0] != "file:retry_ok" {
		t.Fatalf("file ids = %v", res.FileIDs)
	}
}

func TestRunnerRunRetriesAuthRequiredThenSucceedsWhenMaxAttemptsIsOne(t *testing.T) {
	attempts := 0
	r := &Runner{
		runOnceFn: func(ctx context.Context, opt RunOptions, result *RunResult) (bool, string, error) {
			attempts++
			if attempts == 1 {
				result.AccountID = 101
				return false, ErrAuthRequired, errors.New("chatgpt upstream 401: chat-requirements failed")
			}
			result.AccountID = 202
			result.ConversationID = "conv_auth_retry_ok"
			result.FileIDs = []string{"file:auth_retry_ok"}
			result.SignedURLs = []string{"https://example.com/auth-retry-ok.png"}
			result.ContentTypes = []string{"image/png"}
			return true, "", nil
		},
	}

	res := r.Run(context.Background(), RunOptions{TaskID: "img_auth_retry_then_ok", MaxAttempts: 1})
	if attempts != 2 {
		t.Fatalf("expected 2 attempts, got %d", attempts)
	}
	if res.Status != StatusSuccess {
		t.Fatalf("expected success status, got %s", res.Status)
	}
	if res.Attempts != 2 {
		t.Fatalf("expected result attempts=2, got %d", res.Attempts)
	}
	if res.AccountID != 202 {
		t.Fatalf("expected account 202, got %d", res.AccountID)
	}
	if got := len(res.FileIDs); got != 1 || res.FileIDs[0] != "file:auth_retry_ok" {
		t.Fatalf("file ids = %v", res.FileIDs)
	}
}

func TestRunnerRunStopsAfterSingleNonRetryableFailure(t *testing.T) {
	attempts := 0
	r := &Runner{
		runOnceFn: func(ctx context.Context, opt RunOptions, result *RunResult) (bool, string, error) {
			attempts++
			return false, ErrPollTimeout, errors.New("poll timeout")
		},
	}

	res := r.Run(context.Background(), RunOptions{TaskID: "img_preview_once", MaxAttempts: 1})
	if attempts != 1 {
		t.Fatalf("expected 1 attempt, got %d", attempts)
	}
	if res.Status != StatusFailed {
		t.Fatalf("expected failed status, got %s", res.Status)
	}
	if res.ErrorCode != ErrPollTimeout {
		t.Fatalf("expected error code %q, got %q", ErrPollTimeout, res.ErrorCode)
	}
}

func TestRunnerRunReturnsPartialSuccessForParallelRequests(t *testing.T) {
	var calls int32
	r := &Runner{
		runOnceFn: func(ctx context.Context, opt RunOptions, result *RunResult) (bool, string, error) {
			call := atomic.AddInt32(&calls, 1)
			if call == 1 {
				result.ConversationID = "conv_partial"
				result.FileIDs = []string{"file:partial_ok"}
				result.SignedURLs = []string{"https://example.com/partial-ok.png"}
				result.ContentTypes = []string{"image/png"}
				return true, "", nil
			}
			return false, ErrPollTimeout, errors.New("poll timeout")
		},
	}

	res := r.Run(context.Background(), RunOptions{TaskID: "img_partial_success", N: 3, MaxAttempts: 1})
	if res.Status != StatusSuccess {
		t.Fatalf("expected success status, got %s", res.Status)
	}
	if got := len(res.FileIDs); got != 1 {
		t.Fatalf("file ids count = %d, ids = %v", got, res.FileIDs)
	}
	if res.FileIDs[0] != "file:partial_ok" {
		t.Fatalf("file ids = %v", res.FileIDs)
	}
}

func TestImageProxyFailureDeductsHealthOnce(t *testing.T) {
	deps := newImageProxyFailureTestDeps(t)
	ctx := context.Background()

	lease, err := deps.sched.Dispatch(ctx, modelpkg.TypeImage)
	if err != nil {
		t.Fatalf("dispatch: %v", err)
	}
	defer func() { _ = lease.Release(context.Background()) }()

	proxyErr := errors.New("tls handshake to https proxy: EOF")
	if err := markProxyFailureIfNeeded(ctx, lease, proxyErr); err != nil {
		t.Fatalf("first mark proxy failure: %v", err)
	}
	if err := markProxyFailureIfNeeded(ctx, lease, proxyErr); err != nil {
		t.Fatalf("second mark proxy failure: %v", err)
	}

	score, lastErr := deps.proxyHealth(t, 1)
	if score != 80 {
		t.Fatalf("health_score = %d, want 80", score)
	}
	if !strings.Contains(lastErr, "tls handshake to https proxy") {
		t.Fatalf("last_error = %q, want contains proxy summary", lastErr)
	}
}

func TestImageBusinessFailureDoesNotDeductProxyHealth(t *testing.T) {
	deps := newImageProxyFailureTestDeps(t)
	ctx := context.Background()

	lease, err := deps.sched.Dispatch(ctx, modelpkg.TypeImage)
	if err != nil {
		t.Fatalf("dispatch: %v", err)
	}
	defer func() { _ = lease.Release(context.Background()) }()

	upstreamErr := &chatgpt.UpstreamError{Status: 403, Message: "conversation failed"}
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

type imageProxyFailureTestDeps struct {
	db    *sqlx.DB
	sched *scheduler.Scheduler
}

func newImageProxyFailureTestDeps(t *testing.T) *imageProxyFailureTestDeps {
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
		"image-proxy@example.com", tokenEnc, time.Now().Add(24*time.Hour), "session-image", "device-image",
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

	return &imageProxyFailureTestDeps{db: db, sched: sched}
}

func (d *imageProxyFailureTestDeps) proxyHealth(t *testing.T, proxyID uint64) (int, string) {
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
