package gateway

import (
	"testing"

	modelpkg "github.com/432539/gpt2api/internal/model"
)

func TestNormalizeImageRequestByModelHonorsCapabilities(t *testing.T) {
	m := &modelpkg.Model{
		SupportsMultiImage: false,
		SupportsOutputSize: false,
	}

	n, size := normalizeImageRequestByModel(m, 4, "3840x2160")

	if n != 1 {
		t.Fatalf("n = %d, want 1", n)
	}
	if size != "" {
		t.Fatalf("size = %q, want empty", size)
	}
}

func TestNormalizeImageRequestByModelKeepsSupportedDefaults(t *testing.T) {
	m := &modelpkg.Model{
		SupportsMultiImage: true,
		SupportsOutputSize: true,
	}

	n, size := normalizeImageRequestByModel(m, 0, "")

	if n != 1 {
		t.Fatalf("n = %d, want 1", n)
	}
	if size != "1024x1024" {
		t.Fatalf("size = %q, want 1024x1024", size)
	}
}

func TestNormalizeLocalImageRequestByModelKeepsSizeForAccountPool(t *testing.T) {
	m := &modelpkg.Model{
		Type:               modelpkg.TypeImage,
		SupportsMultiImage: true,
		SupportsOutputSize: false,
	}

	n, size := normalizeLocalImageRequestByModel(m, 2, "3840x2160")

	if n != 2 {
		t.Fatalf("n = %d, want 2", n)
	}
	if size != "3840x2160" {
		t.Fatalf("size = %q, want 3840x2160", size)
	}
}

func TestNormalizeLocalImageRequestByModelDefaultsSizeForAccountPool(t *testing.T) {
	m := &modelpkg.Model{
		Type:               modelpkg.TypeImage,
		SupportsMultiImage: true,
		SupportsOutputSize: false,
	}

	n, size := normalizeLocalImageRequestByModel(m, 0, "")

	if n != 1 {
		t.Fatalf("n = %d, want 1", n)
	}
	if size != "1024x1024" {
		t.Fatalf("size = %q, want 1024x1024", size)
	}
}
