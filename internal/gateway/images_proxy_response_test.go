package gateway

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestWriteInlineImageSetsInlineDisposition(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)

	writeInlineImage(c, http.StatusOK, "image/png", []byte("png-bytes"))

	res := w.Result()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", res.StatusCode)
	}
	if got := res.Header.Get("Content-Disposition"); got != "inline" {
		t.Fatalf("content disposition = %q", got)
	}
	if got := res.Header.Get("Content-Type"); got != "image/png" {
		t.Fatalf("content type = %q", got)
	}
}

func TestWriteDownloadImageSetsAttachmentDisposition(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)

	writeDownloadImage(c, http.StatusOK, "image/png", "task-1-1.png", []byte("png-bytes"))

	res := w.Result()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", res.StatusCode)
	}
	if got := res.Header.Get("Content-Disposition"); got != `attachment; filename="task-1-1.png"` {
		t.Fatalf("content disposition = %q", got)
	}
	if got := res.Header.Get("Content-Type"); got != "image/png" {
		t.Fatalf("content type = %q", got)
	}
}
