# oaihub Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `backend/` 调整为 `oaihub` 全新项目基础工程，完成项目命名、模块名、配置、日志、存储、统一响应、中间件、健康检查、构建部署与文档基础。

**Architecture:** 本计划只覆盖 V1 第一阶段基础工程。新版后端保持独立 Go 模块，所有运行时包引用限定在 `github.com/432539/oaihub/backend/...` 与第三方库范围内；业务模块只保留清晰边界，用户、API Key、模型、任务、计费、图片、支付、公告、灵感库在后续计划中分批实现。

**Tech Stack:** Go 1.26.1、Gin、Viper、Zap、sqlx、go-redis、MySQL、Redis、Docker Compose、Bash

---

## File Map

`backend/go.mod`
负责声明新版独立模块名 `github.com/432539/oaihub/backend`。

`backend/cmd/server/main.go`
负责读取配置、初始化应用、接收退出信号、启动 HTTP 服务。

`backend/internal/bootstrap/app.go`
负责装配配置、日志、MySQL、Redis、对象存储、HTTP 路由，并提供关闭方法。

`backend/internal/config/config.go`
负责配置结构、默认值、YAML 读取、环境变量覆盖。

`backend/internal/config/config_test.go`
负责验证默认值、YAML 读取、环境变量覆盖。

`backend/internal/logging/logging.go`
负责构造 Zap 日志实例。

`backend/internal/storage/mysql.go`
负责 MySQL 连接创建与连接池参数设置。

`backend/internal/storage/redis.go`
负责 Redis 客户端创建与 `PING` 验证。

`backend/internal/storage/object.go`
负责对象存储接口定义，V1 第一阶段提供本地文件存储实现。

`backend/internal/storage/object_test.go`
负责验证本地对象存储写入、读取、删除。

`backend/internal/http/response/response.go`
负责统一 JSON 响应结构与错误码响应。

`backend/internal/http/response/response_test.go`
负责验证响应结构字段。

`backend/internal/http/middleware/request_id.go`
负责请求 ID 注入与响应头输出。

`backend/internal/http/middleware/recover.go`
负责 panic 恢复并返回统一错误结构。

`backend/internal/http/router.go`
负责注册 `/healthz`、`/readyz` 与未来 API 分组。

`backend/internal/http/router_test.go`
负责验证健康检查、请求 ID、panic 恢复。

`backend/internal/domain/*/doc.go`
负责声明 V1 领域包边界。

`backend/configs/config.example.yaml`
负责提供 `oaihub` 配置模板。

`backend/deploy/build.sh`
负责生成 `backend/deploy/bin/oaihub-server`。

`backend/deploy/Dockerfile`
负责打包新版后端运行镜像。

`backend/deploy/docker-compose.yml`
负责启动 MySQL、Redis、server，默认数据库名与镜像名改为 `oaihub`。

`backend/deploy/.env.example`
负责提供新版部署环境变量模板。

`backend/docs/README.md`
负责描述新版工程定位、命令、目录与验证方法。

---

### Task 1: 项目身份与模块名

**Files:**

Modify: `backend/go.mod`
Modify: `backend/cmd/server/main.go`
Modify: `backend/internal/app/app.go`
Modify: `backend/internal/platform/config/config.go`
Modify: `backend/internal/platform/config/config_test.go`
Modify: `backend/internal/platform/database/mysql.go`
Modify: `backend/internal/platform/database/redis.go`
Modify: `backend/internal/platform/logging/logging.go`
Modify: `backend/internal/transport/http/router.go`
Test: `backend/internal/platform/config/config_test.go`

- [ ] **Step 1: 修改配置测试，先锁定项目名与环境变量前缀**

将 `backend/internal/platform/config/config_test.go` 中的配置内容调整为以下关键断言：

```go
func TestLoadReadsOAIHubConfig(t *testing.T) {
	tmp := t.TempDir()
	path := filepath.Join(tmp, "config.yaml")
	err := os.WriteFile(path, []byte(`
