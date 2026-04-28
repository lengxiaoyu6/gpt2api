package gateway

import (
	"context"
	"testing"
	"time"

	"github.com/432539/gpt2api/internal/image"
	"github.com/432539/gpt2api/internal/imageproxy"
)

type proxyLocalStoreStub struct {
	readOriginalCalls      int
	readThumbCalls         int
	readReferenceCalls     int
	readReferenceThumbCalls int
}

func (s *proxyLocalStoreStub) ReadOriginal(taskID string, idx int) ([]byte, string, bool, error) {
	s.readOriginalCalls++
	return []byte("original-bytes"), "image/png", true, nil
}

func (s *proxyLocalStoreStub) ReadThumb(taskID string, idx int) ([]byte, string, bool, error) {
	s.readThumbCalls++
	return []byte("thumb-bytes"), "image/jpeg", true, nil
}

func (s *proxyLocalStoreStub) ReadReference(taskID string, idx int) ([]byte, string, bool, error) {
	s.readReferenceCalls++
	return []byte("reference-bytes"), "image/png", true, nil
}

func (s *proxyLocalStoreStub) ReadReferenceThumb(taskID string, idx int) ([]byte, string, bool, error) {
	s.readReferenceThumbCalls++
	return []byte("reference-thumb-bytes"), "image/jpeg", true, nil
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

	ref1, refCT1, err := h.loadProxyImage(context.Background(), task, 0, imageproxy.ResourceReference)
	if err != nil {
		t.Fatalf("load reference: %v", err)
	}
	ref2, refCT2, err := h.loadProxyImage(context.Background(), task, 0, imageproxy.ResourceReference)
	if err != nil {
		t.Fatalf("load reference cached: %v", err)
	}
	refThumb1, refThumbCT1, err := h.loadProxyImage(context.Background(), task, 0, imageproxy.ResourceReferenceThumb)
	if err != nil {
		t.Fatalf("load reference thumb: %v", err)
	}
	refThumb2, refThumbCT2, err := h.loadProxyImage(context.Background(), task, 0, imageproxy.ResourceReferenceThumb)
	if err != nil {
		t.Fatalf("load reference thumb cached: %v", err)
	}
	if string(ref1) != "reference-bytes" || string(ref2) != "reference-bytes" {
		t.Fatalf("unexpected reference bytes: %q %q", string(ref1), string(ref2))
	}
	if refCT1 != "image/png" || refCT2 != "image/png" {
		t.Fatalf("unexpected reference content types: %q %q", refCT1, refCT2)
	}
	if string(refThumb1) != "reference-thumb-bytes" || string(refThumb2) != "reference-thumb-bytes" {
		t.Fatalf("unexpected reference thumb bytes: %q %q", string(refThumb1), string(refThumb2))
	}
	if refThumbCT1 != "image/jpeg" || refThumbCT2 != "image/jpeg" {
		t.Fatalf("unexpected reference thumb content types: %q %q", refThumbCT1, refThumbCT2)
	}
	if store.readReferenceCalls != 1 {
		t.Fatalf("read reference calls = %d", store.readReferenceCalls)
	}
	if store.readReferenceThumbCalls != 1 {
		t.Fatalf("read reference thumb calls = %d", store.readReferenceThumbCalls)
	}
}
