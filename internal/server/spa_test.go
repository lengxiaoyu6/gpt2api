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
	if got := normalizeHostName("HTTPS://IMG.DOMAIN.COM:443"); got != "img.domain.com" {
		t.Fatalf("unexpected normalized host: %s", got)
	}
}

func TestChooseSiteByHost(t *testing.T) {
	if got := chooseSiteByHost("img.domain.com", "img.domain.com"); got != siteWeb {
		t.Fatalf("expected web site, got %q", got)
	}
	if got := chooseSiteByHost("admin.domain.com", "img.domain.com"); got != siteAdmin {
		t.Fatalf("expected admin site, got %q", got)
	}
}

func TestWebDomainUsesLegacyWAPDomainWhenWebDomainEmpty(t *testing.T) {
	svc := stubSettings{values: map[string]string{"site.wap_domain": "https://IMGWAP.DOMAIN.COM:443"}}
	if got := webDomain(svc); got != "https://IMGWAP.DOMAIN.COM:443" {
		t.Fatalf("expected legacy wap domain fallback, got %q", got)
	}
}

func TestMountSPAServesSiteByHost(t *testing.T) {
	gin.SetMode(gin.TestMode)

	root := t.TempDir()
	adminDir := filepath.Join(root, "admin", "dist")
	webDir := filepath.Join(root, "web", "dist")
	mustWriteFile(t, filepath.Join(adminDir, "index.html"), "<html>admin</html>")
	mustWriteFile(t, filepath.Join(webDir, "index.html"), "<html>web</html>")

	t.Setenv("GPT2API_ADMIN_DIR", adminDir)
	t.Setenv("GPT2API_WEB_DIR", webDir)

	svc := stubSettings{values: map[string]string{"site.web_domain": "https://IMG.DOMAIN.COM:443"}}

	r := gin.New()
	if !mountSPA(r, svc) {
		t.Fatal("expected spa to be mounted")
	}

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Host = "admin.domain.com"
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if body := rec.Body.String(); body != "<html>admin</html>" {
		t.Fatalf("unexpected admin body: %s", body)
	}

	req = httptest.NewRequest(http.MethodGet, "/", nil)
	req.Host = "img.domain.com"
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if body := rec.Body.String(); body != "<html>web</html>" {
		t.Fatalf("unexpected web body: %s", body)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/unknown", nil)
	req.Host = "img.domain.com"
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for api path, got %d", rec.Code)
	}
}

func TestMountSPAFallsBackToAdminWhenWebMissing(t *testing.T) {
	gin.SetMode(gin.TestMode)

	root := t.TempDir()
	adminDir := filepath.Join(root, "admin", "dist")
	mustWriteFile(t, filepath.Join(adminDir, "index.html"), "<html>admin</html>")

	t.Setenv("GPT2API_ADMIN_DIR", adminDir)
	t.Setenv("GPT2API_WEB_DIR", filepath.Join(root, "missing-web"))

	svc := stubSettings{values: map[string]string{"site.web_domain": "img.domain.com"}}

	r := gin.New()
	if !mountSPA(r, svc) {
		t.Fatal("expected spa to be mounted")
	}

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Host = "img.domain.com"
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if body := rec.Body.String(); body != "<html>admin</html>" {
		t.Fatalf("expected admin fallback body, got %s", body)
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
