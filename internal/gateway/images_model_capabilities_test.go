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
