package gateway

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/432539/gpt2api/internal/apikey"
	"github.com/432539/gpt2api/internal/billing"
	"github.com/432539/gpt2api/internal/channel"
	"github.com/432539/gpt2api/internal/image"
	"github.com/432539/gpt2api/internal/imagestore"
	modelpkg "github.com/432539/gpt2api/internal/model"
	"github.com/432539/gpt2api/internal/settings"
	"github.com/432539/gpt2api/internal/upstream/adapter"
	"github.com/432539/gpt2api/internal/usage"
	"github.com/432539/gpt2api/pkg/logger"
)

// dispatchImageToChannel 尝试把图片生成请求路由到外置渠道(OpenAI/Gemini 等)。
//
// 返回:
//   - handled=true:已完成响应(成功或失败),调用方直接返回;
//   - handled=false:没有渠道映射或全部候选失败且需要回退到内置 ChatGPT 账号池。
var errNoReferenceCapableImageRoute = errors.New("image channel has no reference-capable route")

type referenceImageUploader interface {
	UploadToChannel(ctx context.Context, src imagestore.SourceImage, channel string) (string, error)
}

func (h *ImagesHandler) dispatchImageToChannel(c *gin.Context,
	ak *apikey.APIKey, m *modelpkg.Model, req *ImageGenRequest,
	refs []image.ReferenceImage, rec *usage.Log, ratio float64,
) bool {
	if h.Channels == nil {
		return false
	}
	routes, err := h.Channels.Resolve(c.Request.Context(), m.Slug, channel.ModalityImage)
	if err != nil {
		if errors.Is(err, channel.ErrNoRoute) {
			return false
		}
		logger.L().Warn("channel resolve image", zap.Error(err), zap.String("model", m.Slug))
		return false
	}
	if len(routes) == 0 {
		return false
	}
	ir, routes, err := h.buildChannelImageRequest(c.Request.Context(), routes, req, refs)
	if err != nil {
		if errors.Is(err, errNoReferenceCapableImageRoute) {
			rec.Status = usage.StatusFailed
			rec.ErrorCode = "image_reference_unsupported"
			openAIError(c, http.StatusBadGateway, "image_reference_unsupported",
				"当前上游图片渠道不支持参考图输入,请将渠道地址配置为 /v1/responses")
			return true
		}
		rec.Status = usage.StatusFailed
		rec.ErrorCode = "image_reference_upload_error"
		openAIError(c, http.StatusBadGateway, "image_reference_upload_error", "参考图上传失败:"+err.Error())
		return true
	}

	refID := uuid.NewString()
	rec.RequestID = refID

	cost := billing.ComputeImageCost(m, req.N, ratio, req.Size)
	if cost > 0 {
		if err := h.Billing.PreDeduct(c.Request.Context(), ak.UserID, ak.ID, cost, refID, "image prepay"); err != nil {
			rec.Status = usage.StatusFailed
			if errors.Is(err, billing.ErrInsufficient) {
				rec.ErrorCode = "insufficient_balance"
				openAIError(c, http.StatusPaymentRequired, "insufficient_balance",
					"积分不足,请前往「账单与充值」充值后再试")
				return true
			}
			rec.ErrorCode = "billing_error"
			openAIError(c, http.StatusInternalServerError, "billing_error", "计费异常:"+err.Error())
			return true
		}
	}
	refunded := false
	refund := func(code string) {
		rec.Status = usage.StatusFailed
		rec.ErrorCode = code
		if refunded || cost == 0 {
			return
		}
		refunded = true
		_ = h.Billing.Refund(context.Background(), ak.UserID, ak.ID, cost, refID, "image refund")
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 7*time.Minute)
	defer cancel()

	taskID := ""
	if h.Runner != nil || h.DAO != nil {
		taskID = image.GenerateTaskID()
	}
	taskStorageMode := h.currentStorageMode()
	if h.Runner == nil {
		taskStorageMode = image.StorageModeCloud
	}
	if h.DAO != nil {
		if err := h.DAO.Create(c.Request.Context(), &image.Task{
			TaskID:          taskID,
			UserID:          ak.UserID,
			KeyID:           ak.ID,
			ModelID:         m.ID,
			Prompt:          req.Prompt,
			N:               req.N,
			Size:            req.Size,
			StorageMode:     taskStorageMode,
			Status:          image.StatusDispatched,
			ReferenceCount:  len(refs),
			EstimatedCredit: cost,
		}); err != nil {
			refund("billing_error")
			openAIError(c, http.StatusInternalServerError, "internal_error", "创建任务失败:"+err.Error())
			return true
		}
		if err := h.archiveTaskReferences(c.Request.Context(), taskID, taskStorageMode, refs); err != nil {
			refund(image.ErrArchive)
			_ = h.DAO.MarkFailed(c.Request.Context(), taskID, image.ErrArchive)
			openAIError(c, http.StatusBadGateway, image.ErrArchive, "参考图归档失败:"+err.Error())
			return true
		}
	}

	selected, result, failures := pickImageRoute(ctx, routes, ir)
	var lastErr error
	for _, failure := range failures {
		lastErr = failure.err
		_ = h.Channels.Svc().MarkHealth(context.Background(), failure.route.Channel, false, failure.err.Error())
		logger.L().Warn("channel image fail after retry, try next",
			zap.Uint64("channel_id", failure.route.Channel.ID),
			zap.String("channel_name", failure.route.Channel.Name),
			zap.Error(failure.err))
	}

	if selected == nil || result == nil {
		refund("upstream_error")
		if h.DAO != nil {
			_ = h.DAO.MarkFailed(c.Request.Context(), taskID, "upstream_error")
		}
		msg := "所有上游渠道均不可用"
		if lastErr != nil {
			msg += ":" + lastErr.Error()
		}
		openAIError(c, http.StatusBadGateway, "upstream_error", msg)
		return true
	}
	_ = h.Channels.Svc().MarkHealth(context.Background(), selected.Channel, true, "")

	actualN := actualCount(result)
	if actualN == 0 {
		refund("upstream_error")
		if h.DAO != nil {
			_ = h.DAO.MarkFailed(c.Request.Context(), taskID, "upstream_error")
		}
		openAIError(c, http.StatusBadGateway, "upstream_error", "上游未返回图片结果")
		return true
	}

	// 渠道级倍率叠乘
	channelRatio := selected.Channel.Ratio
	if channelRatio <= 0 {
		channelRatio = 1.0
	}
	finalCost := billing.ComputeImageCost(m, actualN, ratio*channelRatio, req.Size)

	data := make([]ImageGenData, 0, actualN)
	if h.Runner != nil {
		inlineImages, err := decodeChannelInlineImages(result.B64s, len(result.URLs))
		if err != nil {
			refund(image.ErrArchive)
			if h.DAO != nil {
				_ = h.DAO.MarkFailed(c.Request.Context(), taskID, image.ErrArchive)
			}
			openAIError(c, http.StatusBadGateway, image.ErrArchive, "图片归档失败:"+err.Error())
			return true
		}
		archived, err := h.Runner.ArchiveExternalImages(ctx, taskID, result.URLs, inlineImages)
		if err != nil {
			refund(image.ErrArchive)
			if h.DAO != nil {
				_ = h.DAO.MarkFailed(c.Request.Context(), taskID, image.ErrArchive)
			}
			openAIError(c, http.StatusBadGateway, image.ErrArchive, "图片归档失败:"+err.Error())
			return true
		}
		if h.DAO != nil {
			if err := h.DAO.MarkSuccess(c.Request.Context(), taskID, "", nil,
				archived.SignedURLs, archived.ThumbURLs, archived.StorageMode, finalCost); err != nil {
				refund("billing_error")
				openAIError(c, http.StatusInternalServerError, "internal_error", "更新任务失败:"+err.Error())
				return true
			}
		}
		data = buildAPIImageData(taskID, archived.StorageMode, archived.SignedURLs, archived.ThumbURLs, nil)
	} else {
		resultURLs := make([]string, 0, actualN)
		for _, u := range result.URLs {
			resultURLs = append(resultURLs, u)
		}
		// base64 → data: URL,浏览器直接可渲染。
		// (若后续需要 b64_json 直返,ImageGenData 补一个 B64 字段即可。)
		for _, b := range result.B64s {
			resultURLs = append(resultURLs, "data:image/png;base64,"+b)
		}
		if h.DAO != nil {
			if err := h.DAO.MarkSuccess(c.Request.Context(), taskID, "", nil,
				resultURLs, nil, image.StorageModeCloud, finalCost); err != nil {
				refund("billing_error")
				openAIError(c, http.StatusInternalServerError, "internal_error", "更新任务失败:"+err.Error())
				return true
			}
		}
		for _, u := range resultURLs {
			data = append(data, ImageGenData{URL: u})
		}
	}

	if finalCost > 0 {
		if err := h.Billing.Settle(context.Background(), ak.UserID, ak.ID, cost, finalCost, refID, "image settle"); err != nil {
			logger.L().Error("billing settle image channel", zap.Error(err), zap.String("ref", refID))
		}
	}
	_ = h.Keys.DAO().TouchUsage(context.Background(), ak.ID, c.ClientIP(), finalCost)

	rec.Status = usage.StatusSuccess
	rec.ModelID = m.ID
	rec.ImageCount = actualN
	rec.CreditCost = finalCost
	rec.ImageCount = actualCount(result)
	if rec.ImageCount <= 0 {
		rec.ImageCount = req.N
	}
	if rec.ImageCount <= 0 {
		rec.ImageCount = 1
	}

	c.JSON(http.StatusOK, ImageGenResponse{
		Created: time.Now().Unix(),
		Data:    data,
		TaskID:  taskID,
	})
	return true
}

