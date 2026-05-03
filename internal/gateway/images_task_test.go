package gateway

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/432539/gpt2api/internal/apikey"
	"github.com/432539/gpt2api/internal/image"
	modelpkg "github.com/432539/gpt2api/internal/model"
)

func TestBuildAPIImageDataUsesProxyURLsForLocalTasks(t *testing.T) {
	data := buildAPIImageData("img_local_123", "local", []string{"https://origin.example.com/1.png", "https://origin.example.com/2.png"}, nil, []string{"sed:file-1", "file-2"})
	if len(data) != 2 {
		t.Fatalf("len(data) = %d", len(data))
	}
	if data[0].URL == "https://origin.example.com/1.png" {
		t.Fatalf("expected local task to use proxy url, got %q", data[0].URL)
	}
	if data[0].ThumbURL == "" || data[0].ThumbURL == data[0].URL {
		t.Fatalf("expected local task to include separate thumb url, got %#v", data[0])
	}
	if data[0].FileID != "file-1" || data[1].FileID != "file-2" {
		t.Fatalf("unexpected file ids: %#v", data)
	}
}

func TestBuildAPIImageDataUsesProxyURLsForCloudTasks(t *testing.T) {
	data := buildAPIImageData(
		"img_cloud_123",
		"cloud",
		[]string{"https://cdn.example.com/1.png", "https://cdn.example.com/2.png"},
		[]string{"https://cdn.example.com/1_thumb.jpg", "https://cdn.example.com/2_thumb.jpg"},
		[]string{"sed:file-1", "file-2"},
	)
	if len(data) != 2 {
		t.Fatalf("len(data) = %d", len(data))
	}
	if data[0].URL != "https://cdn.example.com/1.png" || data[1].URL != "https://cdn.example.com/2.png" {
		t.Fatalf("expected cloud task to use remote url, got %#v", data)
	}
	if data[0].ThumbURL != "https://cdn.example.com/1_thumb.jpg" || data[1].ThumbURL != "https://cdn.example.com/2_thumb.jpg" {
		t.Fatalf("expected cloud task to include remote thumb urls, got %#v", data)
	}
	if data[0].FileID != "file-1" || data[1].FileID != "file-2" {
		t.Fatalf("unexpected file ids: %#v", data)
	}
}

func TestImageResponseAccountingUsesActualDataCount(t *testing.T) {
	m := &modelpkg.Model{
		ImagePricePerCall:   1000,
		ImagePricePerCall4K: 3000,
	}
	data := []ImageGenData{{URL: "https://example.com/only-one.png"}}

	actualN, cost := imageResponseAccounting(m, data, 1.5, "3840x2160")
	if actualN != 1 {
		t.Fatalf("actualN = %d", actualN)
	}
	if cost != 4500 {
		t.Fatalf("cost = %d", cost)
	}
}

