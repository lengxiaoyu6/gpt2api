package gateway

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/432539/gpt2api/internal/image"
	"github.com/432539/gpt2api/internal/imageproxy"
	"github.com/432539/gpt2api/pkg/logger"
)

// imageUpscaleCache 进程级单例 LRU,用于缓存「原图 → 4K/2K PNG」的放大结果。
// 首次请求某张图的 4K 会花费一次 decode + Catmull-Rom + png encode(约 0.5~1.5s),
// 之后同一条代理 URL 的请求毫秒级命中,不会重复计算。
//
// 放大不会写回 image_tasks / file system —— 所有放大字节都只存在于当前进程的
// LRU 里,服务重启即销毁,保证磁盘占用为 0。
var imageUpscaleCache = image.NewUpscaleCache(0, 0)

// ImageAccountResolver 按账号 ID 解出构造 chatgpt client 所需的敏感字段。
// 由 main.go 注入。接口里不直接依赖 account 包,保持本层解耦。
type ImageAccountResolver interface {
	AuthToken(ctx context.Context, accountID uint64) (at, deviceID, cookies string, err error)
	ProxyURL(ctx context.Context, accountID uint64) string
}

type localProxyImageStore interface {
	ReadOriginal(taskID string, idx int) ([]byte, string, bool, error)
	ReadThumb(taskID string, idx int) ([]byte, string, bool, error)
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

	scale := image.ValidateUpscale(t.Upscale)
	if resource == imageproxy.ResourceOriginal && scale != "" {
		cacheKey := fmt.Sprintf("%s|%d|%s", taskID, idx, scale)
		if data, ctCache, ok := imageUpscaleCache.Get(cacheKey); ok {
			c.Header("Cache-Control", "private, max-age=3600")
			c.Header("X-Upscale", scale+";cache=hit")
			writeInlineImage(c, http.StatusOK, ctCache, data)
			return
		}

		imageUpscaleCache.Acquire()
		upBytes, upCT, upErr := image.DoUpscale(body, scale)
		imageUpscaleCache.Release()
		if upErr != nil {
			logger.L().Warn("image proxy upscale",
				zap.Error(upErr), zap.String("task_id", taskID),
				zap.String("scale", scale))
			c.Header("Cache-Control", "private, max-age=1800")
			c.Header("X-Upscale", scale+";err")
			if ct == "" {
				ct = "image/png"
			}
			writeInlineImage(c, http.StatusOK, ct, body)
			return
		}
		if upCT != "" {
			ct = upCT
		}
		if len(upBytes) > 0 {
			body = upBytes
			imageUpscaleCache.Put(cacheKey, body, ct)
			c.Header("X-Upscale", scale+";cache=miss")
		} else {
			c.Header("X-Upscale", scale+";noop")
		}
		c.Header("Cache-Control", "private, max-age=3600")
		if ct == "" {
			ct = "image/png"
		}
		writeInlineImage(c, http.StatusOK, ct, body)
		return
	}

	if ct == "" {
		ct = "image/png"
	}
	c.Header("Cache-Control", "private, max-age=1800")
	writeInlineImage(c, http.StatusOK, ct, body)
}

func writeInlineImage(c *gin.Context, status int, contentType string, body []byte) {
	ct := strings.TrimSpace(contentType)
	if ct == "" && len(body) > 0 {
		ct = http.DetectContentType(body)
	}
	if ct == "" {
		ct = "image/png"
	}
	c.Header("Content-Disposition", "inline")
	c.Data(status, ct, body)
}
