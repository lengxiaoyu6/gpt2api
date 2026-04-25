package gateway

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/432539/gpt2api/internal/apikey"
	"github.com/432539/gpt2api/internal/billing"
	"github.com/432539/gpt2api/internal/channel"
	modelpkg "github.com/432539/gpt2api/internal/model"
	"github.com/432539/gpt2api/internal/upstream/adapter"
	"github.com/432539/gpt2api/internal/usage"
	"github.com/432539/gpt2api/pkg/logger"
)

// dispatchImageToChannel 尝试把图片生成请求路由到外置渠道(OpenAI/Gemini 等)。
//
// 返回:
//   - handled=true:已完成响应(成功或失败),调用方直接返回;
//   - handled=false:没有渠道映射或全部候选失败且需要回退到内置 ChatGPT 账号池。
//
// 仅覆盖纯 prompt 文生图场景;reference_images 分支继续走原 Runner(ChatGPT 账号池)。
func (h *ImagesHandler) dispatchImageToChannel(c *gin.Context,
	ak *apikey.APIKey, m *modelpkg.Model, req *ImageGenRequest,
	rec *usage.Log, ratio float64,
) bool {
	if h.Channels == nil {
		return false
	}
	// 参考图 / 图像编辑场景不走渠道(需要上游 file upload 能力,后续再接入)。
	if len(req.ReferenceImages) > 0 {
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

	refID := uuid.NewString()
	rec.RequestID = refID

	cost := billing.ComputeImageCost(m, req.N, ratio)
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

	ir := &adapter.ImageRequest{
		Model:  m.Slug,
		Prompt: req.Prompt,
		N:      req.N,
		Size:   req.Size,
		Format: req.ResponseFormat,
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 7*time.Minute)
	defer cancel()

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
		openAIError(c, http.StatusBadGateway, "upstream_error", "上游未返回图片结果")
		return true
	}

	// 渠道级倍率叠乘
	channelRatio := selected.Channel.Ratio
	if channelRatio <= 0 {
		channelRatio = 1.0
	}
	finalCost := billing.ComputeImageCost(m, actualN, ratio*channelRatio)

	data := make([]ImageGenData, 0, actualN)
	for _, u := range result.URLs {
		data = append(data, ImageGenData{URL: u})
	}
	// base64 → data: URL,浏览器直接可渲染。
	// (若后续需要 b64_json 直返,ImageGenData 补一个 B64 字段即可。)
	for _, b := range result.B64s {
		data = append(data, ImageGenData{URL: "data:image/png;base64," + b})
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

	c.JSON(http.StatusOK, ImageGenResponse{
		Created: time.Now().Unix(),
		Data:    data,
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
	var lastErr error
	for attempt := 1; attempt <= 2; attempt++ {
		result, err := rt.Adapter.ImageGenerate(ctx, rt.UpstreamModel, req)
		if err == nil && actualCount(result) > 0 {
			return result, nil
		}
		if err == nil {
			err = errors.New("empty image response")
		}
		lastErr = err
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
