# 记录详情创作入口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让记录详情支持同参数再生成、基于此图继续编辑、复制本次提示词，并能切换到创作页自动回填参数。

**Architecture:** 在 `useStore` 中新增一次性消费的创作草稿状态，记录页只负责写入草稿并切换页面，创作页统一消费草稿并回填表单。尺寸回填优先匹配静态输出尺寸表，图生图单图场景再结合参考图尺寸识别“原图尺寸”。

**Tech Stack:** React、TypeScript、Zustand、Vitest、Testing Library

---

### Task 1: Store 增加创作草稿状态

**Files:**
- Modify: `web/src/store/useStore.ts`
- Test: `web/src/store/useStore.test.ts`

- [ ] **Step 1: 编写失败测试**

```ts
test('pending generate draft can be stored, consumed once and cleared by auth resets', async () => {
  const state = useStore.getState() as any
  const draft = {
    source: 'history-repeat',
    mode: 'txt',
    prompt: 'Cloud city',
    modelSlug: 'gpt-image-1',
    aspectRatio: '1:1',
    quality: '1K',
    count: 2,
    requestedSize: '1024x1024',
    referenceImageUrls: [],
  }

  state.setPendingGenerateDraft(draft)
  expect((useStore.getState() as any).pendingGenerateDraft).toEqual(draft)
  expect(state.consumePendingGenerateDraft()).toEqual(draft)
  expect((useStore.getState() as any).pendingGenerateDraft).toBeNull()

  state.setPendingGenerateDraft(draft)
  state.handleUnauthorized()
  expect((useStore.getState() as any).pendingGenerateDraft).toBeNull()
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd web && pnpm vitest run src/store/useStore.test.ts -t "pending generate draft can be stored, consumed once and cleared by auth resets"`
Expected: FAIL，提示缺少 `pendingGenerateDraft` 相关字段或方法。

- [ ] **Step 3: 实现最小代码**

在 `useStore.ts` 中新增：

```ts
export interface PendingGenerateDraft {
  source: 'history-repeat' | 'history-continue-edit'
  mode: 'txt' | 'img'
  prompt: string
  modelSlug?: string | null
  aspectRatio?: AspectRatio
  quality?: OutputQualityValue
  count?: 1 | 2 | 3 | 4
  useOriginalSize?: boolean
  requestedSize?: string
  referenceImageUrls?: string[]
}
```

并在 `AppState`、初始状态、`logout`、`forceRelogin`、`handleUnauthorized` 中加入清空逻辑，同时新增：

```ts
setPendingGenerateDraft: (draft: PendingGenerateDraft | null) => void
consumePendingGenerateDraft: () => PendingGenerateDraft | null
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd web && pnpm vitest run src/store/useStore.test.ts -t "pending generate draft can be stored, consumed once and cleared by auth resets"`
Expected: PASS

### Task 2: 创作页补草稿消费与远程参考图回填测试

**Files:**
- Modify: `web/src/components/generate.image-notice.test.tsx`
- Modify: `web/src/components/views/Generate.tsx`

- [ ] **Step 1: 编写失败测试**

追加两个测试：

```ts
test('generate view consumes pending text draft and fills prompt, model, ratio, quality and count', async () => {
  useStore.setState({
    pendingGenerateDraft: {
      source: 'history-repeat',
      mode: 'txt',
      prompt: '历史回填提示词',
      modelSlug: 'gpt-image-2',
      aspectRatio: '16:9',
      quality: '4K',
      count: 3,
      requestedSize: '3840x2160',
    },
    imageModels: [
      { id: 1, slug: 'gpt-image-1', type: 'image', description: '标准模型', image_price_per_call: 1500 },
      { id: 2, slug: 'gpt-image-2', type: 'image', description: '高清模型', image_price_per_call: 2500 },
    ],
    selectedImageModel: 'gpt-image-1',
    setSelectedImageModel: (slug: string | null) => useStore.setState({ selectedImageModel: slug }),
    generateImage,
    editImage,
    siteInfo: defaultSiteInfo,
  } as any)

  render(<GenerateView />)

  expect(screen.getByPlaceholderText('描述想看到的画面...')).toHaveValue('历史回填提示词')
  expect(useStore.getState().selectedImageModel).toBe('gpt-image-2')
  expect(screen.getByRole('button', { name: '16:9 宽屏' })).toHaveClass('border-primary/50')
  expect(screen.getByRole('button', { name: '4K' })).toHaveClass('border-primary/50')
  expect(screen.getByRole('button', { name: '3 张' })).toHaveClass('border-primary/50')
  expect((useStore.getState() as any).pendingGenerateDraft).toBeNull()
})

test('generate view consumes pending image draft and loads remote result into source images', async () => {
  const blob = new Blob(['history-image'], { type: 'image/png' })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    blob: vi.fn().mockResolvedValue(blob),
    headers: { get: vi.fn(() => 'image/png') },
  }))
  URL.createObjectURL = vi.fn().mockReturnValue('blob:history-source')

  useStore.setState({
    pendingGenerateDraft: {
      source: 'history-continue-edit',
      mode: 'img',
      prompt: '历史图生图提示词',
      modelSlug: 'gpt-image-1',
      requestedSize: '1024x1024',
      quality: '1K',
      referenceImageUrls: ['https://example.com/history-result.png'],
    },
    imageModels: [
      { id: 1, slug: 'gpt-image-1', type: 'image', description: '标准模型', image_price_per_call: 1500 },
    ],
    selectedImageModel: 'gpt-image-1',
    setSelectedImageModel: (slug: string | null) => useStore.setState({ selectedImageModel: slug }),
    generateImage,
    editImage,
    siteInfo: defaultSiteInfo,
  } as any)

  render(<GenerateView />)

  await waitFor(() => expect(screen.getByRole('tab', { name: '图生图' })).toHaveAttribute('aria-selected', 'true'))
  await waitFor(() => expect(screen.getByAltText('参考图 1')).toHaveAttribute('src', 'blob:history-source'))
  expect(screen.getByPlaceholderText('描述想要修改、增强或重绘的部分...')).toHaveValue('历史图生图提示词')
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd web && pnpm vitest run src/components/generate.image-notice.test.tsx -t "consumes pending"`
Expected: FAIL，提示创作页尚未消费 `pendingGenerateDraft`。