func TestImageTaskReturnsPhaseAndBillingFieldsForPartialSuccess(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := newImageTaskSQLiteDB(t)
	if _, err := db.Exec(`
INSERT INTO image_tasks
  (task_id, user_id, key_id, model_id, account_id, prompt, n, size, upscale, storage_mode, status,
   conversation_id, file_ids, result_urls, thumb_urls, reference_count, reference_urls, reference_thumb_urls,
   error, estimated_credit, credit_cost, created_at, finished_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
		"img_task_partial",
		2,
		1,
		1,
		8,
		"partial success image",
		4,
		"1024x1024",
		"",
		image.StorageModeCloud,
		image.StatusSuccess,
		"conv_partial",
		mustJSONForTaskTest(t, []string{"file-1", "file-2", "file-3"}),
		mustJSONForTaskTest(t, []string{
			"https://cdn.example.com/1.png",
			"https://cdn.example.com/2.png",
			"https://cdn.example.com/3.png",
		}),
		mustJSONForTaskTest(t, []string{
			"https://cdn.example.com/1-thumb.jpg",
			"https://cdn.example.com/2-thumb.jpg",
			"https://cdn.example.com/3-thumb.jpg",
		}),
		0,
		nil,
		nil,
		"",
		120,
		90,
	); err != nil {
		t.Fatalf("insert task: %v", err)
	}

	h := &ImagesHandler{DAO: image.NewDAO(db)}
	c, recorder := newAuthedImageTestContext(http.MethodGet, "/v1/images/tasks/img_task_partial", nil, "", &apikey.APIKey{ID: 1, UserID: 2})
	c.Params = gin.Params{{Key: "id", Value: "img_task_partial"}}

	h.ImageTask(c)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
	}

	var body struct {
		TaskID          string         `json:"task_id"`
		Phase           string         `json:"phase"`
		PhaseLabel      string         `json:"phase_label"`
		EstimatedCredit int64          `json:"estimated_credit"`
		ActualCount     int            `json:"actual_count"`
		BillingStatus   string         `json:"billing_status"`
		BillingNote     string         `json:"billing_note"`
		Data            []ImageGenData `json:"data"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal body: %v", err)
	}
	if body.TaskID != "img_task_partial" {
		t.Fatalf("task_id = %q", body.TaskID)
	}
	if body.Phase != "completed" || body.PhaseLabel != "已完成" {
		t.Fatalf("phase = %q %q", body.Phase, body.PhaseLabel)
	}
	if body.EstimatedCredit != 120 {
		t.Fatalf("estimated_credit = %d", body.EstimatedCredit)
	}
	if body.ActualCount != 3 {
		t.Fatalf("actual_count = %d", body.ActualCount)
	}
	if body.BillingStatus != "settled_partial" {
		t.Fatalf("billing_status = %q", body.BillingStatus)
	}
	if body.BillingNote != "提交 4 张，成功 3 张，已按实际结果扣除 90 积分" {
		t.Fatalf("billing_note = %q", body.BillingNote)
	}
	if len(body.Data) != 3 {
		t.Fatalf("len(data) = %d", len(body.Data))
	}
}

func TestImageTaskReturnsPendingBillingFieldsForRunningTask(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := newImageTaskSQLiteDB(t)
	if _, err := db.Exec(`
INSERT INTO image_tasks
  (task_id, user_id, key_id, model_id, account_id, prompt, n, size, upscale, storage_mode, status,
   conversation_id, file_ids, result_urls, thumb_urls, reference_count, reference_urls, reference_thumb_urls,
   error, estimated_credit, credit_cost, created_at, started_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
		"img_task_running",
		2,
		1,
		1,
		9,
		"running image",
		2,
		"1024x1024",
		"",
		image.StorageModeLocal,
		image.StatusRunning,
		"",
		nil,
		nil,
		nil,
		0,
		nil,
		nil,
		"",
		60,
		0,
	); err != nil {
		t.Fatalf("insert task: %v", err)
	}

	h := &ImagesHandler{DAO: image.NewDAO(db)}
	c, recorder := newAuthedImageTestContext(http.MethodGet, "/v1/images/tasks/img_task_running", nil, "", &apikey.APIKey{ID: 1, UserID: 2})
	c.Params = gin.Params{{Key: "id", Value: "img_task_running"}}

	h.ImageTask(c)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
	}

	var body struct {
		Phase           string `json:"phase"`
		PhaseLabel      string `json:"phase_label"`
		EstimatedCredit int64  `json:"estimated_credit"`
		ActualCount     int    `json:"actual_count"`
		BillingStatus   string `json:"billing_status"`
		BillingNote     string `json:"billing_note"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal body: %v", err)
	}
	if body.Phase != "generating" || body.PhaseLabel != "生成中" {
		t.Fatalf("phase = %q %q", body.Phase, body.PhaseLabel)
	}
	if body.EstimatedCredit != 60 {
		t.Fatalf("estimated_credit = %d", body.EstimatedCredit)
	}
	if body.ActualCount != 0 {
		t.Fatalf("actual_count = %d", body.ActualCount)
	}
	if body.BillingStatus != "pending" {
		t.Fatalf("billing_status = %q", body.BillingStatus)
	}
	if body.BillingNote != "已预扣 60 积分，完成后按实际结果结算" {
		t.Fatalf("billing_note = %q", body.BillingNote)
	}
}

func mustJSONForTaskTest(t *testing.T, v any) string {
	t.Helper()
	data, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal json: %v", err)
	}
	return string(data)
}
