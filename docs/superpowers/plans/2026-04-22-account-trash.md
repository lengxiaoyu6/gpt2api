# Account Trash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为账号池补充已删除列表，并支持恢复与彻底删除软删除账号。

**Architecture:** 后端沿用现有软删除模型，在 DAO、Service、Handler、Router 上增加已删除列表、恢复、物理删除能力。前端在账号池页面增加“已删除”标签页，活跃列表继续负责软删除，回收区负责恢复与清理。

**Tech Stack:** Go、Gin、sqlx、Vue 3、TypeScript、Element Plus、Node test、Vite

---

### Task 1: 写出回收区回归测试

**Files:**
Create: `web/tests/account-trash.node.test.mjs`
Test: `cd web && node --test tests/account-trash.node.test.mjs`

- [ ] **Step 1: 新增后端实现断言**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

test('账号 DAO 支持已删除列表恢复与彻底删除', () => {
  const daoGo = read('internal/account/dao.go')
  assert.match(daoGo, /func \(d \*DAO\) ListDeleted\(/)
  assert.match(daoGo, /deleted_at IS NOT NULL/)
  assert.match(daoGo, /func \(d \*DAO\) Restore\(/)
  assert.match(daoGo, /SET deleted_at = NULL WHERE id = \? AND deleted_at IS NOT NULL/)
  assert.match(daoGo, /func \(d \*DAO\) Purge\(/)
})
```

- [ ] **Step 2: 新增路由与前端入口断言**

```js
test('账号池路由挂载已删除列表恢复与彻底删除接口', () => {
  const routerGo = read('internal/server/router.go')
  assert.match(routerGo, /ag\.GET\("\/deleted", d\.AccountH\.ListDeleted\)/)
  assert.match(routerGo, /ag\.POST\("\/:id\/restore", .*d\.AccountH\.Restore\)/)
  assert.match(routerGo, /ag\.DELETE\("\/:id\/purge", .*d\.AccountH\.Purge\)/)
})

test('前端 API 暴露已删除列表恢复与彻底删除方法', () => {
  const apiTs = read('web/src/api/accounts.ts')
  assert.match(apiTs, /deleted_at\?:\s*\{ Time: string; Valid: boolean \} \| string \| null/)
  assert.match(apiTs, /export function listDeletedAccounts\(/)
  assert.match(apiTs, /export function restoreAccount\(/)
  assert.match(apiTs, /export function purgeAccount\(/)
})
```

- [ ] **Step 3: 新增页面交互断言并运行失败验证**

```js
test('账号池页面提供已删除标签与恢复清理操作', () => {
  const pageVue = read('web/src/views/admin/Accounts.vue')
  assert.match(pageVue, /label="已删除"/)
  assert.match(pageVue, /恢复/)
  assert.match(pageVue, /彻底删除/)
  assert.match(pageVue, /已删除列表/)
})
```

Run: `cd web && node --test tests/account-trash.node.test.mjs`
Expected: FAIL，断言指向缺失的接口、路由或页面入口。

### Task 2: 实现后端回收区能力

**Files:**
Modify: `internal/account/model.go`
Modify: `internal/account/dao.go`
Modify: `internal/account/service.go`
Modify: `internal/account/handler.go`
Modify: `internal/server/router.go`
Test: `cd web && node --test tests/account-trash.node.test.mjs`

- [ ] **Step 1: 在账号模型上暴露删除时间字段**

```go
DeletedAt sql.NullTime `db:"deleted_at" json:"deleted_at,omitempty"`
```

- [ ] **Step 2: 在 DAO 中增加已删除列表、恢复、彻底删除方法**

```go
func (d *DAO) ListDeleted(ctx context.Context, status string, keyword string, offset, limit int) ([]*Account, int64, error)
func (d *DAO) Restore(ctx context.Context, id uint64) error
func (d *DAO) Purge(ctx context.Context, id uint64) error
```

彻底删除使用事务，并包含：

```sql
DELETE FROM oai_accounts WHERE id = ? AND deleted_at IS NOT NULL
DELETE FROM oai_account_cookies WHERE account_id = ?
DELETE FROM account_proxy_bindings WHERE account_id = ?
DELETE FROM account_quota_snapshots WHERE account_id = ?
```

- [ ] **Step 3: 在 Service、Handler、Router 上贯通接口**

```go
func (s *Service) ListDeleted(...)
func (s *Service) Restore(...)
func (s *Service) Purge(...)
```

```go
ag.GET("/deleted", d.AccountH.ListDeleted)
ag.POST("/:id/restore", middleware.RequirePerm(rbac.PermAccountWrite), d.AccountH.Restore)
ag.DELETE("/:id/purge", middleware.RequirePerm(rbac.PermAccountWrite), d.AccountH.Purge)
```

- [ ] **Step 4: 运行测试确认后端断言转绿**

Run: `cd web && node --test tests/account-trash.node.test.mjs`
Expected: 后端相关断言通过，页面断言仍可能失败。

### Task 3: 实现前端已删除列表与操作

**Files:**
Modify: `web/src/api/accounts.ts`
Modify: `web/src/views/admin/Accounts.vue`
Test: `cd web && node --test tests/account-trash.node.test.mjs`

- [ ] **Step 1: 在账号 API 中增加删除时间字段与三个方法**

```ts
export function listDeletedAccounts(params = {}) {
  return http.get<any, Page<Account>>('/api/admin/accounts/deleted', { params })
}

export function restoreAccount(id: number) {
  return http.post<any, Account>(`/api/admin/accounts/${id}/restore`)
}

export function purgeAccount(id: number) {
  return http.delete<any, { deleted: number; purged: boolean }>(`/api/admin/accounts/${id}/purge`)
}
```

- [ ] **Step 2: 在账号池页面增加标签页与独立删除列表状态**

```ts
const activeTab = ref<'active' | 'deleted'>('active')
const deletedRows = ref<accountApi.Account[]>([])
const deletedTotal = ref(0)
const deletedPager = reactive({ page: 1, page_size: 10 })
```

新增 `fetchDeletedList()`、`onRestore()`、`onPurge()`，并在恢复后刷新两个列表。

- [ ] **Step 3: 调整删除提示文案并新增已删除表格操作**

```ts
`确定删除账号「${row.email}」?该操作会移入已删除列表，之后仍可恢复。`
```

```vue
<el-tab-pane label="已删除" name="deleted">
  <el-button link type="primary" size="small" @click="onRestore(row)">恢复</el-button>
  <el-button link type="danger" size="small" @click="onPurge(row)">彻底删除</el-button>
</el-tab-pane>
```

- [ ] **Step 4: 运行测试确认全部静态断言通过**

Run: `cd web && node --test tests/account-trash.node.test.mjs`
Expected: PASS。

### Task 4: 完整验证

**Files:**
Modify: `internal/account/model.go`
Modify: `internal/account/dao.go`
Modify: `internal/account/service.go`
Modify: `internal/account/handler.go`
Modify: `internal/server/router.go`
Modify: `web/src/api/accounts.ts`
Modify: `web/src/views/admin/Accounts.vue`
Create: `web/tests/account-trash.node.test.mjs`
Create: `docs/superpowers/specs/2026-04-22-account-trash-design.md`
Create: `docs/superpowers/plans/2026-04-22-account-trash.md`

- [ ] **Step 1: 运行静态测试**

Run: `cd web && node --test tests/account-trash.node.test.mjs`
Expected: PASS。

- [ ] **Step 2: 运行 Go 测试**

Run: `cd /root/code/gpt2api && go test ./...`
Expected: exit 0。

- [ ] **Step 3: 运行前端构建**

Run: `cd /root/code/gpt2api/web && npm run build`
Expected: exit 0。

- [ ] **Step 4: 核对改动范围**

Run: `cd /root/code/gpt2api && git diff -- internal/account/model.go internal/account/dao.go internal/account/service.go internal/account/handler.go internal/server/router.go web/src/api/accounts.ts web/src/views/admin/Accounts.vue web/tests/account-trash.node.test.mjs docs/superpowers/specs/2026-04-22-account-trash-design.md docs/superpowers/plans/2026-04-22-account-trash.md`
Expected: diff 仅包含账号池回收区功能、测试与文档。
