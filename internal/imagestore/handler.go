package imagestore

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/432539/gpt2api/pkg/resp"
)

type handlerStore interface {
	ListFiles(resource string, limit, offset int) ([]FileInfo, int, error)
	DeleteFiles(resource string, names []string) (int, error)
	DiskStats() (DiskInfo, error)
}

type Handler struct {
	store handlerStore
}

func NewHandler(store handlerStore) *Handler {
	return &Handler{store: store}
}

type deleteReq struct {
	Names []string `json:"names"`
}

func (h *Handler) Stats(c *gin.Context) {
	info, err := h.store.DiskStats()
	if err != nil {
		resp.Internal(c, err.Error())
		return
	}
	resp.OK(c, info)
}

func (h *Handler) ListOriginal(c *gin.Context) {
	h.list(c, ResourceOriginal)
}

func (h *Handler) ListThumb(c *gin.Context) {
	h.list(c, ResourceThumb)
}

func (h *Handler) DeleteOriginal(c *gin.Context) {
	h.remove(c, ResourceOriginal)
}

func (h *Handler) DeleteThumb(c *gin.Context) {
	h.remove(c, ResourceThumb)
}

func (h *Handler) list(c *gin.Context, resource string) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	if offset < 0 {
		offset = 0
	}
	items, total, err := h.store.ListFiles(resource, limit, offset)
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

func (h *Handler) remove(c *gin.Context, resource string) {
	var req deleteReq
	if err := c.ShouldBindJSON(&req); err != nil || len(req.Names) == 0 {
		resp.BadRequest(c, "names required")
		return
	}
	deleted, err := h.store.DeleteFiles(resource, req.Names)
	if err != nil {
		resp.Internal(c, err.Error())
		return
	}
	resp.OK(c, gin.H{"deleted": deleted, "resource": resource})
}
