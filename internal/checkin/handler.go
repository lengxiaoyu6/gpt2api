package checkin

import (
	"context"
	"errors"

	"github.com/gin-gonic/gin"

	"github.com/432539/gpt2api/internal/middleware"
	"github.com/432539/gpt2api/pkg/resp"
)

type serviceReader interface {
	Status(ctx context.Context, userID uint64) (Status, error)
	Checkin(ctx context.Context, userID uint64) (Status, error)
}

type Handler struct {
	svc serviceReader
}

func NewHandler(svc serviceReader) *Handler { return &Handler{svc: svc} }

func (h *Handler) Status(c *gin.Context) {
	uid := middleware.UserID(c)
	if uid == 0 {
		resp.Unauthorized(c, "not logged in")
		return
	}
	out, err := h.svc.Status(c.Request.Context(), uid)
	if err != nil {
		resp.Internal(c, err.Error())
		return
	}
	resp.OK(c, out)
}

func (h *Handler) Checkin(c *gin.Context) {
	uid := middleware.UserID(c)
	if uid == 0 {
		resp.Unauthorized(c, "not logged in")
		return
	}
	out, err := h.svc.Checkin(c.Request.Context(), uid)
	if err != nil {
		if errors.Is(err, ErrDisabled) {
			resp.Forbidden(c, "daily checkin disabled")
			return
		}
		resp.Internal(c, err.Error())
		return
	}
	resp.OK(c, out)
}