type imageRouteFailure struct {
	route *channel.Route
	err   error
}

func imageGenerateWithRetry(ctx context.Context, rt *channel.Route, req *adapter.ImageRequest) (*adapter.ImageResult, error) {
	if rt == nil || rt.Adapter == nil {
		return nil, errors.New("image route adapter is nil")
	}
	expected := expectedImageCount(req)
	maxCalls := expected
	if maxCalls < 2 {
		maxCalls = 2
	}
	combined := &adapter.ImageResult{}
	var lastErr error
	for attempt := 1; attempt <= maxCalls; attempt++ {
		remaining := expected - actualCount(combined)
		if remaining <= 0 {
			return trimAdapterImageResult(combined, expected), nil
		}
		attemptReq := &adapter.ImageRequest{}
		if req != nil {
			*attemptReq = *req
		}
		attemptReq.N = remaining

		result, err := rt.Adapter.ImageGenerate(ctx, rt.UpstreamModel, attemptReq)
		if err == nil {
			actual := actualCount(result)
			if actual > 0 {
				appendAdapterImageResult(combined, trimAdapterImageResult(result, remaining))
				if actualCount(combined) >= expected {
					return trimAdapterImageResult(combined, expected), nil
				}
				lastErr = fmt.Errorf("image response count mismatch: requested %d images, got %d", expected, actualCount(combined))
				continue
			}
			err = errors.New("empty image response")
		}
		if errors.Is(err, adapter.ErrImageReferencesUnsupported) {
			return nil, err
		}
		lastErr = err
	}
	if got := actualCount(combined); got > 0 {
		return nil, fmt.Errorf("image response count mismatch: requested %d images, got %d", expected, got)
	}
	return nil, lastErr
}

