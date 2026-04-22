package image

import (
	"context"
	"errors"
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
			result.IsPreview = true
			return true, "", nil
		},
	}

	res := r.Run(context.Background(), RunOptions{TaskID: "img_cfg_wait"})
	if res.Status != StatusSuccess {
		t.Fatalf("status = %s", res.Status)
	}
	if !res.IsPreview {
		t.Fatalf("expected preview fallback")
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

func TestRunnerRunPreservesPreviewFallbackResult(t *testing.T) {
	r := &Runner{
		cfg: config.ImageConfig{SameConversationMaxTurns: 2, PollMaxWaitSec: 120},
		runOnceFn: func(ctx context.Context, opt RunOptions, result *RunResult) (bool, string, error) {
			result.ConversationID = "conv_preview"
			result.FileIDs = []string{"sed:preview_2"}
			result.SignedURLs = []string{"https://example.com/preview-2.png"}
			result.ContentTypes = []string{"image/png"}
			result.TurnsInConv = 2
			result.IsPreview = true
			return true, "", nil
		},
	}

	res := r.Run(context.Background(), RunOptions{TaskID: "img_preview_fallback"})
	if res.Status != StatusSuccess {
		t.Fatalf("status = %s", res.Status)
	}
	if res.TurnsInConv != 2 {
		t.Fatalf("TurnsInConv = %d", res.TurnsInConv)
	}
	if !res.IsPreview {
		t.Fatalf("expected preview fallback")
	}
	if got := len(res.FileIDs); got != 1 || res.FileIDs[0] != "sed:preview_2" {
		t.Fatalf("file ids = %v", res.FileIDs)
	}
}

func TestRunnerRunRetriesUpstreamErrorUntilSuccess(t *testing.T) {
	attempts := 0
	r := &Runner{
		runOnceFn: func(ctx context.Context, opt RunOptions, result *RunResult) (bool, string, error) {
			attempts++
			if attempts == 1 {
				return false, ErrUpstream, errors.New("upstream boom")
			}
			result.ConversationID = "conv_retry_ok"
			result.AccountID = 42
			result.FileIDs = []string{"file_1"}
			result.SignedURLs = []string{"https://example.com/img.png"}
			result.ContentTypes = []string{"image/png"}
			return true, "", nil
		},
	}

	res := r.Run(context.Background(), RunOptions{TaskID: "img_retry_ok", MaxAttempts: 1})
	if attempts != 2 {
		t.Fatalf("expected 2 attempts, got %d", attempts)
	}
	if res.Status != StatusSuccess {
		t.Fatalf("expected success, got %s", res.Status)
	}
	if res.ErrorCode != "" {
		t.Fatalf("expected empty error code, got %q", res.ErrorCode)
	}
	if res.Attempts != 2 {
		t.Fatalf("expected result attempts=2, got %d", res.Attempts)
	}
}

func TestRunnerRunExhaustsConfiguredRetriesForUpstreamError(t *testing.T) {
	attempts := 0
	r := &Runner{
		runOnceFn: func(ctx context.Context, opt RunOptions, result *RunResult) (bool, string, error) {
			attempts++
			return false, ErrUpstream, errors.New("still upstream boom")
		},
	}

	res := r.Run(context.Background(), RunOptions{TaskID: "img_retry_fail", MaxAttempts: 3})
	if attempts != 3 {
		t.Fatalf("expected 3 attempts, got %d", attempts)
	}
	if res.Status != StatusFailed {
		t.Fatalf("expected failed status, got %s", res.Status)
	}
	if res.ErrorCode != ErrUpstream {
		t.Fatalf("expected error code %q, got %q", ErrUpstream, res.ErrorCode)
	}
	if res.Attempts != 3 {
		t.Fatalf("expected result attempts=3, got %d", res.Attempts)
	}
}

func TestRunnerRunDoesNotExtendPreviewOnlyWhenMaxAttemptsIsOne(t *testing.T) {
	attempts := 0
	r := &Runner{
		runOnceFn: func(ctx context.Context, opt RunOptions, result *RunResult) (bool, string, error) {
			attempts++
			return false, ErrPreviewOnly, errors.New("preview only")
		},
	}

	res := r.Run(context.Background(), RunOptions{TaskID: "img_preview_once", MaxAttempts: 1})
	if attempts != 1 {
		t.Fatalf("expected 1 attempt, got %d", attempts)
	}
	if res.Status != StatusFailed {
		t.Fatalf("expected failed status, got %s", res.Status)
	}
	if res.ErrorCode != ErrPreviewOnly {
		t.Fatalf("expected error code %q, got %q", ErrPreviewOnly, res.ErrorCode)
	}
}
