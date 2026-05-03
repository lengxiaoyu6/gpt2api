# Web 本地账号池剩余容量提示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 当 web 生图页选择本地账号池模型时，显示当前账号池剩余容量，并在提交后同步刷新。

**Architecture:** 后端新增一个面向用户端的只读接口，复用账号池额度汇总查询能力，返回全局剩余容量、总容量与可用账号数。web 端在状态仓库中增加额度摘要状态与拉取方法，生图页根据模型是否走本地账号池决定是否请求与展示，并在本地账号池生图后刷新该摘要。

**Tech Stack:** Go、Gin、sqlx、React、Zustand、Vitest

---

### Task 1: 后端用户端额度摘要接口

**Files:**
Create: `internal/account/handler_test.go`
Modify: `internal/account/handler.go`
Modify: `internal/account/service.go`
Modify: `internal/server/router.go`
Test: `internal/account/handler_test.go`

- [ ] **Step 1: Write the failing test**

```go
func TestLocalPoolQuotaSummaryReturnsAggregate(t *testing.T) {
    h := NewHandler(NewService(dao, nil))
    h.LocalPoolQuotaSummary(c)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/account -run TestLocalPoolQuotaSummaryReturnsAggregate -count=1`
Expected: FAIL，提示 `LocalPoolQuotaSummary` 未定义或行为未实现。

- [ ] **Step 3: Write minimal implementation**

```go
func (s *Service) QuotaSummary(ctx context.Context) (*QuotaSummary, error) {
    return s.dao.SumQuota(ctx)
}

func (h *Handler) LocalPoolQuotaSummary(c *gin.Context) {
    s, err := h.svc.QuotaSummary(c.Request.Context())
    if err != nil {
        resp.Internal(c, err.Error())
        return
    }
    resp.OK(c, s)
}
```

并在 `internal/server/router.go` 中注册：

```go
authed.GET("/me/local-pool-quota-summary", middleware.RequirePerm(rbac.PermSelfImage), d.AccountH.LocalPoolQuotaSummary)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/account -run TestLocalPoolQuotaSummaryReturnsAggregate -count=1`
Expected: PASS

### Task 2: web 端额度摘要状态与接口封装

**Files:**
Modify: `web/src/api/me.ts`
Modify: `web/src/store/useStore.ts`
Modify: `web/src/store/useStore.test.ts`
Test: `web/src/store/useStore.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('fetchLocalPoolQuotaSummary stores quota summary and generateImage refreshes it for local pool models', async () => {
  await state.fetchLocalPoolQuotaSummary()
  await state.generateImage({ prompt: 'future skyline', aspectRatio: '1:1' })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && pnpm vitest run src/store/useStore.test.ts -t "local pool quota"`
Expected: FAIL，提示缺少接口、状态或刷新行为。

- [ ] **Step 3: Write minimal implementation**

```ts
export interface LocalPoolQuotaSummary {
  total_remaining: number
  total_capacity: number
  active_accounts: number
}

export function getMyLocalPoolQuotaSummary() {
  return http.get('/api/me/local-pool-quota-summary') as Promise<LocalPoolQuotaSummary>
}
```

```ts
localPoolQuotaSummary: null,
localPoolQuotaStatus: 'idle',

async fetchLocalPoolQuotaSummary() {
  set({ localPoolQuotaStatus: 'loading' })
  try {
    const data = await meApi.getMyLocalPoolQuotaSummary()
    set({ localPoolQuotaSummary: data, localPoolQuotaStatus: 'ready' })
    return data
  } catch (error) {
    set({ localPoolQuotaSummary: null, localPoolQuotaStatus: 'error' })
    throw error
  }
}
```

并在本地账号池 `generateImage`、`editImage` 的 `finally` 中追加 `fetchLocalPoolQuotaSummary()` 刷新。

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && pnpm vitest run src/store/useStore.test.ts -t "local pool quota"`
Expected: PASS

### Task 3: 生图页展示本地账号池容量

**Files:**
Modify: `web/src/components/views/Generate.tsx`
Modify: `web/src/components/generate.image-notice.test.tsx`
Test: `web/src/components/generate.image-notice.test.tsx`

- [ ] **Step 1: Write the failing test**

```ts
test('generate page shows local pool quota summary for local pool model', () => {
  expect(screen.getByText('账号池剩余 12 / 50')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && pnpm vitest run src/components/generate.image-notice.test.tsx -t "local pool quota"`
Expected: FAIL，页面尚未展示额度摘要。

- [ ] **Step 3: Write minimal implementation**

```tsx
{currentModelUsesLocalPool ? (
  <div>
    <p>账号池剩余 {localPoolQuotaSummary.total_remaining} / {localPoolQuotaSummary.total_capacity}</p>
    <p>可用账号 {localPoolQuotaSummary.active_accounts} 个</p>
  </div>
) : null}
```

并在组件中基于当前模型触发 `fetchLocalPoolQuotaSummary()`。

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && pnpm vitest run src/components/generate.image-notice.test.tsx -t "local pool quota"`
Expected: PASS

### Task 4: 全量验证

**Files:**
Modify: `docs/superpowers/plans/2026-05-03-web-local-pool-quota-summary.md`
Test: `internal/account/handler_test.go`
Test: `web/src/store/useStore.test.ts`
Test: `web/src/components/generate.image-notice.test.tsx`

- [ ] **Step 1: Run backend verification**

Run: `go test ./internal/account -count=1`
Expected: PASS

- [ ] **Step 2: Run frontend verification**

Run: `cd web && pnpm vitest run src/store/useStore.test.ts src/components/generate.image-notice.test.tsx`
Expected: PASS

- [ ] **Step 3: Run type check for web**

Run: `cd web && pnpm exec tsc --noEmit`
Expected: PASS
