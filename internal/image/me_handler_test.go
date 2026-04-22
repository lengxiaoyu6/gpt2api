package image

import (
	"encoding/json"
	"strings"
	"testing"
)

func mustJSON(t *testing.T, v any) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal json: %v", err)
	}
	return b
}

func TestToViewUsesSignedProxyURLsForHistoryTasks(t *testing.T) {
	task := &Task{
		TaskID: "img_hist_123",
		ResultURLs: mustJSON(t, []string{
			"https://chatgpt.com/backend-api/estuary/content?id=1",
			"https://files.oaiusercontent.com/file-2",
		}),
		FileIDs: mustJSON(t, []string{"sed:file-1", "file-2"}),
	}

	view := toView(task)
	if len(view.ImageURLs) != 2 {
		t.Fatalf("expected 2 image urls, got %d", len(view.ImageURLs))
	}
	for i, url := range view.ImageURLs {
		wantPrefix := "/p/img/img_hist_123/" + string(rune('0'+i))
		if !strings.HasPrefix(url, wantPrefix) {
			t.Fatalf("image url %d = %q, want prefix %q", i, url, wantPrefix)
		}
		if !strings.Contains(url, "exp=") || !strings.Contains(url, "sig=") {
			t.Fatalf("image url %d = %q, want signed proxy query", i, url)
		}
	}
	if len(view.FileIDs) != 2 || view.FileIDs[0] != "file-1" || view.FileIDs[1] != "file-2" {
		t.Fatalf("unexpected file ids: %#v", view.FileIDs)
	}
}

func TestToViewFallsBackToStoredURLCountWhenFileIDsMissing(t *testing.T) {
	task := &Task{
		TaskID: "img_hist_456",
		ResultURLs: mustJSON(t, []string{
			"https://chatgpt.com/backend-api/estuary/content?id=1",
			"https://chatgpt.com/backend-api/estuary/content?id=2",
		}),
	}

	view := toView(task)
	if len(view.ImageURLs) != 2 {
		t.Fatalf("expected 2 image urls, got %d", len(view.ImageURLs))
	}
	for i, url := range view.ImageURLs {
		wantPrefix := "/p/img/img_hist_456/" + string(rune('0'+i))
		if !strings.HasPrefix(url, wantPrefix) {
			t.Fatalf("image url %d = %q, want prefix %q", i, url, wantPrefix)
		}
	}
}