func pickImageRoute(ctx context.Context, routes []*channel.Route, req *adapter.ImageRequest) (*channel.Route, *adapter.ImageResult, []imageRouteFailure) {
	failures := make([]imageRouteFailure, 0, len(routes))
	for _, rt := range routes {
		result, err := imageGenerateWithRetry(ctx, rt, req)
		if err == nil {
			return rt, result, failures
		}
		failures = append(failures, imageRouteFailure{route: rt, err: err})
	}
	return nil, nil, failures
}

func actualCount(r *adapter.ImageResult) int {
	if r == nil {
		return 0
	}
	return len(r.URLs) + len(r.B64s)
}

func expectedImageCount(req *adapter.ImageRequest) int {
	if req == nil || req.N <= 0 {
		return 1
	}
	return req.N
}

func trimAdapterImageResult(result *adapter.ImageResult, maxImages int) *adapter.ImageResult {
	if result == nil || maxImages <= 0 {
		return result
	}
	out := *result
	if len(result.URLs) >= maxImages {
		out.URLs = append([]string(nil), result.URLs[:maxImages]...)
		out.B64s = nil
		return &out
	}
	out.URLs = append([]string(nil), result.URLs...)
	remaining := maxImages - len(out.URLs)
	if len(result.B64s) > remaining {
		out.B64s = append([]string(nil), result.B64s[:remaining]...)
	} else {
		out.B64s = append([]string(nil), result.B64s...)
	}
	return &out
}

