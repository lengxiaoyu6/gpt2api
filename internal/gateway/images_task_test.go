package gateway

import (
	"testing"

	modelpkg "github.com/432539/gpt2api/internal/model"
)

func TestBuildAPIImageDataUsesProxyURLsForLocalTasks(t *testing.T) {
	data := buildAPIImageData("img_local_123", "local", []string{"https://origin.example.com/1.png", "https://origin.example.com/2.png"}, nil, []string{"sed:file-1", "file-2"})
	if len(data) != 2 {
		t.Fatalf("len(data) = %d", len(data))
	}
	if data[0].URL == "https://origin.example.com/1.png" {
		t.Fatalf("expected local task to use proxy url, got %q", data[0].URL)
	}
	if data[0].ThumbURL == "" || data[0].ThumbURL == data[0].URL {
		t.Fatalf("expected local task to include separate thumb url, got %#v", data[0])
	}
	if data[0].FileID != "file-1" || data[1].FileID != "file-2" {
		t.Fatalf("unexpected file ids: %#v", data)
	}
}

func TestBuildAPIImageDataUsesProxyURLsForCloudTasks(t *testing.T) {
	data := buildAPIImageData(
		"img_cloud_123",
		"cloud",
		[]string{"https://cdn.example.com/1.png", "https://cdn.example.com/2.png"},
		[]string{"https://cdn.example.com/1_thumb.jpg", "https://cdn.example.com/2_thumb.jpg"},
		[]string{"sed:file-1", "file-2"},
	)
	if len(data) != 2 {
		t.Fatalf("len(data) = %d", len(data))
	}
	if data[0].URL != "https://cdn.example.com/1.png" || data[1].URL != "https://cdn.example.com/2.png" {
		t.Fatalf("expected cloud task to use remote url, got %#v", data)
	}
	if data[0].ThumbURL != "https://cdn.example.com/1_thumb.jpg" || data[1].ThumbURL != "https://cdn.example.com/2_thumb.jpg" {
		t.Fatalf("expected cloud task to include remote thumb urls, got %#v", data)
	}
	if data[0].FileID != "file-1" || data[1].FileID != "file-2" {
		t.Fatalf("unexpected file ids: %#v", data)
	}
}

func TestImageResponseAccountingUsesActualDataCount(t *testing.T) {
	m := &modelpkg.Model{
		ImagePricePerCall:   1000,
		ImagePricePerCall4K: 3000,
	}
	data := []ImageGenData{{URL: "https://example.com/only-one.png"}}

	actualN, cost := imageResponseAccounting(m, data, 1.5, "3840x2160")
	if actualN != 1 {
		t.Fatalf("actualN = %d", actualN)
	}
	if cost != 4500 {
		t.Fatalf("cost = %d", cost)
	}
}
