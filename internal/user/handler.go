package user

import (
	"context"
	"errors"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/432539/gpt2api/internal/middleware"
	"github.com/432539/gpt2api/internal/rbac"
	"github.com/432539/gpt2api/pkg/resp"
)

// SelfDAO 约束当前用户视角所需的数据访问能力。
type SelfDAO interface {
	GetByID(ctx context.Context, id uint64) (*User, error)
	ListCreditLogs(ctx context.Context, userID uint64, limit, offset int) ([]CreditLog, int64, error)
	ResetPassword(ctx context.Context, id uint64, hash string) error
}

// Handler 用户相关接口。
type Handler struct {
	dao  SelfDAO
	auth PasswordService
}

func NewHandler(dao SelfDAO, authSvc PasswordService) *Handler {
	return &Handler{dao: dao, auth: authSvc}
}

// Me 当前登录用户信息。响应同时包含该用户拥有的权限清单(用于前端路由守卫)。
func (h *Handler) Me(c *gin.Context) {
	uid := middleware.UserID(c)
	if uid == 0 {
		resp.Unauthorized(c, "not logged in")
		return
	}
	u, err := h.dao.GetByID(c.Request.Context(), uid)
	if err != nil {
		if err == ErrNotFound {
			resp.NotFound(c, "user not found")
			return
		}
		resp.Internal(c, err.Error())
		return
	}
	// 以 DB 中的 role 为准(避免 JWT 中旧 role 泄漏带来的提权)。
	perms := rbac.ListPermissions(u.Role)
	resp.OK(c, gin.H{
		"user":        u,
		"role":        u.Role,
		"permissions": perms,
	})
}

// Menu 返回当前用户可见的菜单树。仅依据 DB 中的 role 计算,前端直接渲染。
func (h *Handler) Menu(c *gin.Context) {
	uid := middleware.UserID(c)
	if uid == 0 {
		resp.Unauthorized(c, "not logged in")
		return
	}
	u, err := h.dao.GetByID(c.Request.Context(), uid)
	if err != nil {
		if err == ErrNotFound {
			resp.NotFound(c, "user not found")
			return
		}
		resp.Internal(c, err.Error())
		return
	}
	resp.OK(c, gin.H{
		"role":        u.Role,
		"menu":        rbac.MenuForRole(u.Role),
		"permissions": rbac.ListPermissions(u.Role),
	})
}

// CreditLogs GET /api/me/credit-logs
// 当前登录用户的积分流水(只读、强制 user_id = 当前用户)。
func (h *Handler) CreditLogs(c *gin.Context) {
	uid := middleware.UserID(c)
	if uid == 0 {
		resp.Unauthorized(c, "not logged in")
		return
	}
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	items, total, err := h.dao.ListCreditLogs(c.Request.Context(), uid, limit, offset)
	if err != nil {
		resp.Internal(c, err.Error())
		return
	}
	resp.OK(c, gin.H{
		"items":  items,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

type changePasswordReq struct {
	OldPassword string `json:"old_password" binding:"required"`
	NewPassword string `json:"new_password" binding:"required"`
}

// ChangePassword POST /api/me/change-password
func (h *Handler) ChangePassword(c *gin.Context) {
	uid := middleware.UserID(c)
	if uid == 0 {
		resp.Unauthorized(c, "not logged in")
		return
	}
	if h.auth == nil {
		resp.Internal(c, "password service not configured")
		return
	}
	var req changePasswordReq
	if err := c.ShouldBindJSON(&req); err != nil {
		resp.BadRequest(c, err.Error())
		return
	}
	if err := h.auth.VerifyPassword(c.Request.Context(), uid, req.OldPassword); err != nil {
		resp.Forbidden(c, "old password mismatch")
		return
	}
	if req.OldPassword == req.NewPassword {
		resp.BadRequest(c, "new password must differ from old password")
		return
	}
	hash, err := h.auth.HashPassword(req.NewPassword)
	if err != nil {
		resp.BadRequest(c, err.Error())
		return
	}
	if err := h.dao.ResetPassword(c.Request.Context(), uid, hash); err != nil {
		if errors.Is(err, ErrNotFound) {
			resp.NotFound(c, "user not found")
			return
		}
		resp.Internal(c, err.Error())
		return
	}
	resp.OK(c, gin.H{"updated": true})
}
