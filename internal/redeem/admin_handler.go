package redeem

import (
	"errors"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/432539/gpt2api/pkg/resp"
)

type AdminHandler struct{ svc *Service }

func NewAdminHandler(svc *Service) *AdminHandler { return &AdminHandler{svc: svc} }

func (h *AdminHandler) List(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	rows, total, err := h.svc.List(c.Request.Context(), ListFilter{
		BatchID: c.Query("batch_id"),
		Status:  c.Query("status"),
	}, offset, limit)
	if err != nil {
		resp.Internal(c, err.Error())
		return
	}
	resp.OK(c, gin.H{"items": rows, "total": total, "limit": limit, "offset": offset})
}

func (h *AdminHandler) Generate(c *gin.Context) {
	var req struct {
		Credits  int64 `json:"credits" binding:"required,min=1"`
		Quantity int   `json:"quantity" binding:"required,min=1"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		resp.BadRequest(c, err.Error())
		return
	}
	items, err := h.svc.Generate(c.Request.Context(), GenerateInput{Credits: req.Credits, Quantity: req.Quantity})
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidCredits), errors.Is(err, ErrInvalidQuantity):
			resp.BadRequest(c, err.Error())
		default:
			resp.Internal(c, err.Error())
		}
		return
	}
	resp.OK(c, gin.H{"items": items, "total": len(items)})
}
