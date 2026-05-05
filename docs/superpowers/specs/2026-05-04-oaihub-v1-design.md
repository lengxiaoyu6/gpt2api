# oaihub V1 全新项目设计文档

## 项目定位

`oaihub` 是面向图像生成业务的新项目。新版工程以独立产品形态重新设计后端、数据库、接口、部署与后续前端接入方式。旧版 `gpt2api` 代码仅作为业务资料参考，运行时依赖、包引用、数据库迁移、构建产物均与新版分离。

V1 以图像生成主业务为中心，覆盖用户、API Key、模型、任务、计费、记录、图片存储、后台基础管理，并包含支付、公告、灵感库三项基础运营能力。

## V1 范围

### 主业务能力

1. 用户注册、登录、资料读取、余额读取。
2. API Key 创建、禁用、删除、最后使用时间记录。
3. 模型管理，包括模型标识、名称、能力、价格、启用状态。
4. 图像生成任务提交、排队、执行、状态查询、结果记录。
5. 计费账本，包括预扣、结算、退款、后台调整。
6. 图片资源管理，包括原图、缩略图、尺寸、文件大小、下载地址。
7. 历史记录查询，包括任务状态、提示词、模型、图片结果、计费信息。
8. 后台基础管理，包括用户、模型、任务、账单、API Key、图片、系统设置。

### 运营能力

1. 支付：订单创建、回调验签、余额入账、订单记录，支付渠道先抽象为接口，默认支持易支付适配。
2. 公告：后台发布、启用、排序、用户端读取、首次访问展示状态记录。
3. 灵感库：分类、提示词、预览图、排序、启用状态、游客浏览。

### V1 暂缓能力

1. 多上游复杂调度策略。
2. 代理池、账号池评分、自动探测等旧版高级能力。
3. 复杂营销体系，例如优惠券、套餐叠加、邀请返利。
4. 多租户隔离。
5. 完整 BI 报表。

## 工程结构

```text
backend/
  cmd/server/                 服务启动入口
  configs/                    配置模板
  deploy/                     构建、镜像、Compose
  docs/                       新版项目文档
  sql/migrations/             新版数据库迁移

  internal/bootstrap/         应用装配
  internal/config/            配置加载
  internal/http/              路由、中间件、响应结构
  internal/storage/           MySQL、Redis、对象存储
  internal/security/          JWT、密码哈希、签名、加密

  internal/domain/user/       用户与余额视图
  internal/domain/apikey/     API Key
  internal/domain/model/      模型与价格
  internal/domain/generation/ 生图任务
  internal/domain/billing/    账本与计费
  internal/domain/image/      图片资源
  internal/domain/payment/    支付订单与渠道适配
  internal/domain/notice/     公告
  internal/domain/promptlib/  灵感库
  internal/domain/admin/      后台能力
  internal/domain/audit/      请求记录与操作记录
```

新版模块以领域能力划分。每个领域内部包含 `handler`、`service`、`repository`、`entity`、`dto`，跨领域访问通过 service 接口完成，避免 handler 跨模块查询数据库。

## 数据模型

### 用户与认证

核心表：

```text
users
user_sessions
api_keys
```

`users` 保存邮箱、昵称、密码哈希、状态、余额、注册时间、最后登录时间。余额以整数保存，单位由配置确定，默认采用积分最小单位。

`api_keys` 绑定用户，保存 key 哈希、名称、状态、模型权限、最后使用时间、创建时间。明文 key 仅在创建时返回。

### 模型与价格

核心表：

```text
models
model_prices
```

`models` 保存模型标识、展示名称、能力类型、启用状态、排序。`model_prices` 保存单图价格、图生图价格、计费策略、生效状态。

### 生图任务

核心表：

```text
generation_tasks
generation_task_images
generation_task_events
```

任务状态：

```text
created -> queued -> running -> partial_succeeded -> succeeded
                         |
                         -> failed
                         -> canceled
```

`generation_tasks` 保存用户、API Key、模型、提示词、参考图、请求数量、成功数量、状态、错误信息、计费金额。`generation_task_images` 保存任务结果图片资源关系。`generation_task_events` 保存任务状态变更记录，便于后台排查。

### 计费账本

核心表：

```text
wallet_ledger
wallet_holds
```

账本类型：

```text
recharge
generation_reserve
generation_settle
generation_refund
admin_adjust
```

生图提交时创建冻结记录或预扣记录。任务完成后按成功图片数量结算，多扣金额退回。任务失败且没有成功结果时，全额退回。部分成功时，只按成功结果计费。

### 图片资源

核心表：

```text
images
image_variants
```

`images` 保存原图地址、缩略图地址、宽度、高度、大小、MIME 类型、存储供应商、对象键、创建时间。`image_variants` 可保存后续扩展的不同尺寸图片。

用户列表、详情页、后台记录、下载接口均读取图片资源表。列表和详情默认使用缩略图，下载接口返回原图文件流。

### 支付、公告、灵感库

核心表：

```text
payment_orders
payment_callbacks
announcements
announcement_reads
prompt_categories
prompt_items
```

`payment_orders` 保存订单号、用户、金额、状态、渠道、回调时间。`payment_callbacks` 保存原始回调摘要和验签结果。