app:
  name: oaihub
  env: test
  listen: ':19090'
log:
  level: debug
  format: json
mysql:
  dsn: 'user:pass@tcp(127.0.0.1:3306)/oaihub?parseTime=true'
redis:
  addr: '127.0.0.1:6380'
  db: 2
`), 0o644)
	require.NoError(t, err)

	cfg, err := Load(path)
	require.NoError(t, err)
	require.Equal(t, "oaihub", cfg.App.Name)
	require.Equal(t, "test", cfg.App.Env)
	require.Equal(t, ":19090", cfg.App.Listen)
	require.Equal(t, "debug", cfg.Log.Level)
	require.Equal(t, "json", cfg.Log.Format)
	require.Equal(t, "user:pass@tcp(127.0.0.1:3306)/oaihub?parseTime=true", cfg.MySQL.DSN)
	require.Equal(t, "127.0.0.1:6380", cfg.Redis.Addr)
	require.Equal(t, 2, cfg.Redis.DB)
}

func TestLoadUsesOAIHubEnvironmentOverrides(t *testing.T) {
	t.Setenv("OAIHUB_APP_NAME", "oaihub-env")
	t.Setenv("OAIHUB_APP_LISTEN", ":18080")
	t.Setenv("OAIHUB_REDIS_ADDR", "redis:6379")

	tmp := t.TempDir()
	path := filepath.Join(tmp, "config.yaml")
	err := os.WriteFile(path, []byte(`app: {}
log: {}
mysql: {}
redis: {}
`), 0o644)
	require.NoError(t, err)

	cfg, err := Load(path)
	require.NoError(t, err)
	require.Equal(t, "oaihub-env", cfg.App.Name)
	require.Equal(t, ":18080", cfg.App.Listen)
	require.Equal(t, "redis:6379", cfg.Redis.Addr)
}
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cd backend && go test ./internal/platform/config
```

Expected: FAIL，失败原因包含环境变量前缀仍为 `GPT2API_BACKEND` 或默认项目名仍为 `gpt2api-backend`。

- [ ] **Step 3: 修改模块名与 import**

将 `backend/go.mod` 模块名改为：

```go
module github.com/432539/oaihub/backend
```

批量替换 `backend/` 内 import：

```bash
cd /root/code/gpt2api
python3 - <<'PY'
from pathlib import Path
for path in Path('backend').rglob('*.go'):
    text = path.read_text()
    text = text.replace('github.com/432539/gpt2api/backend', 'github.com/432539/oaihub/backend')
    path.write_text(text)
PY
```

- [ ] **Step 4: 修改配置默认值和环境变量前缀**

在 `backend/internal/platform/config/config.go` 中修改：

```go
v.SetEnvPrefix("OAIHUB")
```

默认值调整为：

```go
v.SetDefault("app.name", "oaihub")
v.SetDefault("app.env", "dev")
v.SetDefault("app.listen", ":8080")
v.SetDefault("log.level", "info")
v.SetDefault("log.format", "console")
v.SetDefault("log.output", "stdout")
v.SetDefault("mysql.max_open_conns", 20)
v.SetDefault("mysql.max_idle_conns", 10)
v.SetDefault("mysql.conn_max_lifetime_sec", 300)
v.SetDefault("redis.addr", "127.0.0.1:6379")
v.SetDefault("redis.db", 0)
v.SetDefault("redis.pool_size", 10)
```

- [ ] **Step 5: 运行测试确认通过**

Run:

```bash
cd backend && gofmt -w . && go test ./internal/platform/config && go test ./...
```

Expected: PASS，所有包测试通过。

- [ ] **Step 6: 提交本任务**

```bash
git add backend
git commit -m "refactor: rename backend project to oaihub"
```

---

### Task 2: 调整工程目录为 oaihub 领域结构

