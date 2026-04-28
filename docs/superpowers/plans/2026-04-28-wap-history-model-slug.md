# WAP 历史图片详情模型标识展示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 WAP 历史图片详情弹层中的生成模型展示从 `model_id` 改为模型 `slug`，缺失时显示 `未知`

**Architecture:** 继续使用历史任务接口中的 `model_id` 作为关联键，在 `HistoryView` 中读取现有 `imageModels` 列表进行前端映射。页面结构与样式保持不变，仅替换文本解析逻辑，并用组件测试覆盖命中与回退行为。

**Tech Stack:** React 19、Zustand、Vitest、Testing Library、TypeScript

---

### Task 1: 为历史详情补充模型 slug 展示测试

**Files:**
- Modify: `wap/src/components/backend-binding.test.tsx`
- Test: `wap/src/components/backend-binding.test.tsx`

- [ ] **Step 1: 写入失败测试，先覆盖命中 slug 的展示**

```ts
  test('history view shows matched model slug in detail panel', async () => {
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
        { id: 1, slug: 'gpt-image-1', type: 'image', description: '标准模型', image_price_per_call: 1500 },
      ],
      historyLoaded: false,
      fetchHistory,
      history: [
        {
          id: 1,
          task_id: 'task-1',
          user_id: 1,
          model_id: 1,
          account_id: 1,
          prompt: 'Cloud city',
          n: 1,
          size: '1024x1024',
          status: 'succeeded',
          credit_cost: 5,
          image_urls: ['/p/img/task-1/0'],
          thumb_urls: ['/p/thumb/task-1/0'],
          created_at: '2026-04-22T10:00:00Z',
        },
      ],
    })

    render(<HistoryView />)

    await waitFor(() => expect(fetchHistory).toHaveBeenCalledTimes(1))

    await act(async () => {
      fireEvent.click(screen.getByText('Cloud city'))
    })

    expect(await screen.findByText('生成模型')).toBeInTheDocument()
    expect(screen.getByText('gpt-image-1')).toBeInTheDocument()
  })
```

- [ ] **Step 2: 运行单测确认失败**

Run: `cd wap && npm run test -- --run src/components/backend-binding.test.tsx -t "history view shows matched model slug in detail panel"`
Expected: FAIL，原因是页面仍显示 `MODEL #1`。

- [ ] **Step 3: 实现最小修改使测试通过**

```tsx
const { user, history, historyLoading, fetchHistory, imageModels } = useStore()

const selectedImageModelLabel = selectedImage
  ? imageModels.find((item) => item.id === selectedImage.model_id)?.slug?.trim() || '未知'
  : '未知'
```

并将详情弹层中的模型文本改为：

```tsx
<span className="font-mono text-foreground font-bold tracking-tight">
  {selectedImageModelLabel}
</span>
```

- [ ] **Step 4: 重新运行单测确认通过**

Run: `cd wap && npm run test -- --run src/components/backend-binding.test.tsx -t "history view shows matched model slug in detail panel"`
Expected: PASS。

### Task 2: 为缺失模型补充未知回退测试

**Files:**
- Modify: `wap/src/components/backend-binding.test.tsx`
- Test: `wap/src/components/backend-binding.test.tsx`

- [ ] **Step 1: 写入失败测试，覆盖未命中模型时显示未知**

```ts
  test('history view shows unknown when model slug is missing', async () => {
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
        { id: 2, slug: 'gpt-image-2', type: 'image', description: '高清模型', image_price_per_call: 3000 },
      ],
      historyLoaded: false,
      fetchHistory,
      history: [
        {
          id: 1,
          task_id: 'task-1',
          user_id: 1,
          model_id: 1,
          account_id: 1,
          prompt: 'Cloud city',
          n: 1,
          size: '1024x1024',
          status: 'succeeded',
          credit_cost: 5,
          image_urls: ['/p/img/task-1/0'],
          thumb_urls: ['/p/thumb/task-1/0'],
          created_at: '2026-04-22T10:00:00Z',
        },
      ],
    })

    render(<HistoryView />)

    await waitFor(() => expect(fetchHistory).toHaveBeenCalledTimes(1))

    await act(async () => {
      fireEvent.click(screen.getByText('Cloud city'))
    })

    expect(await screen.findByText('未知')).toBeInTheDocument()
  })
```

- [ ] **Step 2: 运行单测确认失败**

Run: `cd wap && npm run test -- --run src/components/backend-binding.test.tsx -t "history view shows unknown when model slug is missing"`
Expected: FAIL，原因是当前回退值仍不是 `未知`。

- [ ] **Step 3: 调整回退逻辑并保持首个测试通过**

```tsx
const selectedImageModelLabel = selectedImage
  ? imageModels.find((item) => item.id === selectedImage.model_id)?.slug?.trim() || '未知'
  : '未知'
```

- [ ] **Step 4: 运行两条相关单测确认通过**

Run: `cd wap && npm run test -- --run src/components/backend-binding.test.tsx -t "history view shows matched model slug in detail panel|history view shows unknown when model slug is missing"`
Expected: PASS。

### Task 3: 运行回归测试确认历史页行为保持正常

**Files:**
- Test: `wap/src/components/backend-binding.test.tsx`

- [ ] **Step 1: 运行历史页相关测试集**

Run: `cd wap && npm run test -- --run src/components/backend-binding.test.tsx`
Expected: PASS。
