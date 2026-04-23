# WAP 域名分站 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为现有 Docker + Go + Nginx 部署链路增加按域名区分的 Web 与 WAP 双站点能力，并提供后台可维护的 WAP 域名设置项。

**Architecture:** 保持单一后端服务和单一 API 入口，构建阶段同时产出 `web/dist` 与 `wap/dist`，运行阶段由 Go 服务根据请求 `Host` 在两套静态目录之间选择站点并处理 SPA 回退。外层 Nginx 继续负责域名入口与反向代理，后台仅保存 `site.wap_domain` 配置供服务端匹配与界面展示。

**Tech Stack:** Go, Gin, Vue 3, React, Vite, Bash, PowerShell, Docker, Nginx

---

### Task 1: 为系统设置补充 WAP 域名键定义与可见性测试

**Files:**
Create: `internal/settings/model_test.go`
Modify: `internal/settings/model.go`
Test: `internal/settings/model_test.go`

- [ ] **Step 1: 写失败测试，确认 `site.wap_domain` 已注册并对公开接口可见**

```go
package settings

import "testing"

func TestSiteWapDomainDefinition(t *testing.T) {
	def, ok := DefByKey("site.wap_domain")
	if !ok {
		t.Fatalf("site.wap_domain not registered")
	}
	if def.Category != "site" {
		t.Fatalf("unexpected category: %s", def.Category)
	}
	if !def.Public {
		t.Fatalf("site.wap_domain should be public")
	}
}
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `go test ./internal/settings -run TestSiteWapDomainDefinition -v`
Expected: FAIL，提示 `site.wap_domain not registered`

- [ ] **Step 3: 在设置定义中加入新键**

```go
const (
	SiteName        = "site.name"
	SiteDescription = "site.description"
	SiteLogoURL     = "site.logo_url"
	SiteFooter      = "site.footer"
	SiteImageNotice = "site.image_notice"
	SiteContactEmail = "site.contact_email"
	SiteDocsURL     = "site.docs_url"
	SiteAPIBaseURL  = "site.api_base_url"
	SiteWAPDomain   = "site.wap_domain"
)

var Defs = []KeyDef{
	{Key: SiteAPIBaseURL, Type: "url", Category: "site", Default: "", Label: "API Base URL", Desc: "展示给用户的 /v1 入口;留空=当前站点地址", Public: true},
	{Key: SiteWAPDomain, Type: "string", Category: "site", Default: "", Label: "WAP 域名", Desc: "移动端入口域名,如 imgwap.domain.com", Public: true},
}
```

- [ ] **Step 4: 重新运行测试并确认通过**

Run: `go test ./internal/settings -run TestSiteWapDomainDefinition -v`
Expected: PASS

### Task 2: 为服务端静态站点选择逻辑补充测试并实现按域名切换

**Files:**
Create: `internal/server/spa_test.go`
Modify: `internal/server/spa.go`
Test: `internal/server/spa_test.go`

- [ ] **Step 1: 写失败测试，覆盖 Web 与 WAP 的首页选择与 API 排除**

```go
func TestResolveSiteChoiceByHost(t *testing.T) {
	choice := chooseSiteByHost("imgwap.domain.com", "imgwap.domain.com")
	if choice != siteWAP {
		t.Fatalf("want wap, got %v", choice)
	}

	choice = chooseSiteByHost("img.domain.com", "imgwap.domain.com")
	if choice != siteWeb {
		t.Fatalf("want web, got %v", choice)
	}
}
```

```go
func TestNormalizeHostName(t *testing.T) {
	got := normalizeHostName("HTTPS://IMGWAP.DOMAIN.COM:443")
	if got != "imgwap.domain.com" {
		t.Fatalf("unexpected normalized host: %s", got)
	}
}
```

```go
func TestMountSPAHostFallback(t *testing.T) {
	// 构造临时 web/wap dist，分别写入不同 index.html
	// 断言 Host=imgwap.domain.com 时返回 wap index
	// 断言 Host=img.domain.com 时返回 web index
	// 断言 /api/unknown 保持 404
}
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `go test ./internal/server -run 'TestResolveSiteChoiceByHost|TestNormalizeHostName|TestMountSPAHostFallback' -v`
Expected: FAIL，提示函数未定义或返回站点错误

- [ ] **Step 3: 在 `spa.go` 中补充站点目录、域名归一化与按 Host 选择逻辑**

```go
type siteKind string

const (
	siteWeb siteKind = "web"
	siteWAP siteKind = "wap"
)

func normalizeHostName(raw string) string {
	// 去协议、去端口、转小写、去首尾空格
}

func chooseSiteByHost(host string, wapDomain string) siteKind {
	if normalizeHostName(host) != "" && normalizeHostName(host) == normalizeHostName(wapDomain) {
		return siteWAP
	}
	return siteWeb
}
```

```go
func mountSPA(r *gin.Engine, opts ...SPAOption) bool {
	// 同时解析 web 与 wap 目录
	// 根路径与 NoRoute 根据 Host 返回对应 index.html
	// /api 等前缀仍保持 404
}
```

- [ ] **Step 4: 重新运行测试并确认通过**

Run: `go test ./internal/server -run 'TestResolveSiteChoiceByHost|TestNormalizeHostName|TestMountSPAHostFallback' -v`
Expected: PASS

### Task 3: 让管理台系统设置页正确展示新字段