**Files:**

Create: `backend/internal/bootstrap/app.go`
Create: `backend/internal/config/config.go`
Create: `backend/internal/logging/logging.go`
Create: `backend/internal/storage/mysql.go`
Create: `backend/internal/storage/redis.go`
Create: `backend/internal/http/router.go`
Create: `backend/internal/domain/user/doc.go`
Create: `backend/internal/domain/apikey/doc.go`
Create: `backend/internal/domain/model/doc.go`
Create: `backend/internal/domain/generation/doc.go`
Create: `backend/internal/domain/billing/doc.go`
Create: `backend/internal/domain/image/doc.go`
Create: `backend/internal/domain/payment/doc.go`
Create: `backend/internal/domain/notice/doc.go`
Create: `backend/internal/domain/promptlib/doc.go`
Create: `backend/internal/domain/admin/doc.go`
Create: `backend/internal/domain/audit/doc.go`
Delete: `backend/internal/app/app.go`
Delete: `backend/internal/platform/config/config.go`
Delete: `backend/internal/platform/database/mysql.go`
Delete: `backend/internal/platform/database/redis.go`
Delete: `backend/internal/platform/logging/logging.go`
Delete: `backend/internal/transport/http/router.go`
Test: `backend/internal/bootstrap/app_test.go`, `backend/internal/config/config_test.go`, `backend/internal/http/router_test.go`

- [ ] **Step 1: 移动配置测试到新包**

创建 `backend/internal/config/config_test.go`，内容沿用 Task 1 测试，包名改为：

```go
package config
```

- [ ] **Step 2: 移动路由测试到新包**

创建 `backend/internal/http/router_test.go`：

```go
package http

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/432539/oaihub/backend/internal/config"
)

func TestRouterHealthz(t *testing.T) {
	r := NewRouter(Deps{Config: &config.Config{App: config.AppConfig{Name: "oaihub", Env: "test"}}})

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code)
	require.JSONEq(t, `{"code":"ok","message":"ok","data":{"status":"ok"},"request_id":""}`, w.Body.String())
}
```

- [ ] **Step 3: 移动应用测试到新包**

创建 `backend/internal/bootstrap/app_test.go`：

```go
package bootstrap

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/432539/oaihub/backend/internal/config"
)

func TestNewAppWithoutExternalConnections(t *testing.T) {
	application, err := New(context.Background(), Options{
		Config: &config.Config{App: config.AppConfig{Name: "oaihub", Env: "test", Listen: ":0"}},
		SkipExternalConnections: true,
	})
	require.NoError(t, err)
	require.NotNil(t, application.Logger)
	require.NotNil(t, application.Router)
	require.Nil(t, application.MySQL)
	require.Nil(t, application.Redis)
	require.NoError(t, application.Close())
}
```

- [ ] **Step 4: 运行测试确认失败**

Run:

```bash
cd backend && go test ./internal/config ./internal/http ./internal/bootstrap
```

Expected: FAIL，失败原因包含包和函数尚未迁移，例如 `NewRouter`、`bootstrap.New` 缺失。

- [ ] **Step 5: 创建新目录实现并删除旧目录**

使用以下命令移动代码：

```bash
cd /root/code/gpt2api
mkdir -p backend/internal/{bootstrap,config,logging,storage,http}
mv backend/internal/app/app.go backend/internal/bootstrap/app.go
mv backend/internal/platform/config/config.go backend/internal/config/config.go
mv backend/internal/platform/logging/logging.go backend/internal/logging/logging.go
mv backend/internal/platform/database/mysql.go backend/internal/storage/mysql.go
mv backend/internal/platform/database/redis.go backend/internal/storage/redis.go
mv backend/internal/transport/http/router.go backend/internal/http/router.go
rm -rf backend/internal/app backend/internal/platform backend/internal/transport
```

修改包名：

```go
package bootstrap
package config
package logging
package storage
package http
```

