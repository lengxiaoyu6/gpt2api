package image

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"sync/atomic"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
	_ "github.com/mattn/go-sqlite3"
)

func newAdminHandlerTestDB(t *testing.T) *sqlx.DB {
	t.Helper()

	db := sqlx.MustOpen("sqlite3", ":memory:")
	schema := []string{
		`CREATE TABLE users (
			id INTEGER PRIMARY KEY,
			email TEXT
		)`,
		`CREATE TABLE models (
			id INTEGER PRIMARY KEY,
			slug TEXT
		)`,
		`CREATE TABLE image_tasks (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			task_id TEXT,
			user_id INTEGER,
			key_id INTEGER,
			model_id INTEGER,
			account_id INTEGER,
			prompt TEXT,
			n INTEGER,
			size TEXT,
			upscale TEXT,
			storage_mode TEXT,
			status TEXT,
			conversation_id TEXT,
			file_ids TEXT,
			result_urls TEXT,
			thumb_urls TEXT,
			reference_count INTEGER,
			reference_urls TEXT,
			reference_thumb_urls TEXT,
			error TEXT,
			estimated_credit INTEGER,
			credit_cost INTEGER,
			created_at DATETIME,
			started_at DATETIME,
			finished_at DATETIME,
			deleted_at DATETIME
		)`,
	}
	for _, stmt := range schema {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatalf("create schema: %v", err)
		}
	}
	return db
}

func TestAdminListReturnsPreviewThumbsAndRawDownloadsSeparately(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := newAdminHandlerTestDB(t)
	t.Cleanup(func() { _ = db.Close() })

	SetProxyURLBuilder(func(taskID string, idx int) string {
		return "/p/img/" + taskID + "/" + strconv.Itoa(idx)
	})
	t.Cleanup(func() {
		proxyURLBuilder = atomic.Value{}
	})

	if _, err := db.Exec(`INSERT INTO users (id, email) VALUES (?, ?)`, 7, "admin-image@example.com"); err != nil {
		t.Fatalf("insert user: %v", err)
	}
	if _, err := db.Exec(`
INSERT INTO image_tasks
  (task_id, user_id, key_id, model_id, account_id, prompt, n, size, upscale, storage_mode, status,
   conversation_id, file_ids, result_urls, thumb_urls, reference_count, reference_urls, reference_thumb_urls,
   error, estimated_credit, credit_cost, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
		"img_admin_preview",
		7,
		1,
		2,
		3,
		"admin preview image",
		2,
		"1024x1024",
		"",
		StorageModeCloud,
		StatusSuccess,
		"conv_admin_preview",
		mustJSON(t, []string{"file-1", "file-2"}),
		mustJSON(t, []string{
			"https://cdn.example.com/original-1.png",
			"https://cdn.example.com/original-2.png",
		}),
		mustJSON(t, []string{
			"https://cdn.example.com/thumb-1.jpg",
			"",
		}),
		0,
		nil,
		nil,
		"",
		18,
		16,
	); err != nil {
		t.Fatalf("insert image task: %v", err)
	}

	h := NewAdminHandler(NewDAO(db))
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/admin/image-tasks?page=1&page_size=20", nil)

	h.List(c)

	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}

	var body struct {
		Code int `json:"code"`
		Data struct {
			List []struct {
				TaskID            string   `json:"task_id"`
				ResultURLsParsed  []string `json:"result_urls_parsed"`
				PreviewURLsParsed []string `json:"preview_urls_parsed"`
			} `json:"list"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if body.Code != 0 {
		t.Fatalf("code=%d body=%s", body.Code, w.Body.String())
	}
	if len(body.Data.List) != 1 {
		t.Fatalf("list len=%d body=%s", len(body.Data.List), w.Body.String())
	}

	row := body.Data.List[0]
	if got, want := row.PreviewURLsParsed, []string{
		"https://cdn.example.com/thumb-1.jpg",
		"https://cdn.example.com/original-2.png",
	}; len(got) != len(want) || got[0] != want[0] || got[1] != want[1] {
		t.Fatalf("preview_urls_parsed=%#v want=%#v", got, want)
	}
	if got, want := row.ResultURLsParsed, []string{
		"https://cdn.example.com/original-1.png",
		"https://cdn.example.com/original-2.png",
	}; len(got) != len(want) || got[0] != want[0] || got[1] != want[1] {
		t.Fatalf("result_urls_parsed=%#v want=%#v", got, want)
	}
}

func TestAdminListReturnsModelSlug(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := newAdminHandlerTestDB(t)
	t.Cleanup(func() { _ = db.Close() })

	if _, err := db.Exec(`INSERT INTO users (id, email) VALUES (?, ?)`, 8, "model-show@example.com"); err != nil {
		t.Fatalf("insert user: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO models (id, slug) VALUES (?, ?)`, 2, "gpt-image-1"); err != nil {
		t.Fatalf("insert model: %v", err)
	}
	if _, err := db.Exec(`
INSERT INTO image_tasks
  (task_id, user_id, key_id, model_id, account_id, prompt, n, size, upscale, storage_mode, status,
   conversation_id, file_ids, result_urls, thumb_urls, reference_count, reference_urls, reference_thumb_urls,
   error, estimated_credit, credit_cost, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
		"img_admin_model",
		8,
		1,
		2,
		3,
		"show model slug",
		1,
		"1024x1024",
		"",
		StorageModeCloud,
		StatusSuccess,
		"conv_admin_model",
		mustJSON(t, []string{"file-1"}),
		mustJSON(t, []string{"https://cdn.example.com/original-model.png"}),
		mustJSON(t, []string{"https://cdn.example.com/thumb-model.jpg"}),
		0,
		nil,
		nil,
		"",
		18,
		16,
	); err != nil {
		t.Fatalf("insert image task: %v", err)
	}

	h := NewAdminHandler(NewDAO(db))
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/admin/image-tasks?page=1&page_size=20", nil)

	h.List(c)

	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}

	var body struct {
		Code int `json:"code"`
		Data struct {
			List []struct {
				TaskID    string `json:"task_id"`
				ModelID   uint64 `json:"model_id"`
				ModelSlug string `json:"model_slug"`
			} `json:"list"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if body.Code != 0 {
		t.Fatalf("code=%d body=%s", body.Code, w.Body.String())
	}
	if len(body.Data.List) != 1 {
		t.Fatalf("list len=%d body=%s", len(body.Data.List), w.Body.String())
	}

	row := body.Data.List[0]
	if row.ModelID != 2 {
		t.Fatalf("model_id=%d want=2", row.ModelID)
	}
	if row.ModelSlug != "gpt-image-1" {
		t.Fatalf("model_slug=%q want=%q", row.ModelSlug, "gpt-image-1")
	}
}