**Files:**
Modify: `web/src/views/admin/Settings.vue`
Test: `web/tests/image-page-notice.node.test.mjs`

- [ ] **Step 1: 写失败测试，确认系统设置页已有站点文本输入逻辑可以容纳 `site.wap_domain`**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('系统设置页保留 site.wap_domain 文本输入渲染', () => {
  const source = fs.readFileSync(new URL('../src/views/admin/Settings.vue', import.meta.url), 'utf8')
  assert.match(source, /draft\[it.key\]/)
  assert.match(source, /it\.category === 'limit' \? 'defaults' : it\.category/)
})
```

- [ ] **Step 2: 运行测试并确认当前行为稳定**

Run: `node --test web/tests/image-page-notice.node.test.mjs`
Expected: PASS

- [ ] **Step 3: 仅在需要时补充字段说明或多行输入判断，避免误把 `site.wap_domain` 当特殊控件**

```ts
function isTextarea(it: SettingItem) {
  return it.key === 'site.image_notice'
}
```

- [ ] **Step 4: 再次运行测试确认页面逻辑保持通过**

Run: `node --test web/tests/image-page-notice.node.test.mjs`
Expected: PASS

### Task 4: 为双前端产物扩展本地预编译与镜像构建脚本

**Files:**
Modify: `deploy/build-local.sh`
Modify: `deploy/build-local.ps1`
Modify: `deploy/Dockerfile`
Test: shell commands below

- [ ] **Step 1: 写失败验证，确认当前脚本只输出 Web 产物**

Run: `rg -n "web/dist|wap/dist|step3|step4" deploy/build-local.sh deploy/build-local.ps1 deploy/Dockerfile`
Expected: 仅看到 `web/dist`，未看到 `wap/dist`

- [ ] **Step 2: 扩展 Bash 预编译脚本**

```bash
# ---- step3: 前端(web) ----
echo "[build-local] step3 = npm run build (web)"
pushd web >/dev/null
...
npm run build
popd >/dev/null

# ---- step4: 前端(wap) ----
echo "[build-local] step4 = npm run build (wap)"
pushd wap >/dev/null
if [ ! -d node_modules ]; then
    npm install --no-audit --no-fund --loglevel=error
fi
npm run build
popd >/dev/null

ls -lh deploy/bin/gpt2api deploy/bin/goose web/dist/index.html wap/dist/index.html
```

- [ ] **Step 3: 扩展 PowerShell 预编译脚本与 Dockerfile 复制路径**

```powershell
Write-Host "[build-local] step4 = npm run build (wap)"
Push-Location (Join-Path $root "wap")
try {
    if (-not (Test-Path node_modules)) {
        npm install --no-audit --no-fund --loglevel=error
    }
    npm run build
} finally {
    Pop-Location
}
```

```dockerfile
COPY web/dist /app/web/dist
COPY wap/dist /app/wap/dist
```

- [ ] **Step 4: 运行验证命令**

Run: `bash deploy/build-local.sh`
Expected: 输出同时包含 `web/dist/index.html` 与 `wap/dist/index.html`

### Task 5: 更新 Nginx 与文档示例为双域名部署

**Files:**
Modify: `deploy/nginx.conf`
Modify: `deploy/README.md`
Modify: `README.md`
Test: `rg` checks below

- [ ] **Step 1: 写失败验证，确认示例配置仍是单站点**

Run: `rg -n "server_name|imgwap|wap/dist|WAP 域名|wap" deploy/nginx.conf deploy/README.md README.md`
Expected: 缺少双域名示例或缺少 WAP 构建说明

- [ ] **Step 2: 将 Nginx 示例改成双域名透传 Host 的形式**

```nginx
server {
    listen 80;
    server_name img.domain.com;
    location / {
        proxy_pass http://gpt2api_backend;
        proxy_set_header Host $host;
    }
}

server {
    listen 80;
    server_name imgwap.domain.com;
    location / {
        proxy_pass http://gpt2api_backend;
        proxy_set_header Host $host;
    }
}
```

- [ ] **Step 3: 在文档中补充双前端构建、WAP 域名设置项与双域名接入示例**

```markdown
| 前端 Vite 产物 | `web/dist/` |
| 前端 Vite 产物 | `wap/dist/` |

后台系统设置新增 `site.wap_domain`，用于登记移动端域名。
```

- [ ] **Step 4: 运行检查命令**

Run: `rg -n "site.wap_domain|wap/dist|imgwap.domain.com" deploy/nginx.conf deploy/README.md README.md`
Expected: 命中上述三个关键词

### Task 6: 执行最终验证

**Files:**
Modify: `docs/superpowers/plans/2026-04-23-wap-domain-routing.md`

- [ ] **Step 1: 运行后端测试**

Run: `go test ./internal/settings ./internal/server`
Expected: PASS

- [ ] **Step 2: 运行前端最小验证**

Run: `node --test web/tests/image-page-notice.node.test.mjs`
Expected: PASS

- [ ] **Step 3: 运行两端构建**

Run: `cd web && npm run build && cd ../wap && npm run build`
Expected: 两端均成功输出 dist 产物

- [ ] **Step 4: 记录计划执行状态**

```markdown
- [x] Task 1 completed
- [x] Task 2 completed
- [x] Task 3 completed
- [x] Task 4 completed
- [x] Task 5 completed
- [x] Task 6 completed
```
