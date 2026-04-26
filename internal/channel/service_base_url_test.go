package channel

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestChannelServiceKeepsConfiguredBaseURLVerbatim(t *testing.T) {
	path := filepath.Join("service.go")
	body, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read service.go: %v", err)
	}
	src := string(body)

	if strings.Contains(src, `strings.TrimRight(in.BaseURL, "/")`) {
		t.Fatalf("service.go still trims base_url before save")
	}
	if !strings.Contains(src, `BaseURL:   in.BaseURL,`) {
		t.Fatalf("create path does not preserve base_url verbatim")
	}
	if !strings.Contains(src, `c.BaseURL = in.BaseURL`) {
		t.Fatalf("update path does not preserve base_url verbatim")
	}
}
