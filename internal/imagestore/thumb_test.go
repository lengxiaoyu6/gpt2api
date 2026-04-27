package imagestore

import (
	"bytes"
	"image"
	"net/http"
	"testing"
)

func TestBuildThumbnailKeepsOriginalSizeWhenMaxEdgeUnset(t *testing.T) {
	out, contentType, err := BuildThumbnail(mustPNGBytes(t, 1200, 800), ThumbnailOptions{Quality: 80})
	if err != nil {
		t.Fatalf("BuildThumbnail: %v", err)
	}
	if contentType != "image/jpeg" {
		t.Fatalf("content type = %s", contentType)
	}
	if got := http.DetectContentType(out); got != "image/jpeg" {
		t.Fatalf("detected content type = %s", got)
	}
	img, _, err := image.Decode(bytes.NewReader(out))
	if err != nil {
		t.Fatalf("decode thumbnail: %v", err)
	}
	bounds := img.Bounds()
	if bounds.Dx() != 1200 || bounds.Dy() != 800 {
		t.Fatalf("thumbnail size = %dx%d", bounds.Dx(), bounds.Dy())
	}
}

func TestBuildThumbnailConvertsPNGToJPEGAndResizes(t *testing.T) {
	out, contentType, err := BuildThumbnail(mustPNGBytes(t, 1200, 800), ThumbnailOptions{MaxEdge: 480, Quality: 80})
	if err != nil {
		t.Fatalf("BuildThumbnail: %v", err)
	}
	if contentType != "image/jpeg" {
		t.Fatalf("content type = %s", contentType)
	}
	if got := http.DetectContentType(out); got != "image/jpeg" {
		t.Fatalf("detected content type = %s", got)
	}
	img, _, err := image.Decode(bytes.NewReader(out))
	if err != nil {
		t.Fatalf("decode thumbnail: %v", err)
	}
	bounds := img.Bounds()
	if bounds.Dx() != 480 || bounds.Dy() != 320 {
		t.Fatalf("thumbnail size = %dx%d", bounds.Dx(), bounds.Dy())
	}
}