`backend/internal/http/router.go` 中函数签名改为：

```go
func NewRouter(d Deps) *gin.Engine
```

`backend/internal/bootstrap/app.go` 中 import 改为：

```go
"github.com/432539/oaihub/backend/internal/config"
"github.com/432539/oaihub/backend/internal/http"
"github.com/432539/oaihub/backend/internal/logging"
"github.com/432539/oaihub/backend/internal/storage"
```

- [ ] **Step 6: 创建领域包边界**

执行：

```bash
cd /root/code/gpt2api
mkdir -p backend/internal/domain/{user,apikey,model,generation,billing,image,payment,notice,promptlib,admin,audit}
for dir in user apikey model generation billing image payment notice promptlib admin audit; do
  cat > "backend/internal/domain/$dir/doc.go" <<EOF2
// Package $dir defines the oaihub $dir domain boundary.
package $dir
EOF2
done
rm -rf backend/internal/modules
```

- [ ] **Step 7: 修改启动入口**

`backend/cmd/server/main.go` import 改为：

```go
"github.com/432539/oaihub/backend/internal/bootstrap"
"github.com/432539/oaihub/backend/internal/config"
```

创建应用改为：

```go
application, err := bootstrap.New(ctx, bootstrap.Options{Config: cfg})
```

- [ ] **Step 8: 运行测试确认通过**

Run:

```bash
cd backend && gofmt -w . && go test ./...
```

Expected: PASS，旧目录引用全部消失。

- [ ] **Step 9: 提交本任务**

```bash
git add backend
git commit -m "refactor: reorganize oaihub backend foundation packages"
```

---

### Task 3: 统一响应与基础中间件

**Files:**

Create: `backend/internal/http/response/response.go`
Create: `backend/internal/http/response/response_test.go`
Create: `backend/internal/http/middleware/request_id.go`
Create: `backend/internal/http/middleware/recover.go`
Modify: `backend/internal/http/router.go`
Test: `backend/internal/http/response/response_test.go`, `backend/internal/http/router_test.go`

- [ ] **Step 1: 编写响应结构测试**

创建 `backend/internal/http/response/response_test.go`：

```go
package response

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestOKWritesEnvelope(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/", func(c *gin.Context) {
		OK(c, gin.H{"name": "oaihub"})
	})

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/", nil))

	var body Envelope
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	require.Equal(t, "ok", body.Code)
	require.Equal(t, "ok", body.Message)
	require.Equal(t, http.StatusOK, w.Code)
}

func TestErrorWritesEnvelope(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/", func(c *gin.Context) {
		Error(c, http.StatusBadRequest, "request.invalid", "请求参数错误")
	})

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/", nil))

	var body Envelope
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	require.Equal(t, "request.invalid", body.Code)
	require.Equal(t, "请求参数错误", body.Message)
	require.Equal(t, http.StatusBadRequest, w.Code)
}
```

- [ ] **Step 2: 编写路由中间件测试**

在 `backend/internal/http/router_test.go` 追加：

```go
func TestRouterAddsRequestID(t *testing.T) {
	r := NewRouter(Deps{Config: &config.Config{App: config.AppConfig{Name: "oaihub", Env: "test"}}})

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set("X-Request-ID", "req_test_1")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	require.Equal(t, "req_test_1", w.Header().Get("X-Request-ID"))
}

func TestRouterRecoverReturnsEnvelope(t *testing.T) {
	r := NewRouter(Deps{Config: &config.Config{App: config.AppConfig{Name: "oaihub", Env: "test"}}})
	r.GET("/panic", func(c *gin.Context) { panic("boom") })

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/panic", nil))

	require.Equal(t, http.StatusInternalServerError, w.Code)
	require.Contains(t, w.Body.String(), "system.internal_error")
}
```

- [ ] **Step 3: 运行测试确认失败**

Run:

