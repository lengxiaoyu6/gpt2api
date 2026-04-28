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

func TestLocalStoreDefaultThumbKeepsOriginalSize(t *testing.T) {
	store := NewLocal(LocalOptions{RootDir: t.TempDir()})

	_, err := store.SaveTaskImages(context.Background(), "img_task_large", []SourceImage{
		{Index: 0, Data: mustPNGBytes(t, 1200, 800), ContentType: "image/png"},
	})
	if err != nil {
		t.Fatalf("save task images: %v", err)
	}

	thumbData, contentType, ok, err := store.ReadThumb("img_task_large", 0)
	if err != nil {
		t.Fatalf("read thumb: %v", err)
	}
	if !ok {
		t.Fatal("expected thumb exists")
	}
	if contentType != "image/jpeg" {
		t.Fatalf("content type = %s", contentType)
	}
	img, _, err := image.Decode(bytes.NewReader(thumbData))
	if err != nil {
		t.Fatalf("decode thumb: %v", err)
	}
	if got := img.Bounds(); got.Dx() != 1200 || got.Dy() != 800 {
		t.Fatalf("thumb size = %dx%d", got.Dx(), got.Dy())
	}
}

func TestLocalStoreSaveFindAndReadTaskReferences(t *testing.T) {
	store := NewLocal(LocalOptions{RootDir: t.TempDir()})

	saved, err := store.SaveTaskReferences(context.Background(), "img_ref_123", []SourceImage{
		{Index: 0, Data: mustPNGBytes(t, 120, 80), ContentType: "image/png"},
		{Index: 1, Data: mustJPEGBytes(t, 90, 60), ContentType: "image/jpeg"},
	})
	if err != nil {
		t.Fatalf("save task references: %v", err)
	}
	if len(saved) != 2 {
		t.Fatalf("saved count = %d", len(saved))
	}
	if saved[0].OriginalName != "ref_img_ref_123_0.png" {
		t.Fatalf("reference original name 0 = %s", saved[0].OriginalName)
	}
	if saved[1].ThumbName != "tmp_ref_img_ref_123_1.jpg" {
		t.Fatalf("reference thumb name 1 = %s", saved[1].ThumbName)
	}

	reference, ok, err := store.FindReference("img_ref_123", 0)
	if err != nil {
		t.Fatalf("find reference: %v", err)
	}
	if !ok || reference.Name != "ref_img_ref_123_0.png" {
		t.Fatalf("unexpected reference lookup: ok=%v info=%#v", ok, reference)
	}
	referenceThumb, ok, err := store.FindReferenceThumb("img_ref_123", 1)
	if err != nil {
		t.Fatalf("find reference thumb: %v", err)
	}
	if !ok || referenceThumb.Name != "tmp_ref_img_ref_123_1.jpg" {
		t.Fatalf("unexpected reference thumb lookup: ok=%v info=%#v", ok, referenceThumb)
	}

	refData, refContentType, ok, err := store.ReadReference("img_ref_123", 0)
	if err != nil {
		t.Fatalf("read reference: %v", err)
	}
	if !ok || len(refData) == 0 {
		t.Fatalf("unexpected reference bytes: ok=%v len=%d", ok, len(refData))
	}
	if refContentType != "image/png" {
		t.Fatalf("reference content type = %s", refContentType)
	}

	refThumbData, refThumbContentType, ok, err := store.ReadReferenceThumb("img_ref_123", 1)
	if err != nil {
		t.Fatalf("read reference thumb: %v", err)
	}
	if !ok || len(refThumbData) == 0 {
		t.Fatalf("unexpected reference thumb bytes: ok=%v len=%d", ok, len(refThumbData))
	}
	if refThumbContentType != "image/jpeg" {
		t.Fatalf("reference thumb content type = %s", refThumbContentType)
	}
}

func TestLocalStoreSaveTaskReferencesAcceptsFilenameFallbackAndPlaceholderThumb(t *testing.T) {
	store := NewLocal(LocalOptions{RootDir: t.TempDir()})

	saved, err := store.SaveTaskReferences(context.Background(), "img_ref_placeholder", []SourceImage{
		{
			Index:       0,
			FileName:    "reference.png",
			Data:        []byte("not-a-real-image"),
			ContentType: "application/octet-stream",
		},
	})
	if err != nil {
		t.Fatalf("save task references: %v", err)
	}
	if len(saved) != 1 {
		t.Fatalf("saved count = %d", len(saved))
	}
	if saved[0].OriginalName != "ref_img_ref_placeholder_0.png" {
		t.Fatalf("reference original name = %s", saved[0].OriginalName)
	}
	if saved[0].ThumbName != "tmp_ref_img_ref_placeholder_0.jpg" {
		t.Fatalf("reference thumb name = %s", saved[0].ThumbName)
	}

	refData, refContentType, ok, err := store.ReadReference("img_ref_placeholder", 0)
	if err != nil {
		t.Fatalf("read reference: %v", err)
	}
	if !ok {
		t.Fatal("expected reference exists")
	}
	if string(refData) != "not-a-real-image" {
		t.Fatalf("reference data = %q", string(refData))
	}
	if refContentType != "image/png" {
		t.Fatalf("reference content type = %s", refContentType)
	}

	refThumbData, refThumbContentType, ok, err := store.ReadReferenceThumb("img_ref_placeholder", 0)
	if err != nil {
		t.Fatalf("read reference thumb: %v", err)
	}
	if !ok {
		t.Fatal("expected reference thumb exists")
	}
	if refThumbContentType != "image/jpeg" {
		t.Fatalf("reference thumb content type = %s", refThumbContentType)
	}
	if _, _, err := image.Decode(bytes.NewReader(refThumbData)); err != nil {
		t.Fatalf("decode reference thumb: %v", err)
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
