package gateway

import (
	"context"
	"fmt"
	"mime"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/432539/gpt2api/internal/imageproxy"
	"github.com/432539/gpt2api/pkg/logger"
)

// ImageAccountResolver 按账号 ID 解出构造 chatgpt client 所需的敏感字段。
// 由 main.go 注入。接口里不直接依赖 account 包,保持本层解耦。
type ImageAccountResolver interface {
	AuthToken(ctx context.Context, accountID uint64) (at, deviceID, cookies string, err error)
	ProxyURL(ctx context.Context, accountID uint64) string
}

type localProxyImageStore interface {
	ReadOriginal(taskID string, idx int) ([]byte, string, bool, error)
	ReadThumb(taskID string, idx int) ([]byte, string, bool, error)
	ReadReference(taskID string, idx int) ([]byte, string, bool, error)
	ReadReferenceThumb(taskID string, idx int) ([]byte, string, bool, error)
}

// ImageProxyTTL 单条签名 URL 的默认有效期(24h,够前端离线展示一段时间)。
const ImageProxyTTL = imageproxy.DefaultTTL

// BuildImageProxyURL 生成代理 URL。返回绝对 path(不含 host),调用方可以直接拼或交给前端同 origin 使用。
//
// 默认 ttl=24h。前端展示一张历史图片,最多走一次上游获取 bytes,之后浏览器缓存即可。
func BuildImageProxyURL(taskID string, idx int, resource string, ttl time.Duration) string {
	return imageproxy.BuildURL(taskID, idx, resource, ttl)
}

// ImageProxy 按签名代理下载上游图片。无需 API Key,只靠 URL 签名校验。
func (h *ImagesHandler) ImageProxy(c *gin.Context) {
	h.serveProxyImage(c, imageproxy.ResourceOriginal)
}

func (h *ImagesHandler) ThumbProxy(c *gin.Context) {
	h.serveProxyImage(c, imageproxy.ResourceThumb)
}

func (h *ImagesHandler) ReferenceProxy(c *gin.Context) {
	h.serveProxyImage(c, imageproxy.ResourceReference)
}

func (h *ImagesHandler) ReferenceThumbProxy(c *gin.Context) {
	h.serveProxyImage(c, imageproxy.ResourceReferenceThumb)
}

func (h *ImagesHandler) serveProxyImage(c *gin.Context, resource string) {
	taskID := c.Param("task_id")
	idxStr := c.Param("idx")
	expStr := c.Query("exp")
	sig := c.Query("sig")

	if taskID == "" || idxStr == "" || expStr == "" || sig == "" {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	idx, err := strconv.Atoi(idxStr)
	if err != nil || idx < 0 || idx > 64 {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	expMs, err := strconv.ParseInt(expStr, 10, 64)
	if err != nil {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	resource = imageproxy.NormalizeResource(resource)
	if !imageproxy.Verify(taskID, idx, resource, expMs, sig) {
		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	if h.DAO == nil {
		c.AbortWithStatus(http.StatusServiceUnavailable)
		return
	}

	t, err := h.DAO.Get(c.Request.Context(), taskID)
	if err != nil {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	body, ct, err := h.loadProxyImage(c.Request.Context(), t, idx, resource)
	if err != nil {
		if err == errProxyImageNotFound {
			c.AbortWithStatus(http.StatusNotFound)
			return
		}
		logger.L().Warn("image proxy load local image",
			zap.Error(err),
			zap.String("task_id", taskID),
			zap.Int("idx", idx),
			zap.String("resource", resource))
		c.AbortWithStatus(http.StatusBadGateway)
		return
	}

	if ct == "" {
		ct = "image/png"
	}
	c.Header("Cache-Control", "private, max-age=1800")
	if c.Query("dl") == "1" || c.Query("download") == "1" {
		writeDownloadImage(c, http.StatusOK, ct, buildDownloadFileName(taskID, idx, ct), body)
		return
	}
	writeInlineImage(c, http.StatusOK, ct, body)
}

func writeInlineImage(c *gin.Context, status int, contentType string, body []byte) {
	writeImageResponse(c, status, contentType, "", body, false)
}

func writeDownloadImage(c *gin.Context, status int, contentType, fileName string, body []byte) {
	writeImageResponse(c, status, contentType, fileName, body, true)
}

func writeImageResponse(c *gin.Context, status int, contentType, fileName string, body []byte, download bool) {
	ct := strings.TrimSpace(contentType)
	if ct == "" && len(body) > 0 {
		ct = http.DetectContentType(body)
	}
	if ct == "" {
		ct = "image/png"
	}
	if download {
		if fileName == "" {
			c.Header("Content-Disposition", "attachment")
		} else {
			c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, fileName))
		}
	} else {
		c.Header("Content-Disposition", "inline")
	}
	c.Data(status, ct, body)
}

func buildDownloadFileName(taskID string, idx int, contentType string) string {
	ext := "png"
	mediaType := strings.TrimSpace(strings.Split(contentType, ";")[0])
	if mediaType != "" {
		if exts, err := mime.ExtensionsByType(mediaType); err == nil && len(exts) > 0 {
			ext = strings.TrimPrefix(exts[0], ".")
		}
	}
	return fmt.Sprintf("%s-%d.%s", taskID, idx+1, ext)
}