```bash
cd backend && go test ./internal/http/response ./internal/http
```

Expected: FAIL，失败原因包含 `Envelope`、`OK`、`Error`、中间件缺失。

- [ ] **Step 4: 实现统一响应**

创建 `backend/internal/http/response/response.go`：

```go
package response

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type Envelope struct {
	Code      string      `json:"code"`
	Message   string      `json:"message"`
	Data      interface{} `json:"data"`
	RequestID string      `json:"request_id"`
}

func OK(c *gin.Context, data interface{}) {
	c.JSON(http.StatusOK, Envelope{Code: "ok", Message: "ok", Data: data, RequestID: RequestID(c)})
}

func Error(c *gin.Context, status int, code string, message string) {
	c.JSON(status, Envelope{Code: code, Message: message, Data: nil, RequestID: RequestID(c)})
}

func RequestID(c *gin.Context) string {
	v, ok := c.Get("request_id")
	if !ok {
		return ""
	}
	s, _ := v.(string)
	return s
}
```

- [ ] **Step 5: 实现请求 ID 中间件**

创建 `backend/internal/http/middleware/request_id.go`：

```go
package middleware

import (
	"crypto/rand"
	"encoding/hex"

	"github.com/gin-gonic/gin"
)

const RequestIDHeader = "X-Request-ID"

func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader(RequestIDHeader)
		if id == "" {
			id = newRequestID()
		}
		c.Set("request_id", id)
		c.Header(RequestIDHeader, id)
		c.Next()
	}
}

func newRequestID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "req_fallback"
	}
	return "req_" + hex.EncodeToString(b[:])
}
```

- [ ] **Step 6: 实现恢复中间件**

创建 `backend/internal/http/middleware/recover.go`：

```go
package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/432539/oaihub/backend/internal/http/response"
)

func Recover() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				response.Error(c, http.StatusInternalServerError, "system.internal_error", "服务内部错误")
				c.Abort()
			}
		}()
		c.Next()
	}
}
```

- [ ] **Step 7: 修改路由使用响应与中间件**

`backend/internal/http/router.go` 修改为：

```go
r := gin.New()
r.Use(middleware.RequestID())
r.Use(middleware.Recover())
r.GET("/healthz", func(c *gin.Context) {
	response.OK(c, gin.H{"status": "ok"})
})
r.GET("/readyz", func(c *gin.Context) {
	response.OK(c, gin.H{"status": "ok"})
})
```

- [ ] **Step 8: 运行测试确认通过**

Run:

```bash
cd backend && gofmt -w . && go test ./internal/http/response ./internal/http && go test ./...
```

Expected: PASS。

- [ ] **Step 9: 提交本任务**

```bash
git add backend
git commit -m "feat: add oaihub response envelope and http middleware"
```

---

### Task 4: 本地对象存储基础

**Files:**

Create: `backend/internal/storage/object.go`
Create: `backend/internal/storage/object_test.go`
Modify: `backend/internal/config/config.go`
Modify: `backend/internal/config/config_test.go`
Modify: `backend/internal/bootstrap/app.go`
Test: `backend/internal/storage/object_test.go`, `backend/internal/config/config_test.go`, `backend/internal/bootstrap/app_test.go`

- [ ] **Step 1: 编写对象存储测试**

创建 `backend/internal/storage/object_test.go`：

```go
package storage

import (
	"context"
	"io"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestLocalObjectStorePutGetDelete(t *testing.T) {
	store := NewLocalObjectStore(t.TempDir(), "http://localhost:8080/assets")
	ctx := context.Background()

	obj, err := store.Put(ctx, "images/a.txt", strings.NewReader("hello"), "text/plain")
	require.NoError(t, err)
	require.Equal(t, "images/a.txt", obj.Key)
	require.Equal(t, "http://localhost:8080/assets/images/a.txt", obj.URL)
	require.Equal(t, int64(5), obj.Size)

	r, err := store.Get(ctx, "images/a.txt")
	require.NoError(t, err)
	defer r.Close()
	b, err := io.ReadAll(r)
	require.NoError(t, err)
	require.Equal(t, "hello", string(b))

	require.NoError(t, store.Delete(ctx, "images/a.txt"))
	_, err = store.Get(ctx, "images/a.txt")
	require.Error(t, err)
}
```

