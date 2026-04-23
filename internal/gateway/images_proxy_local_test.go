package gateway

import (
	"context"
	"testing"
	"time"

	"github.com/432539/gpt2api/internal/image"
	"github.com/432539/gpt2api/internal/imageproxy"
)

type proxyLocalStoreStub struct {
	readOriginalCalls int
	readThumbCalls    int
}

func (s *proxyLocalStoreStub) ReadOriginal(taskID string, idx int) ([]byte, string, bool, error) {
	s.readOriginalCalls++
	return []byte("original-bytes"), "image/png", true, nil
}

func (s *proxyLocalStoreStub) ReadThumb(taskID string, idx int) ([]byte, string, bool, error) {
	s.readThumbCalls++
	return []byte("thumb-bytes"), "image/jpeg", true, nil
}

func TestLoadProxyImageSeparatesOriginalAndThumbCache(t *testing.T) {
	task := &image.Task{TaskID: "img_cache_123"}
	store := &proxyLocalStoreStub{}
	h := &ImagesHandler{
		LocalImageStore: store,
		imageProxyCache: newImageProxyCache(30*time.Minute, 8),
	}

	body1, ct1, err := h.loadProxyImage(context.Background(), task, 0, imageproxy.ResourceOriginal)
	if err != nil {
		t.Fatalf("load original: %v", err)
	}
	body2, ct2, err := h.loadProxyImage(context.Background(), task, 0, imageproxy.ResourceOriginal)
	if err != nil {
		t.Fatalf("load original cached: %v", err)
	}
	thumb1, thumbCT1, err := h.loadProxyImage(context.Background(), task, 0, imageproxy.ResourceThumb)
	if err != nil {
		t.Fatalf("load thumb: %v", err)
	}
	thumb2, thumbCT2, err := h.loadProxyImage(context.Background(), task, 0, imageproxy.ResourceThumb)
	if err != nil {
		t.Fatalf("load thumb cached: %v", err)
	}

	if string(body1) != "original-bytes" || string(body2) != "original-bytes" {
		t.Fatalf("unexpected original bytes: %q %q", string(body1), string(body2))
	}
	if ct1 != "image/png" || ct2 != "image/png" {
		t.Fatalf("unexpected original content types: %q %q", ct1, ct2)
	}
	if string(thumb1) != "thumb-bytes" || string(thumb2) != "thumb-bytes" {
		t.Fatalf("unexpected thumb bytes: %q %q", string(thumb1), string(thumb2))
	}
	if thumbCT1 != "image/jpeg" || thumbCT2 != "image/jpeg" {
		t.Fatalf("unexpected thumb content types: %q %q", thumbCT1, thumbCT2)
	}
	if store.readOriginalCalls != 1 {
		t.Fatalf("read original calls = %d", store.readOriginalCalls)
	}
	if store.readThumbCalls != 1 {
		t.Fatalf("read thumb calls = %d", store.readThumbCalls)
	}
}
