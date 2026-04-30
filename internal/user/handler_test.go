package user

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/432539/gpt2api/internal/middleware"
	"github.com/432539/gpt2api/pkg/resp"
)

type fakeSelfDAO struct {
	user        *User
	creditLogs  []CreditLog
	total       int64
	resetUserID uint64
	resetHash   string
	resetErr    error
}

func (f *fakeSelfDAO) GetByID(context.Context, uint64) (*User, error) {
	if f.user == nil {
		return nil, ErrNotFound
	}
	return f.user, nil
}

func (f *fakeSelfDAO) ListCreditLogs(context.Context, uint64, int, int) ([]CreditLog, int64, error) {
	return f.creditLogs, f.total, nil
}

func (f *fakeSelfDAO) ResetPassword(_ context.Context, id uint64, hash string) error {
	f.resetUserID = id
	f.resetHash = hash
	return f.resetErr
}

type fakePasswordService struct {
	verifyErr   error
	hashValue   string
	hashErr     error
	verifyCalls []string
	hashCalls   []string
}

func (f *fakePasswordService) VerifyPassword(_ context.Context, _ uint64, password string) error {
	f.verifyCalls = append(f.verifyCalls, password)
	return f.verifyErr
}

func (f *fakePasswordService) HashPassword(plain string) (string, error) {
	f.hashCalls = append(f.hashCalls, plain)
	return f.hashValue, f.hashErr
}

func TestChangePasswordRejectsWrongOldPassword(t *testing.T) {
	gin.SetMode(gin.TestMode)
	dao := &fakeSelfDAO{user: &User{ID: 7}}
	authSvc := &fakePasswordService{verifyErr: errors.New("invalid credential")}
	h := NewHandler(dao, authSvc)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Set(middleware.CtxUserID, uint64(7))
	c.Request = httptest.NewRequest(http.MethodPost, "/api/me/change-password", bytes.NewBufferString(`{"old_password":"old-secret","new_password":"new-secret-1"}`))
	c.Request.Header.Set("Content-Type", "application/json")

	h.ChangePassword(c)

	if w.Code != http.StatusForbidden {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	var body resp.Body
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if body.Message != "old password mismatch" {
		t.Fatalf("message = %q", body.Message)
	}
}

func TestChangePasswordRejectsSamePassword(t *testing.T) {
	gin.SetMode(gin.TestMode)
	dao := &fakeSelfDAO{user: &User{ID: 8}}
	authSvc := &fakePasswordService{}
	h := NewHandler(dao, authSvc)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Set(middleware.CtxUserID, uint64(8))
	c.Request = httptest.NewRequest(http.MethodPost, "/api/me/change-password", bytes.NewBufferString(`{"old_password":"same-secret","new_password":"same-secret"}`))
	c.Request.Header.Set("Content-Type", "application/json")

	h.ChangePassword(c)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	var body resp.Body
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if body.Code != resp.CodeBadRequest {
		t.Fatalf("code = %d", body.Code)
	}
	if body.Message != "new password must differ from old password" {
		t.Fatalf("message = %q", body.Message)
	}
	if len(authSvc.hashCalls) != 0 {
		t.Fatalf("HashPassword should not be called, got %v", authSvc.hashCalls)
	}
}

func TestChangePasswordUpdatesPasswordHash(t *testing.T) {
	gin.SetMode(gin.TestMode)
	dao := &fakeSelfDAO{user: &User{ID: 9}}
	authSvc := &fakePasswordService{hashValue: "hashed-secret"}
	h := NewHandler(dao, authSvc)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Set(middleware.CtxUserID, uint64(9))
	c.Request = httptest.NewRequest(http.MethodPost, "/api/me/change-password", bytes.NewBufferString(`{"old_password":"old-secret","new_password":"new-secret-2"}`))
	c.Request.Header.Set("Content-Type", "application/json")

	h.ChangePassword(c)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if dao.resetUserID != 9 {
		t.Fatalf("resetUserID = %d", dao.resetUserID)
	}
	if dao.resetHash != "hashed-secret" {
		t.Fatalf("resetHash = %q", dao.resetHash)
	}
	if len(authSvc.verifyCalls) != 1 || authSvc.verifyCalls[0] != "old-secret" {
		t.Fatalf("verifyCalls = %#v", authSvc.verifyCalls)
	}
	if len(authSvc.hashCalls) != 1 || authSvc.hashCalls[0] != "new-secret-2" {
		t.Fatalf("hashCalls = %#v", authSvc.hashCalls)
	}

	var body resp.Body
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	data, ok := body.Data.(map[string]any)
	if !ok {
		t.Fatalf("data type = %T", body.Data)
	}
	if updated, ok := data["updated"].(bool); !ok || !updated {
		t.Fatalf("updated = %#v", data["updated"])
	}
}

func TestMenuReturnsTopLevelAdminDashboard(t *testing.T) {
	gin.SetMode(gin.TestMode)
	dao := &fakeSelfDAO{user: &User{ID: 10, Role: "admin"}}
	h := NewHandler(dao, nil)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Set(middleware.CtxUserID, uint64(10))
	c.Request = httptest.NewRequest(http.MethodGet, "/api/me/menu", nil)

	h.Menu(c)

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
	if role, _ := data["role"].(string); role != "admin" {
		t.Fatalf("role = %q", role)
	}
	menu, ok := data["menu"].([]any)
	if !ok {
		t.Fatalf("menu type = %T", data["menu"])
	}
	if len(menu) == 0 {
		t.Fatal("menu is empty")
	}
	first, ok := menu[0].(map[string]any)
	if !ok {
		t.Fatalf("first menu type = %T", menu[0])
	}
	if key, _ := first["key"].(string); key != "admin.dashboard" {
		t.Fatalf("first key = %q", key)
	}
	if title, _ := first["title"].(string); title != "后台概览" {
		t.Fatalf("first title = %q", title)
	}
	if path, _ := first["path"].(string); path != "/admin/dashboard" {
		t.Fatalf("first path = %q", path)
	}
	if children, exists := first["children"]; exists {
		t.Fatalf("dashboard children should be empty, got %#v", children)
	}
	for _, item := range menu {
		entry, ok := item.(map[string]any)
		if !ok {
			t.Fatalf("entry type = %T", item)
		}
		if key, _ := entry["key"].(string); key == "admin" {
			t.Fatal("menu should not include admin root node")
		}
	}
}
