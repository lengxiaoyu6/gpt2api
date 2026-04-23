package gateway

import "testing"

func TestBuildAPIImageDataUsesProxyURLsForLocalTasks(t *testing.T) {
	data := buildAPIImageData("img_local_123", "local", []string{"https://origin.example.com/1.png", "https://origin.example.com/2.png"}, []string{"sed:file-1", "file-2"})
	if len(data) != 2 {
		t.Fatalf("len(data) = %d", len(data))
	}
	if data[0].URL == "https://origin.example.com/1.png" {
		t.Fatalf("expected local task to use proxy url, got %q", data[0].URL)
	}
	if data[0].FileID != "file-1" || data[1].FileID != "file-2" {
		t.Fatalf("unexpected file ids: %#v", data)
	}
}

func TestBuildAPIImageDataUsesProxyURLsForCloudTasks(t *testing.T) {
	data := buildAPIImageData("img_cloud_123", "cloud", []string{"https://cdn.example.com/1.png", "https://cdn.example.com/2.png"}, []string{"sed:file-1", "file-2"})
	if len(data) != 2 {
		t.Fatalf("len(data) = %d", len(data))
	}
	if data[0].URL != "https://cdn.example.com/1.png" || data[1].URL != "https://cdn.example.com/2.png" {
		t.Fatalf("expected cloud task to use remote url, got %#v", data)
	}
	if data[0].FileID != "file-1" || data[1].FileID != "file-2" {
		t.Fatalf("unexpected file ids: %#v", data)
	}
}
