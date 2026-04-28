# WAP 历史图片详情生成耗时展示修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正 WAP 历史图片详情弹层中的“生成耗时”展示，使该字段优先显示真实耗时，`started_at` 缺失时回退 `created_at`，时间仍不完整时显示 `未知`

**Architecture:** 保持后端 `/api/me/images/tasks` 返回结构不变，优先使用历史任务中的 `started_at` 与 `finished_at` 计算耗时；当 `started_at` 缺失时，回退使用 `created_at` 与 `finished_at`。前端仅调整 `HistoryView` 的耗时辅助函数，移除状态文案混入，并在组件测试中覆盖完整时间、`created_at` 回退与时间不完整三类场景。

**Tech Stack:** React 19、TypeScript、Zustand、Vitest、Testing Library

---

### Task 1: 为历史详情补充耗时展示回归测试

**Files:**
- Modify: `wap/src/components/backend-binding.test.tsx`
- Test: `wap/src/components/backend-binding.test.tsx`

- [ ] **Step 1: 写入失败测试，覆盖时间不完整时显示未知**

```ts
  test('history view shows unknown duration when task timing is incomplete', async () => {
    const fetchHistory = vi.fn().mockResolvedValue([])

    useStore.setState({
      user: {
        id: 1,
        email: 'demo@example.com',
        nickname: 'Demo',
        role: 'user',
        status: 'active',
        group_id: 1,
        credit_balance: 89900,
        credit_frozen: 0,
      },
      historyLoaded: false,
      fetchHistory,
      history: [
        {
          id: 1,
          task_id: 'task-processing',
          user_id: 1,
          model_id: 1,
          account_id: 1,
          prompt: 'Processing city',
          n: 1,
          size: '1024x1024',
          status: 'processing',
          credit_cost: 5,
          image_urls: [],
          created_at: '2026-04-22T10:00:00Z',
          started_at: '2026-04-22T10:00:05Z',
          finished_at: null,
        },
      ],
    })

    render(<HistoryView />)

    await waitFor(() => expect(fetchHistory).toHaveBeenCalledTimes(1))

    await act(async () => {
      fireEvent.click(screen.getByText('Processing city'))
    })

    expect(await screen.findByText('生成耗时')).toBeInTheDocument()
    expect(screen.getByText('未知')).toBeInTheDocument()
  })
```

- [ ] **Step 2: 运行单测确认失败**

Run: `cd wap && npm run test -- --run src/components/backend-binding.test.tsx -t "history view shows unknown duration when task timing is incomplete"`
Expected: FAIL，原因是当前页面仍显示 `生成中`。

- [ ] **Step 3: 补充完整时间场景的回归断言**

```ts
  test('history view shows elapsed seconds when task timing is complete', async () => {
    const fetchHistory = vi.fn().mockResolvedValue([])

    useStore.setState({
      user: {
        id: 1,
        email: 'demo@example.com',
        nickname: 'Demo',
        role: 'user',
        status: 'active',
        group_id: 1,
        credit_balance: 89900,
        credit_frozen: 0,
      },
      historyLoaded: false,
      fetchHistory,
      history: [
        {
          id: 2,
          task_id: 'task-failed',
          user_id: 1,
          model_id: 2,
          account_id: 1,
          prompt: 'Failed city',
          n: 1,
          size: '1024x1024',
          status: 'failed',
          error: '内容审核未通过',
          credit_cost: 5,
          image_urls: [],
          created_at: '2026-04-22T11:00:00Z',
          started_at: '2026-04-22T11:00:05Z',
          finished_at: '2026-04-22T11:00:12Z',
        },
      ],
    })

    render(<HistoryView />)

    await waitFor(() => expect(fetchHistory).toHaveBeenCalledTimes(1))

    await act(async () => {
      fireEvent.click(screen.getByText('Failed city'))
    })

    expect(await screen.findByText('生成耗时')).toBeInTheDocument()
    expect(screen.getByText('7 秒')).toBeInTheDocument()
  })
```

