// proxy_url.go —— 把"上游签名 URL"翻译成"自家代理 URL"。
//
// 真正的代理实现在 internal/gateway 包(见 images_proxy.go),那里需要
// HMAC 签名 + ImageAccountResolver,涉及的依赖太重。此处只暴露一个
// 包级别的构造函数指针,由 main.go 在启动时注入,避免 image 包反向
// 依赖 gateway,造成循环引用。
//
// 用法:
//
//	image.SetProxyURLBuilder(func(taskID string, idx int) string {
//	    return gateway.BuildImageProxyURL(taskID, idx, imageproxy.ResourceOriginal, gateway.ImageProxyTTL)
//	})
//
// 之后 image 包内需要按 taskID + idx 访问站内代理的场景
// 可以统一通过该构造函数生成 /p/img/<task>/<idx>?... 地址。
// 云存储模式下的 image_urls 保持原始链接,避免影响外部缓存与 CDN。
package image

import "sync/atomic"

// proxyURLBuilder 用 atomic.Value 保存,允许运行时热替换,也避免读写竞争。
// 类型固定为 func(string,int) string;为空时回退到原始上游 URL。
var proxyURLBuilder atomic.Value

// SetProxyURLBuilder 注入代理 URL 构造函数。多次调用以最后一次为准。
func SetProxyURLBuilder(fn func(taskID string, idx int) string) {
	if fn == nil {
		return
	}
	proxyURLBuilder.Store(fn)
}

// BuildProxyURL 返回某个任务下第 idx 张图片的本地代理 URL。
// 若上层尚未注入构造函数,则回退到 raw —— 由调用方决定是否使用。
func BuildProxyURL(taskID string, idx int, raw string) string {
	v := proxyURLBuilder.Load()
	if v == nil {
		return raw
	}
	fn, ok := v.(func(taskID string, idx int) string)
	if !ok || fn == nil {
		return raw
	}
	return fn(taskID, idx)
}

// BuildProxyURLs 批量替换:输入原始 URL 数组,输出对应的本地代理 URL。
// 数组长度与输入保持一致;若没有可用的构造函数,直接返回 raw 副本。
func BuildProxyURLs(taskID string, raw []string) []string {
	out := make([]string, len(raw))
	v := proxyURLBuilder.Load()
	fn, _ := v.(func(taskID string, idx int) string)
	for i, r := range raw {
		if fn != nil {
			out[i] = fn(taskID, i)
		} else {
			out[i] = r
		}
	}
	return out
}
