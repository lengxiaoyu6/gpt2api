package updatelog

import (
	"errors"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/432539/gpt2api/pkg/resp"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func (h *Handler) ListPublic(c *gin.Context) {
	out, err := h.svc.ListPublic(c.Request.Context(), parseListInput(c))
	if err != nil {
		resp.Internal(c, err.Error())
		return
	}
	resp.OK(c, out)
}

func (h *Handler) ListAdmin(c *gin.Context) {
	out, err := h.svc.ListAdmin(c.Request.Context(), parseListInput(c))
	if err != nil {
		resp.Internal(c, err.Error())
		return
	}
	resp.OK(c, out)
}

func (h *Handler) Create(c *gin.Context) {
	var req SaveInput
	if err := c.ShouldBindJSON(&req); err != nil {
		resp.BadRequest(c, err.Error())
		return
	}
	item, err := h.svc.Create(c.Request.Context(), req)
	if err != nil {
		writeServiceError(c, err)
		return
	}
	resp.OK(c, item)
}

func (h *Handler) Update(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var req SaveInput
	if err := c.ShouldBindJSON(&req); err != nil {
		resp.BadRequest(c, err.Error())
		return
	}
	item, err := h.svc.Update(c.Request.Context(), id, req)
	if err != nil {
		writeServiceError(c, err)
		return
	}
	resp.OK(c, item)
}

func (h *Handler) Delete(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := h.svc.Delete(c.Request.Context(), id); err != nil {
		writeServiceError(c, err)
		return
	}
	resp.OK(c, gin.H{"ok": true})
}

func parseListInput(c *gin.Context) ListInput {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	return ListInput{Limit: limit, Offset: offset}
}

func writeServiceError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrInvalidInput):
		resp.BadRequest(c, err.Error())
	case errors.Is(err, ErrNotFound):
		resp.NotFound(c, "更新日志不存在")
	default:
		resp.Internal(c, err.Error())
	}
}