func appendAdapterImageResult(dst, src *adapter.ImageResult) {
	if dst == nil || src == nil {
		return
	}
	dst.URLs = append(dst.URLs, src.URLs...)
	dst.B64s = append(dst.B64s, src.B64s...)
}

func decodeChannelInlineImages(b64s []string, startIndex int) ([]imagestore.SourceImage, error) {
	out := make([]imagestore.SourceImage, 0, len(b64s))
	for idx, raw := range b64s {
		contentType := "image/png"
		payload := strings.TrimSpace(raw)
		if before, after, ok := strings.Cut(payload, ","); ok && strings.HasPrefix(strings.ToLower(before), "data:") {
			meta := strings.TrimPrefix(before, "data:")
			if ct, _, found := strings.Cut(meta, ";"); found && strings.TrimSpace(ct) != "" {
				contentType = strings.TrimSpace(ct)
			}
			payload = after
		}
		data, err := base64.StdEncoding.DecodeString(payload)
		if err != nil {
			return nil, err
		}
		out = append(out, imagestore.SourceImage{
			Index:       startIndex + idx,
			Data:        data,
			ContentType: contentType,
		})
	}
	return out, nil
}

func (h *ImagesHandler) buildChannelImageRequest(ctx context.Context, routes []*channel.Route, req *ImageGenRequest, refs []image.ReferenceImage) (*adapter.ImageRequest, []*channel.Route, error) {
	ir := &adapter.ImageRequest{
		Model:  req.Model,
		Prompt: req.Prompt,
		N:      req.N,
		Size:   req.Size,
		Format: req.ResponseFormat,
	}
	if len(refs) == 0 {
		return ir, routes, nil
	}
	filtered := filterReferenceCapableImageRoutes(routes)
	if len(filtered) == 0 {
		if h.Runner == nil && h.DAO != nil {
			ir.References = nil
			return ir, routes, nil
		}
		return nil, nil, errNoReferenceCapableImageRoute
	}
	referenceURLs, err := h.uploadReferenceImagesForChannel(ctx, refs)
	if err != nil {
		return nil, nil, err
	}
	ir.References = referenceURLs
	return ir, filtered, nil
}

func filterReferenceCapableImageRoutes(routes []*channel.Route) []*channel.Route {
	filtered := make([]*channel.Route, 0, len(routes))
	for _, rt := range routes {
		if rt == nil || rt.Adapter == nil {
			continue
		}
		capable, ok := rt.Adapter.(adapter.ImageReferenceCapable)
		if ok && capable.SupportsImageReferences() {
			filtered = append(filtered, rt)
		}
	}
	return filtered
}

func (h *ImagesHandler) uploadReferenceImagesForChannel(ctx context.Context, refs []image.ReferenceImage) ([]adapter.ImageReference, error) {
	uploader, err := h.channelReferenceUploader()
	if err != nil {
		return nil, err
	}
	out := make([]adapter.ImageReference, 0, len(refs))
	for i, ref := range refs {
		url, err := uploader.UploadToChannel(ctx, imagestore.SourceImage{
			Index:       i,
			Data:        ref.Data,
			FileName:    ref.FileName,
			ContentType: ref.ContentType,
		}, "")
		if err != nil {
			return nil, err
		}
		out = append(out, adapter.ImageReference{URL: url})
	}
	return out, nil
}

func (h *ImagesHandler) channelReferenceUploader() (referenceImageUploader, error) {
	if h.referenceUploader != nil {
		return h.referenceUploader, nil
	}
	if h.Settings == nil {
		return nil, errors.New("storage.cloud_config 未配置")
	}
	snapshot := map[string]string{
		settings.StorageImageMode:   "cloud",
		settings.StorageCloudConfig: h.Settings.CloudConfig(),
	}
	if err := settings.ValidateStorageSnapshot(snapshot); err != nil {
		return nil, err
	}
	cfg, err := settings.ParseSanyueImgHubConfig(h.Settings.CloudConfig())
	if err != nil {
		return nil, err
	}
	return imagestore.NewSanyueImgHubUploader(imagestore.SanyueImgHubUploaderOptions{
		UploadURL:      cfg.UploadURL,
		AuthCode:       cfg.AuthCode,
		ServerCompress: cfg.ServerCompress,
		ReturnFormat:   cfg.ReturnFormat,
		UploadChannel:  cfg.UploadChannel,
	}), nil
}
