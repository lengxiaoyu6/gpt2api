package redeem

import (
	"errors"

	"github.com/gin-gonic/gin"

	"github.com/432539/gpt2api/internal/middleware"
	"github.com/432539/gpt2api/pkg/resp"
)

type Handler struct{ svc *Service }

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func (h *Handler) Redeem(c *gin.Context) {
	uid := middleware.UserID(c)
	if uid == 0 {
		resp.Unauthorized(c, "unauthorized")
		return
	}
	var req struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		resp.BadRequest(c, err.Error())
		return
	}
	out, err := h.svc.Redeem(c.Request.Context(), uid, req.Code)
	if err != nil {
		switch {
		case errors.Is(err, ErrCodeNotFound):
			resp.NotFound(c, "兑换码不存在")
		case errors.Is(err, ErrCodeUsed):
			resp.Conflict(c, "兑换码已使用")
		case errors.Is(err, ErrCodeExpired):
			resp.Conflict(c, "兑换码已过期")
		default:
			resp.Internal(c, err.Error())
		}
		return
	}
	resp.OK(c, out)
}
