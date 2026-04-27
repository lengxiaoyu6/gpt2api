package gateway

import "testing"

func TestAspectRatioFromImageSizeReducesDimensions(t *testing.T) {
	tests := []struct {
		name string
		size string
		want string
	}{
		{name: "square", size: "1024x1024", want: "1:1"},
		{name: "wide", size: "3840x2160", want: "16:9"},
		{name: "portrait", size: "1344x2016", want: "2:3"},
		{name: "ultrawide", size: "3696x1584", want: "21:9"},
		{name: "upper separator", size: "2160X3840", want: "9:16"},
		{name: "invalid", size: "auto", want: ""},
		{name: "empty", size: "", want: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := aspectRatioFromImageSize(tt.size); got != tt.want {
				t.Fatalf("aspectRatioFromImageSize(%q) = %q, want %q", tt.size, got, tt.want)
			}
		})
	}
}

func TestApplyImageSizeRatioPrefixAddsRatioForLocalRunner(t *testing.T) {
	got := applyImageSizeRatioPrefix("portrait relight", "1344x2016")
	want := "Make the aspect ratio 2:3 , portrait relight"

	if got != want {
		t.Fatalf("prompt = %q, want %q", got, want)
	}
}

func TestApplyImageSizeRatioPrefixReplacesExistingRatioPrefix(t *testing.T) {
	got := applyImageSizeRatioPrefix("Make the aspect ratio 1:1 , portrait relight", "3840x2160")
	want := "Make the aspect ratio 16:9 , portrait relight"

	if got != want {
		t.Fatalf("prompt = %q, want %q", got, want)
	}
}

func TestApplyImageSizeRatioPrefixKeepsPromptWhenSizeInvalid(t *testing.T) {
	got := applyImageSizeRatioPrefix("portrait relight", "")
	want := "portrait relight"

	if got != want {
		t.Fatalf("prompt = %q, want %q", got, want)
	}
}
