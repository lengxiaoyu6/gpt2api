package image

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"

	"github.com/432539/gpt2api/internal/config"
)

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
