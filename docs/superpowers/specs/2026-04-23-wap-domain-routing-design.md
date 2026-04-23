# WAP 域名分站设计

## 背景

当前部署链路是宿主机预编译产物，再由 Docker 镜像运行 Go 后端。镜像中只复制 `web/dist`，后端 `internal/server/spa.go` 也只会挂载单一站点目录，因此无论访问哪个域名，最终都只能进入 Web 管理端。

仓库中已经存在独立的 `wap/` 工程，目标是在同一套后端接口之上，同时提供 Web 与 WAP 两套前端，并通过域名区分入口：`img.domain.com` 进入 Web 端，`imgwap.domain.com` 进入 WAP 端。

## 约束与边界

### 部署边界

当前生产形态是 Docker 部署，外层再由 Nginx 代理。此次保持这一模式，不新增第二个后端服务，也不新增容器内 Nginx 服务。

### 认证边界

Web 与 WAP 登录态分开维护。两端共用同一套后端用户体系和接口，但浏览器本地存储、入口页面、跳转链路保持独立。

### 配置边界

后台新增 WAP 域名设置项，用于管理台展示和业务配置记录。真正的站点分流依据当前请求的 `Host`，由接入层与服务端静态托管逻辑共同保证。

## 可选方案

### 方案一

仅在外层 Nginx 中根据域名分发静态目录，后端继续保留单一 `web/dist` 托管逻辑。

优点是接入层配置直观。缺点是仓库内置的 SPA 托管能力与 Docker 镜像内容仍然只有一套前端产物，示例部署、预编译脚本与镜像结构会继续偏离真实运行方式。

### 方案二

同时扩展镜像与 Go 后端静态托管能力，让镜像携带 `web/dist` 与 `wap/dist` 两套产物，Go 服务按 `Host` 选择站点目录；外层 Nginx 继续负责 TLS 与反向代理，并按域名转发到同一个后端服务。

优点是仓库自带的 Docker 产物、后端本地运行、Nginx 示例配置三者保持一致；即使没有外层静态目录挂载，也能从同一个服务按域名返回正确前端。代价是需要调整后端 SPA 挂载逻辑与构建脚本。

### 方案三

后台保存 WAP 域名后自动改写 Nginx 配置并触发重载。

优点是后台控制面更集中。代价是需要引入配置模板生成、宿主机权限、失败回滚与热重载编排，超出本次范围。

## 采用方案

本次采用方案二。

外层 Nginx 保持为统一入口，按域名转发请求到同一个 `server:8080`。Go 后端根据 `Host` 在 `web/dist` 与 `wap/dist` 之间选择站点目录并处理 SPA 回退。后台新增 `site.wap_domain` 配置项，用于登记移动端域名并提供给前端展示。

## 总体结构

### 构建产物

预编译脚本同时生成：

`web/dist`

`wap/dist`

### 运行时目录

Docker 镜像同时复制：

`/app/web/dist`

`/app/wap/dist`

### 服务端站点选择

后端新增站点解析逻辑：

1. 从请求头 `Host` 中取出主机名。
2. 读取系统设置中的 `site.wap_domain`。
3. 当主机名与 `site.wap_domain` 匹配时，优先返回 `wap` 站点目录。
4. 其余请求返回 `web` 站点目录。
5. 如果某个目录不存在，则自动回退到可用目录，避免因单边构建缺失导致全站不可用。

### SPA 回退

Web 与 WAP 都继续沿用现有 SPA 行为：

1. 根路径返回对应站点的 `index.html`。
2. 非 API 的 `GET` 与 `HEAD` 未命中静态文件时，回退到对应站点的 `index.html`。
3. `/api/`、`/v1/`、`/p/`、`/healthz`、`/readyz` 保持原样，不参与前端兜底。

## 后台设置扩展

新增设置项：

`site.wap_domain`

要求如下：

1. 分类归入 `site`。
2. 类型使用字符串。
3. 管理台系统设置页可编辑。
4. 公开接口 `/api/public/site-info` 也返回这一字段，便于前端后续展示移动端入口。
5. 写入时按字符串保存；服务端匹配时会忽略协议、端口与大小写差异。

## Nginx 示例配置

示例配置调整为双 `server` 块：

1. `img.domain.com` 对应 Web 域名。
2. `imgwap.domain.com` 对应 WAP 域名。
3. 两个站点的 `/api`、`/v1`、`/p`、`/healthz` 都反向代理到同一个后端。
4. 其余请求透传原始 `Host` 头，交给后端选择站点目录。

这样既保留了当前 Docker + Nginx 的部署习惯，也让 Go 服务在本地预览或单端口部署时继续具备完整能力。

## 测试策略

### 后端

补充针对 `internal/server/spa.go` 的单元测试，覆盖：

1. `site.wap_domain` 命中时返回 WAP `index.html`。
2. 普通域名返回 Web `index.html`。
3. API 路径不进入 SPA 回退。
4. `site.wap_domain` 带协议、端口、大写字母时仍可正确匹配。
5. WAP 目录缺失时回退到 Web 目录。

### 配置层

补充系统设置定义测试，确认 `site.wap_domain` 已进入 Defs 白名单且属于公开字段。

### 构建层

通过脚本执行验证：

1. `cd web && npm run build`
2. `cd wap && npm run build`
3. 运行 Go 测试覆盖新增后端逻辑
4. 检查 Dockerfile 与构建脚本已经包含两套产物路径

## 影响范围

预计修改以下区域：

`internal/server/spa.go`

`internal/settings/model.go`

`deploy/build-local.sh`

`deploy/build-local.ps1`

`deploy/Dockerfile`

`deploy/nginx.conf`

`deploy/README.md`

`README.md`

`web/src/views/admin/Settings.vue`

必要时补充相应测试文件。
