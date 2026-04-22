package imageproxy

import (
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestBuildURLAndVerify(t *testing.T) {
	raw := BuildURL("img_task_123", 2, time.Minute)
	if !strings.HasPrefix(raw, "/p/img/img_task_123/2?") {
		t.Fatalf("unexpected proxy url: %q", raw)
	}
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("parse proxy url: %v", err)
	}
	expMs, err := strconv.ParseInt(u.Query().Get("exp"), 10, 64)
	if err != nil {
		t.Fatalf("parse exp: %v", err)
	}
	sig := u.Query().Get("sig")
	if sig == "" {
		t.Fatalf("empty sig in %q", raw)
	}
	if !Verify("img_task_123", 2, expMs, sig) {
		t.Fatalf("verify failed for %q", raw)
	}
	if Verify("img_task_123", 3, expMs, sig) {
		t.Fatalf("verify unexpectedly passed for mismatched idx")
	}
}
