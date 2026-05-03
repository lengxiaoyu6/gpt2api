package account

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
	_ "github.com/mattn/go-sqlite3"
)

func newHandlerTestDB(t *testing.T) *sqlx.DB {
	t.Helper()

	db := sqlx.MustOpen("sqlite3", ":memory:")
	for _, stmt := range []string{
		`CREATE TABLE oai_accounts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			image_quota_remaining INTEGER NOT NULL DEFAULT 0,
			image_quota_total INTEGER NOT NULL DEFAULT 0,
			deleted_at DATETIME NULL
		)`,
		`INSERT INTO oai_accounts (image_quota_remaining, image_quota_total, deleted_at) VALUES
			(12, 20, NULL),
			(8, 30, NULL),
			(99, 99, datetime('now'))`,
	} {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatalf("exec %q: %v", stmt, err)
		}
	}
	return db
}

func TestLocalPoolQuotaSummaryReturnsAggregatedQuota(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := newHandlerTestDB(t)
	t.Cleanup(func() { _ = db.Close() })

	h := NewHandler(NewService(NewDAO(db), nil))
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/me/local-pool-quota-summary", nil)

	h.LocalPoolQuotaSummary(c)

	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}

	var body struct {
		Code int `json:"code"`
		Data struct {
			TotalRemaining int64 `json:"total_remaining"`
			TotalCapacity  int64 `json:"total_capacity"`
			ActiveAccounts int64 `json:"active_accounts"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if body.Code != 0 {
		t.Fatalf("code=%d body=%s", body.Code, w.Body.String())
	}
	if body.Data.TotalRemaining != 20 {
		t.Fatalf("total_remaining=%d want=20", body.Data.TotalRemaining)
	}
	if body.Data.TotalCapacity != 50 {
		t.Fatalf("total_capacity=%d want=50", body.Data.TotalCapacity)
	}
	if body.Data.ActiveAccounts != 2 {
		t.Fatalf("active_accounts=%d want=2", body.Data.ActiveAccounts)
	}
}
