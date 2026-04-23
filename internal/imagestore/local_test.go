package imagestore

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"testing"
)

func TestLocalStoreSaveFindListDeleteAndStats(t *testing.T) {
	store := NewLocal(LocalOptions{RootDir: t.TempDir()})

	saved, err := store.SaveTaskImages(context.Background(), "img_task_123", []SourceImage{
		{Index: 0, Data: mustPNGBytes(t, 120, 80), ContentType: "image/png"},
		{Index: 1, Data: mustJPEGBytes(t, 90, 60), ContentType: "image/jpeg"},
	})
	if err != nil {
		t.Fatalf("save task images: %v", err)
	}
	if len(saved) != 2 {
		t.Fatalf("saved count = %d", len(saved))
	}
	if saved[0].OriginalName != "img_task_123_0.png" {
		t.Fatalf("original name 0 = %s", saved[0].OriginalName)
	}
	if saved[1].OriginalName != "img_task_123_1.jpg" {
		t.Fatalf("original name 1 = %s", saved[1].OriginalName)
	}
	if saved[0].ThumbName != "tmp_img_task_123_0.jpg" {
		t.Fatalf("thumb name 0 = %s", saved[0].ThumbName)
	}

	original, ok, err := store.FindOriginal("img_task_123", 0)
	if err != nil {
		t.Fatalf("find original: %v", err)
	}
	if !ok || original.Name != "img_task_123_0.png" {
		t.Fatalf("unexpected original lookup: ok=%v info=%#v", ok, original)
	}
	thumb, ok, err := store.FindThumb("img_task_123", 1)
	if err != nil {
		t.Fatalf("find thumb: %v", err)
	}
	if !ok || thumb.Name != "tmp_img_task_123_1.jpg" {
		t.Fatalf("unexpected thumb lookup: ok=%v info=%#v", ok, thumb)
	}

	originalItems, total, err := store.ListFiles(ResourceOriginal, 10, 0)
	if err != nil {
		t.Fatalf("list originals: %v", err)
	}
	if total != 2 || len(originalItems) != 2 {
		t.Fatalf("unexpected original list: total=%d len=%d", total, len(originalItems))
	}
	if originalItems[0].TaskID != "img_task_123" {
		t.Fatalf("unexpected task id in list: %#v", originalItems[0])
	}

	stats, err := store.DiskStats()
	if err != nil {
		t.Fatalf("disk stats: %v", err)
	}
	if stats.OriginalBytes == 0 || stats.ThumbBytes == 0 {
		t.Fatalf("unexpected stats: %#v", stats)
	}

	deleted, err := store.DeleteFiles(ResourceThumb, []string{"tmp_img_task_123_0.jpg", "missing.jpg"})
	if err != nil {
		t.Fatalf("delete thumb files: %v", err)
	}
	if deleted != 1 {
		t.Fatalf("deleted = %d", deleted)
	}
	_, ok, err = store.FindThumb("img_task_123", 0)
	if err != nil {
		t.Fatalf("find deleted thumb: %v", err)
	}
	if ok {
		t.Fatal("expected deleted thumb to be missing")
	}
}

func mustPNGBytes(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	fillImage(img)
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("encode png: %v", err)
	}
	return buf.Bytes()
}

func mustJPEGBytes(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	fillImage(img)
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatalf("encode jpeg: %v", err)
	}
	return buf.Bytes()
}

func fillImage(img *image.RGBA) {
	bounds := img.Bounds()
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x % 255), G: uint8(y % 255), B: 180, A: 255})
		}
	}
}
