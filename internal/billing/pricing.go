package billing

import (
	"strconv"
	"strings"

	modelpkg "github.com/432539/gpt2api/internal/model"
)

var imageQualityBySize = map[string]string{
	"1024x1024": "1K",
	"2048x2048": "2K",
	"2880x2880": "4K",
	"1040x832":  "1K",
	"2080x1664": "2K",
	"3200x2560": "4K",
	"720x1280":  "1K",
	"1152x2048": "2K",
	"2160x3840": "4K",
	"1280x720":  "1K",
	"2048x1152": "2K",
	"3840x2160": "4K",
	"1024x768":  "1K",
	"2048x1536": "2K",
	"3264x2448": "4K",
	"1008x672":  "1K",
	"2016x1344": "2K",
	"3504x2336": "4K",
	"832x1040":  "1K",
	"1664x2080": "2K",
	"2560x3200": "4K",
	"768x1024":  "1K",
	"1536x2048": "2K",
	"2448x3264": "4K",
	"672x1008":  "1K",
	"1344x2016": "2K",
	"2336x3504": "4K",
	"1344x576":  "1K",
	"2016x864":  "2K",
	"3696x1584": "4K",
}

const (
	imageArea1K = 1024 * 1024
	imageArea2K = 2048 * 2048
	imageArea4K = 2880 * 2880
)

func parseImageSize(size string) (int64, bool) {
	normalized := strings.TrimSpace(strings.ToLower(size))
	parts := strings.Split(normalized, "x")
	if len(parts) != 2 {
		return 0, false
	}
	width, err := strconv.Atoi(strings.TrimSpace(parts[0]))
	if err != nil || width <= 0 {
		return 0, false
	}
	height, err := strconv.Atoi(strings.TrimSpace(parts[1]))
	if err != nil || height <= 0 {
		return 0, false
	}
	return int64(width) * int64(height), true
}

// ComputeChatCost 计算聊天模型的费用(单位:厘)。
// input/output tokens × 单价(per 1M) × 倍率。
func ComputeChatCost(m *modelpkg.Model, promptTokens, completionTokens int, ratio float64) int64 {
	if m == nil {
		return 0
	}
	if ratio <= 0 {
		ratio = 1.0
	}
	in := int64(promptTokens) * m.InputPricePer1M / 1_000_000
	out := int64(completionTokens) * m.OutputPricePer1M / 1_000_000
	total := float64(in+out) * ratio
	return int64(total + 0.5)
}

func ResolveImageQualityBySize(size string) string {
	normalized := strings.ToLower(strings.TrimSpace(size))
	if quality, ok := imageQualityBySize[normalized]; ok {
		return quality
	}
	area, ok := parseImageSize(normalized)
	if !ok {
		return "1K"
	}
	if area < int64((imageArea1K+imageArea2K)/2) {
		return "1K"
	}
	if area < int64((imageArea2K+imageArea4K)/2) {
		return "2K"
	}
	return "4K"
}

func ResolveImageUnitPrice(m *modelpkg.Model, size string) int64 {
	if m == nil {
		return 0
	}
	switch ResolveImageQualityBySize(size) {
	case "2K":
		if m.ImagePricePerCall2K > 0 {
			return m.ImagePricePerCall2K
		}
	case "4K":
		if m.ImagePricePerCall4K > 0 {
			return m.ImagePricePerCall4K
		}
	}
	return m.ImagePricePerCall
}

// ComputeImageCost 单张图费用(单位:厘)。
func ComputeImageCost(m *modelpkg.Model, n int, ratio float64, size string) int64 {
	if m == nil {
		return 0
	}
	if ratio <= 0 {
		ratio = 1.0
	}
	if n <= 0 {
		n = 1
	}
	unitPrice := ResolveImageUnitPrice(m, size)
	return int64(float64(unitPrice*int64(n))*ratio + 0.5)
}

// EstimateChat 预扣估算:max_tokens 未知时按保守上限 2048 估算。
func EstimateChat(m *modelpkg.Model, promptTokens, maxTokens int, ratio float64) int64 {
	out := maxTokens
	if out <= 0 {
		out = 2048
	}
	return ComputeChatCost(m, promptTokens, out, ratio)
}
