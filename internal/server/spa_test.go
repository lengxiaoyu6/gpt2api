package server

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
)

type stubSettings struct {
	values map[string]string
}

func (s stubSettings) GetString(key string) string {
	return s.values[key]
}

func TestNormalizeHostName(t *testing.T) {
	if got := normalizeHostName("HTTPS://IMGWAP.DOMAIN.COM:443"); got != "imgwap.domain.com" {
		t.Fatalf("unexpected normalized host: %s", got)
	}
}

func TestChooseSiteByHost(t *testing.T) {
	if got := chooseSiteByHost("imgwap.domain.com", "imgwap.domain.com"); got != siteWAP {
		t.Fatalf("expected wap site, got %q", got)
	}
	if got := chooseSiteByHost("img.domain.com", "imgwap.domain.com"); got != siteWeb {
		t.Fatalf("expected web site, got %q", got)
	}
}

func TestMountSPAServesSiteByHost(t *testing.T) {
	gin.SetMode(gin.TestMode)

	root := t.TempDir()
	webDir := filepath.Join(root, "web", "dist")
	wapDir := filepath.Join(root, "wap", "dist")
	mustWriteFile(t, filepath.Join(webDir, "index.html"), "<html>web</html>")
	mustWriteFile(t, filepath.Join(wapDir, "index.html"), "<html>wap</html>")

	t.Setenv("GPT2API_WEB_DIR", webDir)
	t.Setenv("GPT2API_WAP_DIR", wapDir)

	svc := stubSettings{values: map[string]string{"site.wap_domain": "https://IMGWAP.DOMAIN.COM:443"}}

	r := gin.New()
	if !mountSPA(r, svc) {
		t.Fatal("expected spa to be mounted")
	}

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Host = "img.domain.com"
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if body := rec.Body.String(); body != "<html>web</html>" {
		t.Fatalf("unexpected web body: %s", body)
	}

	req = httptest.NewRequest(http.MethodGet, "/", nil)
	req.Host = "imgwap.domain.com"
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if body := rec.Body.String(); body != "<html>wap</html>" {
		t.Fatalf("unexpected wap body: %s", body)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/unknown", nil)
	req.Host = "imgwap.domain.com"
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for api path, got %d", rec.Code)
	}
}

func TestMountSPAFallsBackToWebWhenWAPMissing(t *testing.T) {
	gin.SetMode(gin.TestMode)

	root := t.TempDir()
	webDir := filepath.Join(root, "web", "dist")
	mustWriteFile(t, filepath.Join(webDir, "index.html"), "<html>web</html>")

	t.Setenv("GPT2API_WEB_DIR", webDir)
	t.Setenv("GPT2API_WAP_DIR", filepath.Join(root, "missing-wap"))

	svc := stubSettings{values: map[string]string{"site.wap_domain": "imgwap.domain.com"}}

	r := gin.New()
	if !mountSPA(r, svc) {
		t.Fatal("expected spa to be mounted")
	}

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Host = "imgwap.domain.com"
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if body := rec.Body.String(); body != "<html>web</html>" {
		t.Fatalf("expected web fallback body, got %s", body)
	}
}

func mustWriteFile(t *testing.T, path string, body string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatalf("write file: %v", err)
	}
}
