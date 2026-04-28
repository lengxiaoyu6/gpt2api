package image

import (
	"encoding/json"
	"strings"
	"testing"
)

type stubHistoryImageStore struct {
	original       map[string]bool
	thumb          map[string]bool
	reference      map[string]bool
	referenceThumb map[string]bool
}

func (s stubHistoryImageStore) HasOriginal(taskID string, idx int) (bool, error) {
	return s.original[fileKey(taskID, idx)], nil
}

func (s stubHistoryImageStore) HasThumb(taskID string, idx int) (bool, error) {
	return s.thumb[fileKey(taskID, idx)], nil
}

func (s stubHistoryImageStore) HasReference(taskID string, idx int) (bool, error) {
	return s.reference[fileKey(taskID, idx)], nil
}

func (s stubHistoryImageStore) HasReferenceThumb(taskID string, idx int) (bool, error) {
	return s.referenceThumb[fileKey(taskID, idx)], nil
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

func TestBuildHistoryReferenceURLsUsesLocalFilesAndThumbFallback(t *testing.T) {
	task := &Task{
		TaskID:         "img_hist_ref",
		StorageMode:    StorageModeLocal,
		ReferenceCount: 2,
	}

	references, referenceThumbs := buildHistoryReferenceURLs(task, stubHistoryImageStore{
		reference: map[string]bool{
			fileKey("img_hist_ref", 0): true,
			fileKey("img_hist_ref", 1): true,
		},
		referenceThumb: map[string]bool{
			fileKey("img_hist_ref", 0): true,
		},
	})
	if len(references) != 2 || len(referenceThumbs) != 2 {
		t.Fatalf("unexpected counts: references=%d thumbs=%d", len(references), len(referenceThumbs))
	}
	if !strings.HasPrefix(references[0], "/p/ref/img_hist_ref/0") {
		t.Fatalf("unexpected reference url 0: %q", references[0])
	}
	if !strings.HasPrefix(referenceThumbs[0], "/p/ref-thumb/img_hist_ref/0") {
		t.Fatalf("unexpected reference thumb url 0: %q", referenceThumbs[0])
	}
	if references[1] != referenceThumbs[1] {
		t.Fatalf("expected reference thumb fallback to original, got reference=%q thumb=%q", references[1], referenceThumbs[1])
	}
}

func TestBuildHistoryReferenceURLsReturnsCloudRemoteURLsWithThumbFallback(t *testing.T) {
	task := &Task{
		TaskID:         "img_hist_ref_cloud",
		StorageMode:    StorageModeCloud,
		ReferenceCount: 2,
		ReferenceURLs: mustJSON(t, []string{
			"https://cdn.example.com/ref-1.png",
			"https://cdn.example.com/ref-2.png",
		}),
		ReferenceThumbURLs: mustJSON(t, []string{
			"https://cdn.example.com/ref-1-thumb.jpg",
			"",
		}),
	}

	references, referenceThumbs := buildHistoryReferenceURLs(task, stubHistoryImageStore{
		reference: map[string]bool{
			fileKey("img_hist_ref_cloud", 0): true,
		},
		referenceThumb: map[string]bool{
			fileKey("img_hist_ref_cloud", 0): true,
		},
	})
	if len(references) != 2 || len(referenceThumbs) != 2 {
		t.Fatalf("unexpected counts: references=%d thumbs=%d", len(references), len(referenceThumbs))
	}
	if references[0] != "https://cdn.example.com/ref-1.png" || references[1] != "https://cdn.example.com/ref-2.png" {
		t.Fatalf("unexpected references: %#v", references)
	}
	if referenceThumbs[0] != "https://cdn.example.com/ref-1-thumb.jpg" {
		t.Fatalf("unexpected reference thumb 0: %q", referenceThumbs[0])
	}
	if referenceThumbs[1] != references[1] {
		t.Fatalf("expected cloud reference thumb fallback to original, got reference=%q thumb=%q", references[1], referenceThumbs[1])
	}
}

func TestToViewPreservesCloudRemoteURLs(t *testing.T) {
	SetProxyURLBuilder(func(taskID string, idx int) string {
		return "/p/img/" + taskID + "/proxy"
	})

	task := &Task{
		ID:                 1,
		TaskID:             "img_hist_cloud_view",
		UserID:             7,
		ModelID:            9,
		Prompt:             "cloud image",
		N:                  1,
		Size:               "1024x1024",
		Status:             StatusSuccess,
		StorageMode:        StorageModeCloud,
		ResultURLs:         mustJSON(t, []string{"https://cdn.example.com/original.png"}),
		ThumbURLs:          mustJSON(t, []string{"https://cdn.example.com/thumb.jpg"}),
		ReferenceCount:     1,
		ReferenceURLs:      mustJSON(t, []string{"https://cdn.example.com/ref.png"}),
		ReferenceThumbURLs: mustJSON(t, []string{"https://cdn.example.com/ref-thumb.jpg"}),
	}

	view := toView(task, stubHistoryImageStore{
		reference: map[string]bool{
			fileKey("img_hist_cloud_view", 0): true,
		},
		referenceThumb: map[string]bool{
			fileKey("img_hist_cloud_view", 0): true,
		},
	})
	if len(view.ImageURLs) != 1 || view.ImageURLs[0] != "https://cdn.example.com/original.png" {
		t.Fatalf("cloud image urls should stay remote, got %#v", view.ImageURLs)
	}
	if len(view.ThumbURLs) != 1 || view.ThumbURLs[0] != "https://cdn.example.com/thumb.jpg" {
		t.Fatalf("cloud thumb urls should stay remote, got %#v", view.ThumbURLs)
	}
	if len(view.ReferenceURLs) != 1 || view.ReferenceURLs[0] != "https://cdn.example.com/ref.png" {
		t.Fatalf("cloud reference urls should stay remote, got %#v", view.ReferenceURLs)
	}
	if len(view.ReferenceThumbURLs) != 1 || view.ReferenceThumbURLs[0] != "https://cdn.example.com/ref-thumb.jpg" {
		t.Fatalf("cloud reference thumb urls should stay remote, got %#v", view.ReferenceThumbURLs)
	}
}
