# Local Pool Temporary Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将本地账号池的 `chat` 与 `image` 请求改为按请求临时租用代理，并在代理层失败时更新代理健康分，同时移除账号级手动绑定入口。

**Architecture:** 在 `internal/proxy` 中增加临时代理分配器，调度器按 `modelType` 决定是否申请临时代理；Chat 与图片链路把代理层错误回写到代理健康分；后台继续保留 `account_proxy_bindings` 给刷新、额度探测、图片代理下载与导入默认代理使用。

**Tech Stack:** Go, Gin, SQLX, Redis, miniredis, Vue 3, TypeScript, node:test, goose

---

### Task 1: 先补代理分配与调度测试

**Files:**
- Create: `internal/proxy/allocator_test.go`
- Modify: `internal/scheduler/scheduler_test.go`
- Test: `cd /root/code/gpt2api && go test ./internal/proxy ./internal/scheduler`

- [ ] **Step 1: Write the failing test**

在 `internal/proxy/allocator_test.go` 增加三组断言：

```go
func TestAllocatorLeaseOrdersByHealthThenLastUsedThenID(t *testing.T) {}
func TestAllocatorLeaseFallsBackToDirectWhenAllHealthyBusy(t *testing.T) {}
func TestAllocatorReleaseFreesRedisLock(t *testing.T) {}
```

在 `internal/scheduler/scheduler_test.go` 增加两组断言：

```go
func TestDispatchUsesTemporaryProxyForChatAndImage(t *testing.T) {}
func TestDispatchKeepsPersistentBindingForNonRuntimeTypes(t *testing.T) {}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /root/code/gpt2api && go test ./internal/proxy ./internal/scheduler`
Expected: FAIL，因为分配器、`last_used_at` 支持与按 `modelType` 的临时代理分支尚未实现。

- [ ] **Step 3: Write minimal implementation**

实现以下代码：

```go
// internal/proxy/allocator.go
func (a *Allocator) Lease(ctx context.Context) (*Lease, error) {}
func (l *Lease) Release(ctx context.Context) error {}
func (l *Lease) MarkFailure(ctx context.Context, summary string) error {}
```

```go
// internal/scheduler/scheduler.go
func (s *Scheduler) Dispatch(ctx context.Context, modelType string) (*Lease, error) {}
func (s *Scheduler) tryLock(ctx context.Context, acc *account.Account, modelType string) (*Lease, error) {}
```

并在 `internal/proxy/model.go`、`internal/proxy/dao.go`、`internal/proxy/service.go` 中补齐 `last_used_at`、候选列表查询、分配成功写 `last_used_at`。

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /root/code/gpt2api && go test ./internal/proxy ./internal/scheduler`
Expected: PASS

### Task 2: 先补运行态健康分测试，再接入 Chat 与图片错误归类

**Files:**
- Modify: `internal/gateway/chat_test.go`
- Modify: `internal/image/runner_test.go`
- Modify: `internal/gateway/chat.go`
- Modify: `internal/image/runner.go`
- Test: `cd /root/code/gpt2api && go test ./internal/gateway ./internal/image`

- [ ] **Step 1: Write the failing test**

在 `internal/gateway/chat_test.go` 增加：

```go
func TestChatProxyFailureDeductsHealthOnce(t *testing.T) {}
func TestChatBusinessFailureDoesNotDeductProxyHealth(t *testing.T) {}
```

在 `internal/image/runner_test.go` 增加：

```go
func TestImageProxyFailureDeductsHealthOnce(t *testing.T) {}
func TestImageBusinessFailureDoesNotDeductProxyHealth(t *testing.T) {}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /root/code/gpt2api && go test ./internal/gateway ./internal/image`
Expected: FAIL，因为当前请求链路尚未回写代理健康分。

- [ ] **Step 3: Write minimal implementation**

在 `internal/gateway/chat.go` 与 `internal/image/runner.go` 中增加代理层错误识别与一次性扣分逻辑，形式保持集中辅助函数：

```go
func isProxyTransportError(err error) bool {}
func proxyFailureSummary(err error) string {}
```

调用时机固定为：

1. 已持有 `lease.ProxyID > 0`
2. 当前错误属于代理建立阶段
3. 当前请求尚未扣减过代理健康分

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /root/code/gpt2api && go test ./internal/gateway ./internal/image`
Expected: PASS

### Task 3: 补数据库迁移与持久绑定兼容验证

