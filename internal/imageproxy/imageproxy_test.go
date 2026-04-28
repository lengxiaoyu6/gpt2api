package imageproxy

import (
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestBuildURLAndVerifySeparatesOriginalAndThumb(t *testing.T) {
	original := BuildURL("img_task_123", 2, ResourceOriginal, time.Minute)
	if !strings.HasPrefix(original, "/p/img/img_task_123/2?") {
		t.Fatalf("unexpected original proxy url: %q", original)
	}
	ou, err := url.Parse(original)
	if err != nil {
		t.Fatalf("parse original proxy url: %v", err)
	}
	expMs, err := strconv.ParseInt(ou.Query().Get("exp"), 10, 64)
	if err != nil {
		t.Fatalf("parse exp: %v", err)
	}
	sig := ou.Query().Get("sig")
	if sig == "" {
		t.Fatalf("empty sig in %q", original)
	}
	if !Verify("img_task_123", 2, ResourceOriginal, expMs, sig) {
		t.Fatalf("verify failed for %q", original)
	}
	if Verify("img_task_123", 2, ResourceThumb, expMs, sig) {
		t.Fatalf("verify unexpectedly passed with mismatched resource type")
	}

	thumb := BuildURL("img_task_123", 2, ResourceThumb, time.Minute)
	if !strings.HasPrefix(thumb, "/p/thumb/img_task_123/2?") {
		t.Fatalf("unexpected thumb proxy url: %q", thumb)
	}
}

func TestBuildURLAndVerifySeparatesReferenceResources(t *testing.T) {
	reference := BuildURL("img_task_456", 1, ResourceReference, time.Minute)
	if !strings.HasPrefix(reference, "/p/ref/img_task_456/1?") {
		t.Fatalf("unexpected reference proxy url: %q", reference)
	}
	ru, err := url.Parse(reference)
	if err != nil {
		t.Fatalf("parse reference proxy url: %v", err)
	}
	expMs, err := strconv.ParseInt(ru.Query().Get("exp"), 10, 64)
	if err != nil {
		t.Fatalf("parse exp: %v", err)
	}
	sig := ru.Query().Get("sig")
	if sig == "" {
		t.Fatalf("empty sig in %q", reference)
	}
	if !Verify("img_task_456", 1, ResourceReference, expMs, sig) {
		t.Fatalf("verify failed for %q", reference)
	}
	if Verify("img_task_456", 1, ResourceOriginal, expMs, sig) {
		t.Fatalf("verify unexpectedly passed with mismatched original resource type")
	}
	if Verify("img_task_456", 1, ResourceReferenceThumb, expMs, sig) {
		t.Fatalf("verify unexpectedly passed with mismatched reference thumb resource type")
	}

	referenceThumb := BuildURL("img_task_456", 1, ResourceReferenceThumb, time.Minute)
	if !strings.HasPrefix(referenceThumb, "/p/ref-thumb/img_task_456/1?") {
		t.Fatalf("unexpected reference thumb proxy url: %q", referenceThumb)
	}
}
