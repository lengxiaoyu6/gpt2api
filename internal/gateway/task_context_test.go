package gateway

import (
	"context"
	"testing"
	"time"
)

func TestDetachedTaskContextIgnoresParentCancellationButRespectsTimeout(t *testing.T) {
	parent, cancelParent := context.WithCancel(context.Background())
	ctx, cancel := detachedTaskContext(parent, 30*time.Millisecond)
	defer cancel()

	cancelParent()

	select {
	case <-ctx.Done():
		t.Fatalf("detached task context should outlive parent cancellation: %v", ctx.Err())
	case <-time.After(10 * time.Millisecond):
	}

	select {
	case <-ctx.Done():
		if ctx.Err() != context.DeadlineExceeded {
			t.Fatalf("ctx err = %v, want %v", ctx.Err(), context.DeadlineExceeded)
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatal("timed out waiting for detached task context deadline")
	}
}
