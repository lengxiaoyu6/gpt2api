package imagestore

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/432539/gpt2api/pkg/resp"
)

type fakeHandlerStore struct {
	listResource string
	listLimit    int
	listOffset   int
	deleteRes    string
	deleteNames  []string
	listItems    []FileInfo
	listTotal    int
	stats        DiskInfo
}

func (f *fakeHandlerStore) ListFiles(resource string, limit, offset int) ([]FileInfo, int, error) {
	f.listResource = resource
	f.listLimit = limit
	f.listOffset = offset
	return f.listItems, f.listTotal, nil
}

func (f *fakeHandlerStore) DeleteFiles(resource string, names []string) (int, error) {
	f.deleteRes = resource
	f.deleteNames = append([]string(nil), names...)
	return len(names), nil
}

func (f *fakeHandlerStore) DiskStats() (DiskInfo, error) {
	return f.stats, nil
}

func TestHandlerListOriginal(t *testing.T) {
	gin.SetMode(gin.TestMode)
	store := &fakeHandlerStore{
		listItems: []FileInfo{{
			Name:       "task_1_0.png",
			TaskID:     "task_1",
			Index:      0,
			SizeBytes:  1024,
			ModifiedAt: time.Unix(1710000000, 0).UTC(),
		}},
		listTotal: 1,
	}
	h := NewHandler(store)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/admin/system/image-files/original?limit=20&offset=10", nil)

	h.ListOriginal(c)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if store.listResource != ResourceOriginal || store.listLimit != 20 || store.listOffset != 10 {
		t.Fatalf("list args = %q %d %d", store.listResource, store.listLimit, store.listOffset)
	}
	var body resp.Body
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	data, ok := body.Data.(map[string]any)
	if !ok {
		t.Fatalf("data type = %T", body.Data)
	}
	if total, ok := data["total"].(float64); !ok || int(total) != 1 {
		t.Fatalf("total = %#v", data["total"])
	}
}

func TestHandlerDeleteThumb(t *testing.T) {
	gin.SetMode(gin.TestMode)
	store := &fakeHandlerStore{}
	h := NewHandler(store)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/admin/system/image-files/thumb/delete",
		bytes.NewBufferString(`{"names":["tmp_task_1_0.jpg","tmp_task_1_1.jpg"]}`))
	c.Request.Header.Set("Content-Type", "application/json")

	h.DeleteThumb(c)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if store.deleteRes != ResourceThumb {
		t.Fatalf("delete resource = %q", store.deleteRes)
	}
	if len(store.deleteNames) != 2 {
		t.Fatalf("delete names = %#v", store.deleteNames)
	}
}

func TestHandlerStats(t *testing.T) {
	gin.SetMode(gin.TestMode)
	store := &fakeHandlerStore{
		stats: DiskInfo{
			TotalBytes:        100,
			UsedBytes:         60,
			FreeBytes:         40,
			UsedPercent:       60,
			OriginalBytes:     30,
			ThumbBytes:        10,
			OriginalFileCount: 2,
			ThumbFileCount:    1,
		},
	}
	h := NewHandler(store)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/admin/system/image-files/stats", nil)

	h.Stats(c)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	var body resp.Body
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	data, ok := body.Data.(map[string]any)
	if !ok {
		t.Fatalf("data type = %T", body.Data)
	}
	if v, ok := data["original_file_count"].(float64); !ok || int(v) != 2 {
		t.Fatalf("original_file_count = %#v", data["original_file_count"])
	}
}
