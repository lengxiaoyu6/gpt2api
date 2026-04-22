package gateway

import (
	"context"
	"testing"
	"time"

	"github.com/432539/gpt2api/internal/image"
)

func TestLoadProxyImageCachesByTaskAndIndex(t *testing.T) {
	task := &image.Task{TaskID: "img_cache_123", ConversationID: "conv_123", AccountID: 42}

	calls := 0
	h := &ImagesHandler{
		imageProxyCache: newImageProxyCache(30*time.Minute, 8),
		imageProxyFetcher: imageProxyFetchFunc(func(ctx context.Context, task *image.Task, ref string) ([]byte, string, error) {
			calls++
			return []byte("image-bytes"), "image/webp", nil
		}),
	}

	got1, ct1, err := h.loadProxyImage(context.Background(), task, 0, "sed:file-1")
	if err != nil {
		t.Fatalf("first load: %v", err)
	}
	got2, ct2, err := h.loadProxyImage(context.Background(), task, 0, "sed:file-1")
	if err != nil {
		t.Fatalf("second load: %v", err)
	}

	if calls != 1 {
		t.Fatalf("fetcher calls = %d, want 1", calls)
	}
	if string(got1) != "image-bytes" || string(got2) != "image-bytes" {
		t.Fatalf("unexpected bodies: %q %q", string(got1), string(got2))
	}
	if ct1 != "image/webp" || ct2 != "image/webp" {
		t.Fatalf("unexpected content types: %q %q", ct1, ct2)
	}
}
