package server

import (
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/432539/gpt2api/internal/settings"
)

type siteKind string

const (
	siteWeb siteKind = "web"
	siteWAP siteKind = "wap"
)

type siteSettingsReader interface {
	GetString(key string) string
}

type spaSite struct {
	dir       string
	indexPath string
}

// mountSPA 把前端 Vite 产物(web/dist / wap/dist)挂到 `/` 上,并实现 SPA 回退(deep link 刷新)。
//
// 路径选择优先级:
//  1. 环境变量 GPT2API_WEB_DIR / GPT2API_WAP_DIR
//  2. 容器默认:/app/web/dist / /app/wap/dist
//  3. 源码工作目录:./web/dist / ./wap/dist
//  4. 都不存在则什么都不挂(退化为纯 API)
//
// 注意:
//   - 只有 GET/HEAD 的 NoRoute 请求才会被 fallback 到 index.html。其它方法保持 404。
//   - 明确排除 /api/、/v1/、/p/、/healthz、/readyz 等 API 前缀,避免打包问题把接口 404 掩盖成 index.html。
func mountSPA(r *gin.Engine, siteSettings siteSettingsReader) bool {
	sites := resolveSPASites()
	if len(sites) == 0 {
		return false
	}

	// NoRoute 兜底:仅对 GET/HEAD 且不在 API 前缀下的请求返回 index.html,
	// 让前端 vue-router 接管 deep link。
	r.NoRoute(func(c *gin.Context) {
		if c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead {
			c.Status(http.StatusNotFound)
			return
		}
		p := c.Request.URL.Path
		for _, prefix := range apiPrefixes {
			if strings.HasPrefix(p, prefix) {
				c.Status(http.StatusNotFound)
				return
			}
		}
		site := pickSPASite(sites, chooseSiteByHost(c.Request.Host, wapDomain(siteSettings)))
		if site == nil {
			c.Status(http.StatusNotFound)
			return
		}
		if file, ok := resolveStaticPath(site.dir, p); ok {
			c.File(file)
			return
		}
		c.File(site.indexPath)
	})
	return true
}

// API 前缀白名单:凡是命中这里的请求不做 SPA fallback。
var apiPrefixes = []string{
	"/api/",
	"/v1/",
	"/p/",
	"/healthz",
	"/readyz",
}

func resolveSPASites() map[siteKind]*spaSite {
	sites := map[siteKind]*spaSite{}
	if site := resolveSiteDir("GPT2API_WEB_DIR", []string{"/app/web/dist", "./web/dist"}); site != nil {
		sites[siteWeb] = site
	}
	if site := resolveSiteDir("GPT2API_WAP_DIR", []string{"/app/wap/dist", "./wap/dist"}); site != nil {
		sites[siteWAP] = site
	}
	return sites
}

func resolveSiteDir(envKey string, candidates []string) *spaSite {
	if d := os.Getenv(envKey); d != "" {
		if site := buildSPASite(d); site != nil {
			return site
		}
	}
	for _, d := range candidates {
		if site := buildSPASite(d); site != nil {
			return site
		}
	}
	return nil
}

func buildSPASite(dir string) *spaSite {
	if !isDir(dir) {
		return nil
	}
	abs, _ := filepath.Abs(dir)
	indexPath := filepath.Join(abs, "index.html")
	if _, err := os.Stat(indexPath); err != nil {
		return nil
	}
	return &spaSite{dir: abs, indexPath: indexPath}
}

func pickSPASite(sites map[siteKind]*spaSite, preferred siteKind) *spaSite {
	if site := sites[preferred]; site != nil {
		return site
	}
	if preferred != siteWeb {
		if site := sites[siteWeb]; site != nil {
			return site
		}
	}
	if preferred != siteWAP {
		if site := sites[siteWAP]; site != nil {
			return site
		}
	}
	return nil
}

func chooseSiteByHost(host string, wapDomain string) siteKind {
	if normalizedWAP := normalizeHostName(wapDomain); normalizedWAP != "" &&
		normalizeHostName(host) == normalizedWAP {
		return siteWAP
	}
	return siteWeb
}

func wapDomain(siteSettings siteSettingsReader) string {
	if siteSettings == nil {
		return ""
	}
	return siteSettings.GetString(settings.SiteWAPDomain)
}

func normalizeHostName(raw string) string {
	host := strings.ToLower(strings.TrimSpace(raw))
	if host == "" {
		return ""
	}
	if idx := strings.Index(host, "://"); idx >= 0 {
		host = host[idx+3:]
	}
	if idx := strings.IndexAny(host, "/?#"); idx >= 0 {
		host = host[:idx]
	}
	if parsedHost, _, err := net.SplitHostPort(host); err == nil {
		host = parsedHost
	} else if idx := strings.LastIndex(host, ":"); idx > 0 && !strings.Contains(host[idx+1:], "]") {
		port := host[idx+1:]
		if isDigits(port) && !strings.Contains(host[:idx], ":") {
			host = host[:idx]
		}
	}
	return strings.Trim(host, ". ")
}

func isDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, ch := range s {
		if ch < '0' || ch > '9' {
			return false
		}
	}
	return true
}

func resolveStaticPath(root string, requestPath string) (string, bool) {
	cleaned := filepath.Clean("/" + strings.TrimSpace(requestPath))
	if cleaned == "/" {
		return "", false
	}
	rel := strings.TrimPrefix(cleaned, "/")
	full := filepath.Join(root, filepath.FromSlash(rel))
	st, err := os.Stat(full)
	if err != nil || st.IsDir() {
		return "", false
	}
	return full, true
}

func isDir(p string) bool {
	st, err := os.Stat(p)
	if err != nil {
		return false
	}
	return st.IsDir()
}