- [ ] **Step 2: 编写配置测试断言对象存储段**

在 `backend/internal/config/config_test.go` 的 YAML 中增加：

```yaml
object_storage:
  provider: local
  local_dir: /tmp/oaihub-assets
  public_base_url: http://localhost:8080/assets
```

增加断言：

```go
require.Equal(t, "local", cfg.ObjectStorage.Provider)
require.Equal(t, "/tmp/oaihub-assets", cfg.ObjectStorage.LocalDir)
require.Equal(t, "http://localhost:8080/assets", cfg.ObjectStorage.PublicBaseURL)
```

- [ ] **Step 3: 运行测试确认失败**

Run:

```bash
cd backend && go test ./internal/storage ./internal/config
```

Expected: FAIL，失败原因包含 `ObjectStorage`、`NewLocalObjectStore` 缺失。

- [ ] **Step 4: 增加对象存储配置**

在 `backend/internal/config/config.go` 的 `Config` 中增加：

```go
ObjectStorage ObjectStorageConfig `mapstructure:"object_storage"`
```

增加结构：

```go
type ObjectStorageConfig struct {
	Provider      string `mapstructure:"provider"`
	LocalDir      string `mapstructure:"local_dir"`
	PublicBaseURL string `mapstructure:"public_base_url"`
}
```

默认值：

```go
v.SetDefault("object_storage.provider", "local")
v.SetDefault("object_storage.local_dir", "data/assets")
v.SetDefault("object_storage.public_base_url", "http://localhost:8080/assets")
```

- [ ] **Step 5: 实现本地对象存储**

创建 `backend/internal/storage/object.go`：

```go
package storage

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

type Object struct {
	Key         string
	URL         string
	Size        int64
	ContentType string
}

type ObjectStore interface {
	Put(ctx context.Context, key string, body io.Reader, contentType string) (Object, error)
	Get(ctx context.Context, key string) (io.ReadCloser, error)
	Delete(ctx context.Context, key string) error
}

type LocalObjectStore struct {
	rootDir       string
	publicBaseURL string
}

func NewLocalObjectStore(rootDir string, publicBaseURL string) *LocalObjectStore {
	return &LocalObjectStore{rootDir: rootDir, publicBaseURL: strings.TrimRight(publicBaseURL, "/")}
}

func (s *LocalObjectStore) Put(ctx context.Context, key string, body io.Reader, contentType string) (Object, error) {
	if err := ctx.Err(); err != nil {
		return Object{}, err
	}
	cleanKey, err := safeObjectKey(key)
	if err != nil {
		return Object{}, err
	}
	path := filepath.Join(s.rootDir, cleanKey)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return Object{}, err
	}
	f, err := os.Create(path)
	if err != nil {
		return Object{}, err
	}
	defer f.Close()
	size, err := io.Copy(f, body)
	if err != nil {
		return Object{}, err
	}
	return Object{Key: cleanKey, URL: s.publicBaseURL + "/" + cleanKey, Size: size, ContentType: contentType}, nil
}

func (s *LocalObjectStore) Get(ctx context.Context, key string) (io.ReadCloser, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	cleanKey, err := safeObjectKey(key)
	if err != nil {
		return nil, err
	}
	return os.Open(filepath.Join(s.rootDir, cleanKey))
}

func (s *LocalObjectStore) Delete(ctx context.Context, key string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	cleanKey, err := safeObjectKey(key)
	if err != nil {
		return err
	}
	return os.Remove(filepath.Join(s.rootDir, cleanKey))
}

func safeObjectKey(key string) (string, error) {
	key = strings.TrimSpace(strings.TrimPrefix(key, "/"))
	if key == "" || strings.Contains(key, "..") || filepath.IsAbs(key) {
		return "", fmt.Errorf("invalid object key")
	}
	return filepath.ToSlash(filepath.Clean(key)), nil
}
```