- [ ] **Step 4: 运行两条相关单测，记录一条失败一条通过的现状**

Run: `cd wap && npm run test -- --run src/components/backend-binding.test.tsx -t "history view shows unknown duration when task timing is incomplete|history view shows elapsed seconds when task timing is complete"`
Expected: 第一条 FAIL，第二条 PASS。

- [ ] **Step 5: 写入失败测试，覆盖 `started_at` 缺失时回退 `created_at`**

```ts
  test('history view falls back to created_at when started_at is missing', async () => {
    const fetchHistory = vi.fn().mockResolvedValue([])

    useStore.setState({
      user: {
        id: 1,
        email: 'demo@example.com',
        nickname: 'Demo',
        role: 'user',
        status: 'active',
        group_id: 1,
        credit_balance: 89900,
        credit_frozen: 0,
      },
      imageModels: [
        { id: 3, slug: 'gpt-image-3', type: 'image', description: '极速模型', image_price_per_call: 600 },
      ],
      historyLoaded: false,
      fetchHistory,
      history: [
        {
          id: 3,
          task_id: 'task-created-fallback',
          user_id: 1,
          model_id: 3,
          account_id: 1,
          prompt: 'Fallback city',
          n: 1,
          size: '1024x1024',
          status: 'succeeded',
          credit_cost: 5,
          image_urls: ['/p/img/task-created-fallback/0'],
          thumb_urls: ['/p/thumb/task-created-fallback/0'],
          created_at: '2026-04-22T12:00:00Z',
          started_at: null,
          finished_at: '2026-04-22T12:00:12Z',
        },
      ],
    })

    render(<HistoryView />)

    await waitFor(() => expect(fetchHistory).toHaveBeenCalledTimes(1))

    await act(async () => {
      fireEvent.click(screen.getByText('Fallback city'))
    })

    const durationRow = (await screen.findByText('生成耗时')).closest('div')

    expect(durationRow).not.toBeNull()
    expect(within(durationRow as HTMLElement).getByText('12 秒')).toBeInTheDocument()
  })
```

- [ ] **Step 6: 运行新增单测确认失败**

Run: `cd wap && npm run test -- --run src/components/backend-binding.test.tsx -t "history view falls back to created_at when started_at is missing"`
Expected: FAIL，原因是当前页面仍显示 `未知`。

### Task 2: 修改历史页耗时文案解析逻辑

**Files:**
- Modify: `wap/src/components/views/History.tsx`
- Test: `wap/src/components/backend-binding.test.tsx`

- [ ] **Step 1: 以最小改动调整耗时函数**

```ts
function getTaskDurationLabel(item: HistoryRecord) {
  const startedAtSource = item.started_at || item.created_at

  if (startedAtSource && item.finished_at) {
    const startedAt = new Date(startedAtSource).getTime()
    const finishedAt = new Date(item.finished_at).getTime()

    if (Number.isFinite(startedAt) && Number.isFinite(finishedAt) && finishedAt >= startedAt) {
      const durationSeconds = Math.max(1, Math.round((finishedAt - startedAt) / 1000))
      return `${durationSeconds} 秒`
    }
  }

  return '未知'
}
```

- [ ] **Step 2: 运行相关单测确认通过**

Run: `cd wap && npm run test -- --run src/components/backend-binding.test.tsx -t "history view falls back to created_at when started_at is missing|history view shows unknown duration when task timing is incomplete|history view shows elapsed seconds when task timing is complete"`
Expected: PASS。

### Task 3: 运行历史页相关回归测试

**Files:**
- Test: `wap/src/components/backend-binding.test.tsx`

- [ ] **Step 1: 运行历史页组件测试集**

Run: `cd wap && npm run test -- --run src/components/backend-binding.test.tsx`
Expected: PASS。