`announcements` 保存内容、启用状态、排序、展示时间。`announcement_reads` 保存用户已读状态。

`prompt_categories` 保存分类名称、排序、启用状态。删除分类时，条目迁移到默认分类。`prompt_items` 保存提示词、预览图、分类、启用状态、排序。

## 接口设计

### 用户端 API

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/me
GET  /api/me/balance
GET  /api/me/api-keys
POST /api/me/api-keys
DELETE /api/me/api-keys/:id
GET  /api/me/models
POST /api/me/generations
GET  /api/me/generations
GET  /api/me/generations/:id
POST /api/me/generations/:id/retry
GET  /api/me/images/:id/download
GET  /api/public/announcements
GET  /api/public/prompts
GET  /api/public/prompt-categories
POST /api/payment/orders
```

### OpenAI 兼容 API

```text
POST /v1/images/generations
GET  /v1/images/generations/:id
```

鉴权使用 API Key：

```text
Authorization: Bearer sk-...
```

### 后台 API

```text
GET  /api/admin/overview
GET  /api/admin/users
GET  /api/admin/api-keys
GET  /api/admin/models
POST /api/admin/models
PUT  /api/admin/models/:id
GET  /api/admin/generations
GET  /api/admin/generations/:id
GET  /api/admin/billing/ledger
GET  /api/admin/images
GET  /api/admin/payment/orders
GET  /api/admin/announcements
POST /api/admin/announcements
PUT  /api/admin/announcements/:id
DELETE /api/admin/announcements/:id
GET  /api/admin/prompt-categories
POST /api/admin/prompt-categories
PUT  /api/admin/prompt-categories/:id
DELETE /api/admin/prompt-categories/:id
GET  /api/admin/prompts
POST /api/admin/prompts
PUT  /api/admin/prompts/:id
DELETE /api/admin/prompts/:id
GET  /api/admin/audit/requests
```

## 关键业务流程

### 生图提交

1. 校验登录态或 API Key。
2. 校验模型状态、模型能力、请求数量、提示词、参考图。
3. 计算预计费用并创建冻结记录。
4. 创建任务，状态为 `created`。
5. 写入队列，状态更新为 `queued`。
6. 返回任务 ID 与初始状态。

### 生图执行

1. Worker 读取队列任务。
2. 状态更新为 `running`。
3. 调用上游生成图片。
4. 将结果图保存到对象存储，生成缩略图并写入图片资源表。
5. 写入任务结果关系。
6. 按成功图片数量结算。
7. 更新任务状态为 `succeeded`、`partial_succeeded` 或 `failed`。

### 历史记录

历史记录查询支持分页、状态、模型、时间范围、关键词。用户端仅返回当前用户记录；后台可查询全部记录并查看错误信息、模型、计费和图片资源。

### 下载原图

下载接口根据图片 ID 查询原图对象，设置 `Content-Disposition: attachment`，以文件流返回。前端点击下载时展示加载状态，避免重复提交下载请求。

## 错误处理

业务接口统一返回：

```json
{
  "code": "generation.insufficient_balance",
  "message": "余额不足",
  "data": null,
  "request_id": ""
}
```

框架级错误使用 HTTP 状态码表达，例如 `401`、`403`、`404`、`429`、`500`。业务错误码保持稳定，前端根据错误码展示固定文案。

任务失败时，任务记录保留错误码、错误摘要、上游请求标识和最后事件时间。用户端展示简化原因，后台展示排查字段。

## 测试策略

### 单元测试

1. 配置加载与环境变量覆盖。
2. 密码哈希、JWT、API Key 哈希。
3. 计费计算、部分成功退款、失败退款。
4. 任务状态机合法变更。
5. 图片尺寸与缩略图记录生成。

### 集成测试

1. 注册、登录、读取当前用户。
2. API Key 创建与鉴权。
3. 模型启停影响生图提交。
4. 生图任务创建、队列写入、状态查询。
5. 支付回调验签与余额入账。
6. 公告与灵感库游客读取。

### 构建验证

```bash
cd backend
go test ./...
go build ./cmd/server
bash -n deploy/build.sh deploy/entrypoint.sh
```

## 实施阶段

### 第一阶段：项目基础

完成项目命名、模块名、配置、日志、数据库、Redis、对象存储、统一响应、中间件、健康检查。

### 第二阶段：账户与计费基础

完成用户、登录、API Key、模型、价格、余额账本。

### 第三阶段：生图主业务

完成任务创建、任务队列、Worker、图片保存、缩略图、历史记录、下载接口。

### 第四阶段：运营能力

完成支付、公告、灵感库。

### 第五阶段：后台基础管理

完成后台用户、模型、任务、图片、账本、支付、公告、灵感库、请求记录管理。

## 边界约束

1. 新版工程运行时依赖仅来自 `backend/` 自身模块和第三方库。
2. 新版数据库迁移仅放在 `backend/sql/migrations/`。
3. 新版构建与部署仅使用 `backend/deploy/`。
4. 旧版数据迁移作为后续独立任务处理。
5. V1 优先保证图像生成业务完整运行，复杂调度和高级营销能力进入后续版本。