**Files:**
- Create: `sql/migrations/20260428000001_proxy_last_used_at.sql`
- Modify: `sql/migrations/20260417000001_init_schema.sql`
- Test: `cd /root/code/gpt2api && go test ./internal/account ./internal/proxy ./internal/scheduler`

- [ ] **Step 1: Write the failing test or schema assertion**

在 `internal/proxy/allocator_test.go` 或 `internal/scheduler/scheduler_test.go` 中增加对 `last_used_at` 行为的断言，确保分配成功后排序会发生变化；同时保留非 `chat`、非 `image` 链路仍可通过 `account_proxy_bindings` 取到固定代理。

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /root/code/gpt2api && go test ./internal/account ./internal/proxy ./internal/scheduler`
Expected: FAIL，直到迁移与 DAO 更新全部补齐。

- [ ] **Step 3: Write minimal implementation**

新增 migration：

```sql
ALTER TABLE `proxies`
ADD COLUMN `last_used_at` DATETIME NULL AFTER `health_score`;
```

并在初始化 schema 中同步加入该列，保证新库与增量迁移一致。

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /root/code/gpt2api && go test ./internal/account ./internal/proxy ./internal/scheduler`
Expected: PASS

### Task 4: 移除账号级手动绑定入口并保留导入默认代理

**Files:**
- Modify: `internal/account/service.go`
- Modify: `internal/account/handler.go`
- Modify: `internal/server/router.go`
- Modify: `web/src/api/accounts.ts`
- Modify: `web/src/views/admin/Accounts.vue`
- Create: `web/tests/account-proxy-binding.node.test.mjs`
- Test: `cd /root/code/gpt2api/web && node --test tests/account-proxy-binding.node.test.mjs`

- [ ] **Step 1: Write the failing test**

在 `web/tests/account-proxy-binding.node.test.mjs` 增加源码断言：

```js
assert.doesNotMatch(accountsApi, /bindProxy\s*\()/
assert.doesNotMatch(accountsApi, /unbindProxy\s*\()/
assert.doesNotMatch(accountsVue, /bindForm/)
assert.match(accountsVue, /default_proxy_id/)
```

并对后端源码断言 `bind-proxy` 路由与处理函数已移除。

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /root/code/gpt2api/web && node --test tests/account-proxy-binding.node.test.mjs`
Expected: FAIL，因为当前源码仍包含手动绑定接口与页面入口。

- [ ] **Step 3: Write minimal implementation**

删除以下内容：

1. `internal/account/service.go` 中的 `BindProxy` 与 `UnbindProxy`
2. `internal/account/handler.go` 中的 `BindProxy` 与 `UnbindProxy`
3. `internal/server/router.go` 中的 `/:id/bind-proxy` 路由
4. `web/src/api/accounts.ts` 中的 `bindProxy`、`unbindProxy` 与 `AccountCreate.proxy_id`
5. `web/src/views/admin/Accounts.vue` 中新增账号时的代理绑定项、绑定对话框与相关事件

同时保留导入默认代理所需的 `fetchProxies()`、`importForm.default_proxy_id` 与导入提交逻辑。

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /root/code/gpt2api/web && node --test tests/account-proxy-binding.node.test.mjs`
Expected: PASS

### Task 5: 执行集中校验

**Files:**
- Modify: `internal/proxy/allocator.go`
- Modify: `internal/scheduler/scheduler.go`
- Modify: `internal/gateway/chat.go`
- Modify: `internal/image/runner.go`
- Modify: `web/src/views/admin/Accounts.vue`
- Test: `cd /root/code/gpt2api && go test ./internal/proxy ./internal/scheduler ./internal/gateway ./internal/image`
- Test: `cd /root/code/gpt2api/web && node --test tests/account-proxy-binding.node.test.mjs`

- [ ] **Step 1: Run backend test set**

Run: `cd /root/code/gpt2api && go test ./internal/proxy ./internal/scheduler ./internal/gateway ./internal/image`
Expected: PASS

- [ ] **Step 2: Run frontend source assertions**

Run: `cd /root/code/gpt2api/web && node --test tests/account-proxy-binding.node.test.mjs`
Expected: PASS

- [ ] **Step 3: Check workspace diff**

Run: `cd /root/code/gpt2api && git status --short`
Expected: 仅出现本次设计涉及的 Go、SQL、前端与测试文件。