- [ ] **Step 6: 注入应用结构**

`backend/internal/bootstrap/app.go` 的 `App` 增加字段：

```go
ObjectStore storage.ObjectStore
```

`New` 中加入：

```go
application.ObjectStore = storage.NewLocalObjectStore(opt.Config.ObjectStorage.LocalDir, opt.Config.ObjectStorage.PublicBaseURL)
```

`backend/internal/bootstrap/app_test.go` 增加断言：

```go
require.NotNil(t, application.ObjectStore)
```

- [ ] **Step 7: 运行测试确认通过**

Run:

```bash
cd backend && gofmt -w . && go test ./internal/storage ./internal/config ./internal/bootstrap && go test ./...
```

Expected: PASS。

- [ ] **Step 8: 提交本任务**

```bash
git add backend
git commit -m "feat: add local object storage foundation"
```

---

### Task 5: 更新配置、部署与文档为 oaihub

**Files:**

Modify: `backend/configs/config.example.yaml`
Modify: `backend/deploy/build.sh`
Modify: `backend/deploy/Dockerfile`
Modify: `backend/deploy/docker-compose.yml`
Modify: `backend/deploy/.env.example`
Modify: `backend/deploy/entrypoint.sh`
Modify: `backend/docs/README.md`
Test: shell syntax and Go build commands

- [ ] **Step 1: 修改配置模板**

`backend/configs/config.example.yaml` 调整为：

```yaml
app:
  name: oaihub
  env: dev
  listen: ':8080'

log:
  level: info
  format: console
  output: stdout

mysql:
  dsn: 'oaihub:oaihub@tcp(127.0.0.1:3306)/oaihub?parseTime=true&loc=Local&charset=utf8mb4&collation=utf8mb4_unicode_ci'
  max_open_conns: 20
  max_idle_conns: 10
  conn_max_lifetime_sec: 300

redis:
  addr: '127.0.0.1:6379'
  password: ''
  db: 0
  pool_size: 10

object_storage:
  provider: local
  local_dir: data/assets
  public_base_url: http://localhost:8080/assets
```

- [ ] **Step 2: 修改构建脚本产物名**

`backend/deploy/build.sh` 中产物改为：

```bash
GOOS=${GOOS:-linux} GOARCH=${GOARCH:-amd64} CGO_ENABLED=${CGO_ENABLED:-0} \
  go build -trimpath -ldflags "-s -w" -o "$OUT/oaihub-server" ./cmd/server

echo "[oaihub-build] output: $OUT/oaihub-server"
```

- [ ] **Step 3: 修改 Dockerfile**

`backend/deploy/Dockerfile` 中二进制改为：

```dockerfile
COPY deploy/bin/oaihub-server /app/oaihub-server
RUN chmod +x /app/oaihub-server /app/entrypoint.sh
CMD ["/app/oaihub-server", "-c", "/app/configs/config.yaml"]
```

- [ ] **Step 4: 修改 Compose 与环境变量**

`backend/deploy/docker-compose.yml` 中数据库、镜像、环境变量改为：