- [ ] **Step 3: 实现最小代码**

在 `Generate.tsx` 中：

```ts
const {
  ...,
  consumePendingGenerateDraft,
  setSelectedImageModel,
} = useStore()
```

增加草稿消费逻辑：

```ts
useEffect(() => {
  let active = true

  const applyPendingState = async () => {
    const draft = consumePendingGenerateDraft()
    if (draft) {
      await applyPendingGenerateDraft(draft, active)
      return
    }

    const nextPrompt = consumePendingPrompt()
    if (nextPrompt) {
      setMode('txt')
      setPrompt(nextPrompt)
    }
  }

  void applyPendingState()

  return () => {
    active = false
  }
}, [consumePendingGenerateDraft, consumePendingPrompt, imageModels, setSelectedImageModel])
```

同时补充：

1. 远程图片 URL 转 `File` 的辅助函数。
2. 图生图草稿自动载入参考图并替换 `sourceImages`。
3. 文生图草稿回填比例、质量、张数。
4. 命中单图原图尺寸时切换到 `ORIGINAL_SIZE_RATIO`。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd web && pnpm vitest run src/components/generate.image-notice.test.tsx -t "consumes pending"`
Expected: PASS

### Task 3: 记录详情补创作操作测试与实现

**Files:**
- Modify: `web/src/components/backend-binding.test.tsx`
- Modify: `web/src/components/views/History.tsx`
- Modify: `web/src/features/image/options.ts`

- [ ] **Step 1: 编写失败测试**

追加三个测试：

```ts
test('history detail copies prompt and keeps dialog open', async () => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
  render(<HistoryView />)

  await act(async () => {
    fireEvent.click(screen.getByAltText('Cloud city'))
  })

  fireEvent.click(screen.getByRole('button', { name: '复制本次提示词' }))
  await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Cloud city'))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})

test('history detail repeat action writes pending draft and switches to generate tab after confirmation', async () => {
  render(<HistoryView />)

  await act(async () => {
    fireEvent.click(screen.getByAltText('Cloud city'))
  })

  fireEvent.click(screen.getByRole('button', { name: '同参数再生成' }))
  expect(screen.getByText('确认再次生成')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '确认生成' }))

  await waitFor(() => expect(useStore.getState().activeTab).toBe('generate'))
  expect((useStore.getState() as any).pendingGenerateDraft).toMatchObject({
    source: 'history-repeat',
    mode: 'txt',
    prompt: 'Cloud city',
    modelSlug: 'gpt-image-1',
    aspectRatio: '1:1',
    quality: '1K',
    count: 1,
  })
})

test('history detail continue edit writes selected original image into pending draft', async () => {
  render(<HistoryView />)

  await act(async () => {
    fireEvent.click(screen.getByText('Preload multi city'))
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '下一张' }))
  })
  fireEvent.click(screen.getByRole('button', { name: '基于此图继续编辑' }))

  await waitFor(() => expect(useStore.getState().activeTab).toBe('generate'))
  expect((useStore.getState() as any).pendingGenerateDraft).toMatchObject({
    source: 'history-continue-edit',
    mode: 'img',
    referenceImageUrls: ['/p/img/task-preload-multi/1'],
    prompt: 'Preload multi city',
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd web && pnpm vitest run src/components/backend-binding.test.tsx -t "history detail"`
Expected: FAIL，提示缺少新按钮或未写入草稿。

- [ ] **Step 3: 实现最小代码**

在 `History.tsx` 中新增：

1. `复制本次提示词` 按钮与复制逻辑。
2. `同参数再生成` 按钮、确认弹窗与草稿写入。
3. `基于此图继续编辑` 按钮与草稿写入。
4. 尺寸到比例和质量的辅助解析。
5. `setPendingGenerateDraft` 与 `setActiveTab('generate')` 调用。

在 `options.ts` 中补一个尺寸匹配辅助函数，供记录页与创作页共用：

```ts
export function matchOutputPresetBySize(size?: string | null) {
  for (const ratio of IMAGE_RATIO_OPTIONS) {
    for (const quality of OUTPUT_QUALITY_OPTIONS) {
      if (resolveOutputSize(ratio.ratio, quality.value) === normalizeOutputSize(size)) {
        return { aspectRatio: ratio.ratio, quality: quality.value }
      }
    }
  }
  return null
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd web && pnpm vitest run src/components/backend-binding.test.tsx -t "history detail"`
Expected: PASS

### Task 4: 全量相关验证

**Files:**
- Modify: `docs/superpowers/plans/2026-05-03-history-detail-generate-actions.md`

- [ ] **Step 1: 运行 Store、创作页、记录页相关测试**

Run: `cd web && pnpm vitest run src/store/useStore.test.ts src/components/generate.image-notice.test.tsx src/components/backend-binding.test.tsx`
Expected: PASS

- [ ] **Step 2: 记录计划完成状态**

将本计划中的任务复选框按完成情况更新，保留实际执行结果。
