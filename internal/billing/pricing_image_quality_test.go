package billing

import (
	"testing"

	modelpkg "github.com/432539/gpt2api/internal/model"
)

func TestResolveImageQualityBySize(t *testing.T) {
	cases := []struct {
		size string
		want string
	}{
		{size: "", want: "1K"},
		{size: "1024x1024", want: "1K"},
		{size: "2048x1152", want: "2K"},
		{size: "3840x2160", want: "4K"},
	}

	for _, tc := range cases {
		if got := ResolveImageQualityBySize(tc.size); got != tc.want {
			t.Fatalf("ResolveImageQualityBySize(%q) = %q, want %q", tc.size, got, tc.want)
		}
	}
}

func TestComputeImageCostUsesQualitySpecificPrice(t *testing.T) {
	m := &modelpkg.Model{
		ImagePricePerCall:   1000,
		ImagePricePerCall2K: 2500,
		ImagePricePerCall4K: 4800,
	}

	if got := ComputeImageCost(m, 2, 1.5, "2048x2048"); got != 7500 {
		t.Fatalf("2K cost = %d, want 7500", got)
	}
	if got := ComputeImageCost(m, 1, 1, "3840x2160"); got != 4800 {
		t.Fatalf("4K cost = %d, want 4800", got)
	}
	if got := ComputeImageCost(m, 3, 1, "1024x1024"); got != 3000 {
		t.Fatalf("1K cost = %d, want 3000", got)
	}
}

func TestComputeImageCostFallsBackToBasePriceWhenHighTierPriceMissing(t *testing.T) {
	m := &modelpkg.Model{
		ImagePricePerCall:   1200,
		ImagePricePerCall2K: 0,
		ImagePricePerCall4K: 0,
	}

	if got := ComputeImageCost(m, 2, 1, "2048x1536"); got != 2400 {
		t.Fatalf("2K fallback cost = %d, want 2400", got)
	}
	if got := ComputeImageCost(m, 2, 1, "3264x2448"); got != 2400 {
		t.Fatalf("4K fallback cost = %d, want 2400", got)
	}
}