```yaml
MYSQL_DATABASE: ${MYSQL_DATABASE:-oaihub}
MYSQL_USER: ${MYSQL_USER:-oaihub}
MYSQL_PASSWORD: ${MYSQL_PASSWORD:-oaihub}
image: oaihub/server:next
OAIHUB_APP_LISTEN: ':8080'
OAIHUB_MYSQL_DSN: '${MYSQL_USER:-oaihub}:${MYSQL_PASSWORD:-oaihub}@tcp(mysql:3306)/${MYSQL_DATABASE:-oaihub}?parseTime=true&loc=Local&charset=utf8mb4&collation=utf8mb4_unicode_ci'
OAIHUB_REDIS_ADDR: 'redis:6379'
OAIHUB_REDIS_PASSWORD: '${REDIS_PASSWORD:-}'
OAIHUB_OBJECT_STORAGE_LOCAL_DIR: '/app/data/assets'
OAIHUB_OBJECT_STORAGE_PUBLIC_BASE_URL: '${PUBLIC_BASE_URL:-http://localhost:8080}/assets'
command: ["/app/oaihub-server", "-c", "/app/configs/config.yaml"]
```

server volumes 增加：

```yaml
volumes:
  - backend_assets:/app/data/assets
```

底部 volumes 增加：

```yaml
backend_assets:
```

- [ ] **Step 5: 修改环境变量模板**

`backend/deploy/.env.example` 改为：

```env
HTTP_PORT=8080
PUBLIC_BASE_URL=http://localhost:8080
MYSQL_ROOT_PASSWORD=root
MYSQL_DATABASE=oaihub
MYSQL_USER=oaihub
MYSQL_PASSWORD=oaihub
REDIS_PASSWORD=
```

- [ ] **Step 6: 修改入口脚本日志名称**

`backend/deploy/entrypoint.sh` 中日志前缀改为：

```bash
log() { echo "[oaihub-entrypoint] $*"; }
```

- [ ] **Step 7: 修改新版文档**

`backend/docs/README.md` 标题改为：

```markdown
# oaihub 后端工程说明
```

构建产物说明改为：

```text
backend/deploy/bin/oaihub-server
```

文档中说明模块名：

```text
github.com/432539/oaihub/backend
```

- [ ] **Step 8: 运行验证命令**

Run:

```bash
cd backend && bash -n deploy/build.sh deploy/entrypoint.sh && go test ./... && go build ./cmd/server
```

Expected: PASS。

- [ ] **Step 9: 提交本任务**

```bash
git add backend
git commit -m "chore: update oaihub deployment assets"
```

---

### Task 6: 最终核验

**Files:**

Modify: none
Test: full verification

- [ ] **Step 1: 检查新版依赖边界**

Run:

```bash
cd /root/code/gpt2api
grep -R "github.com/432539/gpt2api/internal\|github.com/432539/gpt2api/pkg\|github.com/432539/gpt2api/backend" -n backend || true
```

Expected: no output。

- [ ] **Step 2: 检查旧项目回归测试**

Run:

```bash
cd /root/code/gpt2api
go test ./internal/... ./pkg/... ./cmd/...
```

Expected: PASS。

- [ ] **Step 3: 检查新版测试与构建**

Run:

```bash
cd /root/code/gpt2api/backend
go test ./...
go build ./cmd/server
bash deploy/build.sh
bash -n deploy/build.sh deploy/entrypoint.sh
```

Expected: PASS，生成 `backend/deploy/bin/oaihub-server`。

- [ ] **Step 4: 清理本地临时二进制**

Run:

```bash
cd /root/code/gpt2api
rm -f backend/server backend/cmd/server/server
```

Expected: no output。

- [ ] **Step 5: 检查变更范围**

Run:

```bash
cd /root/code/gpt2api
git status --short
find backend -maxdepth 4 -type f | sort
```

Expected: 变更集中在 `backend/`、`docs/superpowers/specs/2026-05-04-oaihub-v1-design.md`、`docs/superpowers/plans/2026-05-04-oaihub-foundation.md`。

- [ ] **Step 6: 提交计划文档**

```bash
git add docs/superpowers/specs/2026-05-04-oaihub-v1-design.md docs/superpowers/plans/2026-05-04-oaihub-foundation.md
git commit -m "docs: add oaihub v1 foundation plan"
```
