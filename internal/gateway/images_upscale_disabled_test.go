package gateway

import (
	"os"
	"strings"
	"testing"
)

func TestImageProxyDoesNotPerformLocalUpscale(t *testing.T) {
	srcBytes, err := os.ReadFile("images_proxy.go")
	if err != nil {
		t.Fatalf("read images_proxy.go: %v", err)
	}
	src := string(srcBytes)
	for _, needle := range []string{
		"DoUpscale",
		"NewUpscaleCache",
		"X-Upscale",
		"ValidateUpscale(t.Upscale)",
	} {
		if strings.Contains(src, needle) {
			t.Fatalf("images_proxy.go still contains local upscale marker %q", needle)
		}
	}
}

func TestImageHandlersIgnoreLegacyUpscaleInput(t *testing.T) {
	srcBytes, err := os.ReadFile("images.go")
	if err != nil {
		t.Fatalf("read images.go: %v", err)
	}
	src := string(srcBytes)
	for _, needle := range []string{
		"req.Upscale = image.ValidateUpscale(req.Upscale)",
		"Upscale:         req.Upscale",
		`image.ValidateUpscale(c.Request.FormValue("upscale"))`,
		"Upscale:         upscale",
	} {
		if strings.Contains(src, needle) {
			t.Fatalf("images.go still consumes legacy upscale input via %q", needle)
		}
	}
}
