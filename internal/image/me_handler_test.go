package image

import (
	"encoding/json"
	"strings"
	"testing"
)

type stubHistoryImageStore struct {
	original map[string]bool
	thumb    map[string]bool
}

func (s stubHistoryImageStore) HasOriginal(taskID string, idx int) (bool, error) {
	return s.original[fileKey(taskID, idx)], nil
}

func (s stubHistoryImageStore) HasThumb(taskID string, idx int) (bool, error) {
	return s.thumb[fileKey(taskID, idx)], nil
}

func mustJSON(t *testing.T, v any) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal json: %v", err)
	}
	return b
}

func TestBuildHistoryImageURLsUsesLocalFilesAndThumbFallback(t *testing.T) {
	task := &Task{
		TaskID:      "img_hist_123",
		StorageMode: StorageModeLocal,
		ResultURLs: mustJSON(t, []string{
			"https://chatgpt.com/backend-api/estuary/content?id=1",
			"https://files.oaiusercontent.com/file-2",
		}),
		FileIDs: mustJSON(t, []string{"sed:file-1", "file-2"}),
	}

	images, thumbs := buildHistoryImageURLs(task, stubHistoryImageStore{
		original: map[string]bool{
			fileKey("img_hist_123", 0): true,
			fileKey("img_hist_123", 1): true,
		},
		thumb: map[string]bool{
			fileKey("img_hist_123", 0): true,
		},
	})
	if len(images) != 2 || len(thumbs) != 2 {
		t.Fatalf("unexpected counts: images=%d thumbs=%d", len(images), len(thumbs))
	}
	if !strings.HasPrefix(images[0], "/p/img/img_hist_123/0") {
		t.Fatalf("unexpected image url 0: %q", images[0])
	}
	if !strings.HasPrefix(thumbs[0], "/p/thumb/img_hist_123/0") {
		t.Fatalf("unexpected thumb url 0: %q", thumbs[0])
	}
	if images[1] != thumbs[1] {
		t.Fatalf("expected thumb fallback to original, got image=%q thumb=%q", images[1], thumbs[1])
	}
}

func TestBuildHistoryImageURLsReturnsExpiredPlaceholderWhenOriginalMissing(t *testing.T) {
	task := &Task{
		TaskID:      "img_hist_456",
		StorageMode: StorageModeLocal,
		ResultURLs: mustJSON(t, []string{
			"https://chatgpt.com/backend-api/estuary/content?id=1",
			"https://chatgpt.com/backend-api/estuary/content?id=2",
		}),
	}

	images, thumbs := buildHistoryImageURLs(task, stubHistoryImageStore{})
	if len(images) != 2 || len(thumbs) != 2 {
		t.Fatalf("unexpected counts: images=%d thumbs=%d", len(images), len(thumbs))
	}
	if images[0] != "" || thumbs[0] != "" {
		t.Fatalf("expected empty urls when original missing, got image=%q thumb=%q", images[0], thumbs[0])
	}
}

func TestBuildHistoryImageURLsReturnsCloudRemoteURLsWithThumbs(t *testing.T) {
	task := &Task{
		TaskID:      "img_hist_cloud",
		StorageMode: StorageModeCloud,
		ResultURLs: mustJSON(t, []string{
			"https://cdn.example.com/1.png",
			"https://cdn.example.com/2.png",
		}),
		ThumbURLs: mustJSON(t, []string{
			"https://cdn.example.com/1_thumb.jpg",
			"https://cdn.example.com/2_thumb.jpg",
		}),
	}

	images, thumbs := buildHistoryImageURLs(task, stubHistoryImageStore{})
	if len(images) != 2 || len(thumbs) != 2 {
		t.Fatalf("unexpected counts: images=%d thumbs=%d", len(images), len(thumbs))
	}
	if images[0] != "https://cdn.example.com/1.png" || images[1] != "https://cdn.example.com/2.png" {
		t.Fatalf("unexpected images: %#v", images)
	}
	if thumbs[0] != "https://cdn.example.com/1_thumb.jpg" || thumbs[1] != "https://cdn.example.com/2_thumb.jpg" {
		t.Fatalf("unexpected thumbs: %#v", thumbs)
	}
}
