package gateway

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/432539/gpt2api/internal/image"
	"github.com/432539/gpt2api/internal/imageproxy"
)

func TestLoadProxyImageCachesByTaskAndIndex(t *testing.T) {
	task := &image.Task{TaskID: "img_cache_123"}
	store := &proxyLocalStoreStub{}
	h := &ImagesHandler{
		LocalImageStore: store,
		imageProxyCache: newImageProxyCache(30*time.Minute, 8),
	}

	got1, ct1, err := h.loadProxyImage(context.Background(), task, 0, imageproxy.ResourceOriginal)
	if err != nil {
		t.Fatalf("first load: %v", err)
	}
	got2, ct2, err := h.loadProxyImage(context.Background(), task, 0, imageproxy.ResourceOriginal)
	if err != nil {
		t.Fatalf("second load: %v", err)
	}

	if store.readOriginalCalls != 1 {
		t.Fatalf("read original calls = %d, want 1", store.readOriginalCalls)
	}
	if string(got1) != "original-bytes" || string(got2) != "original-bytes" {
		t.Fatalf("unexpected bodies: %q %q", string(got1), string(got2))
	}
	if ct1 != "image/png" || ct2 != "image/png" {
		t.Fatalf("unexpected content types: %q %q", ct1, ct2)
	}
}

func TestLoadProxyImageFetchesCloudResultURL(t *testing.T) {
	remoteCalls := 0
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		remoteCalls++
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write([]byte("cloud-image"))
	}))
	defer remote.Close()

	task := &image.Task{
		TaskID:      "img_cloud_proxy",
		StorageMode: image.StorageModeCloud,
		ResultURLs:  []byte("[\"" + remote.URL + "/image.png\"]"),
	}
	h := &ImagesHandler{
		imageProxyCache: newImageProxyCache(30*time.Minute, 8),
	}

	body1, ct1, err := h.loadProxyImage(context.Background(), task, 0, imageproxy.ResourceOriginal)
	if err != nil {
		t.Fatalf("first load: %v", err)
	}
	body2, ct2, err := h.loadProxyImage(context.Background(), task, 0, imageproxy.ResourceOriginal)
	if err != nil {
		t.Fatalf("second load: %v", err)
	}
	if remoteCalls != 1 {
		t.Fatalf("remote calls = %d", remoteCalls)
	}
	if string(body1) != "cloud-image" || string(body2) != "cloud-image" {
		t.Fatalf("unexpected bodies: %q %q", string(body1), string(body2))
	}
	if ct1 != "image/png" || ct2 != "image/png" {
		t.Fatalf("unexpected content types: %q %q", ct1, ct2)
	}
}
