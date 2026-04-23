package imageproxy

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"
)

var secret []byte

func init() {
	secret = make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		for i := range secret {
			secret[i] = byte(i*31 + 7)
		}
	}
}

// DefaultTTL 是单条图片代理签名 URL 的默认有效期。
const DefaultTTL = 24 * time.Hour

const (
	ResourceOriginal = "original"
	ResourceThumb    = "thumb"
)

// BuildURL 生成图片代理地址。返回站内绝对路径。
func BuildURL(taskID string, idx int, resource string, ttl time.Duration) string {
	if ttl <= 0 {
		ttl = DefaultTTL
	}
	expMs := time.Now().Add(ttl).UnixMilli()
	sig := computeSig(taskID, idx, resource, expMs)
	return fmt.Sprintf("%s/%s/%d?exp=%d&sig=%s", resourcePath(resource), taskID, idx, expMs, sig)
}

// Verify 校验图片代理地址的签名与过期时间。
func Verify(taskID string, idx int, resource string, expMs int64, sig string) bool {
	if expMs < time.Now().UnixMilli() {
		return false
	}
	want := computeSig(taskID, idx, resource, expMs)
	return hmac.Equal([]byte(sig), []byte(want))
}

func computeSig(taskID string, idx int, resource string, expMs int64) string {
	mac := hmac.New(sha256.New, secret)
	fmt.Fprintf(mac, "%s|%d|%s|%d", taskID, idx, NormalizeResource(resource), expMs)
	return hex.EncodeToString(mac.Sum(nil))[:24]
}

func resourcePath(resource string) string {
	if NormalizeResource(resource) == ResourceThumb {
		return "/p/thumb"
	}
	return "/p/img"
}

func NormalizeResource(resource string) string {
	if resource == ResourceThumb {
		return ResourceThumb
	}
	return ResourceOriginal
}
