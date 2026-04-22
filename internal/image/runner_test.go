package image

import (
	"context"
	"errors"
	"testing"
)

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
