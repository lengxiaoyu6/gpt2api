# Image-to-Image Single Count Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让图生图模式始终按单张生成处理，界面隐藏张数选择，提交请求固定为 `n=1`。

**Architecture:** 约束放在前端两层。展示层根据当前模式隐藏图生图的张数选择与多张计费提示；状态提交层在 `editImage` 中统一将张数归一为 `1`，即使调用方传入其他值也会覆盖。这样可以同时覆盖页面交互与前端内部调用路径。

**Tech Stack:** React, Zustand, Vitest, Testing Library

---

### Task 1: 补充 store 层回归测试

**Files:**
Create: 无
Modify: `web/src/store/useStore.test.ts`
Test: `web/src/store/useStore.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
  test('editImage always sends n=1 in image-to-image mode even when count is greater than one', async () => {
    const state = useStore.getState() as any
    await state.fetchImageModels()
    const files = [new File(['demo'], 'demo.png', { type: 'image/png' })]

    await state.editImage({
      prompt: 'portrait relight',
      aspectRatio: '2:3',
      quality: '2K',
      files,
      count: 4,
    })

    expect(meApi.playEditImage).toHaveBeenCalledWith(
      'gpt-image-1',
      'portrait relight',
      files,
      expect.objectContaining({ size: '1344x2016', n: 1 }),
    )
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- web/src/store/useStore.test.ts --runInBand`
Expected: 新增断言失败，实际收到 `n: 4`。

- [ ] **Step 3: Write minimal implementation**

```ts
      async editImage(input) {
        const { modelSlug, modelConfig } = await resolveImageModelConfig(get)
        if (!modelSlug) {
          throw new Error('当前暂无可用图像模型')
        }
        const supportsOutputSize = modelConfig?.supports_output_size ?? true
        const outputQuality = effectiveOutputQuality(supportsOutputSize, input.quality)
        const opts: { n?: number; size?: string; signal?: AbortSignal } = {
          n: 1,
          signal: input.signal,
        }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- web/src/store/useStore.test.ts --runInBand`
Expected: 新增测试通过。

- [ ] **Step 5: Commit**

```bash
git add web/src/store/useStore.test.ts web/src/store/useStore.ts
git commit -m "fix: force single count for image editing"
```

### Task 2: 补充生成页展示回归测试

**Files:**
Create: 无
Modify: `web/src/components/generate.image-notice.test.tsx`
Test: `web/src/components/generate.image-notice.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
  test('generate page hides count controls in image-to-image mode and keeps single-count pricing copy', async () => {
    useStore.setState({
      siteInfo: {
        'site.name': 'OAI Hub',
        'site.description': 'AI 创作平台',
        'site.logo_url': '',
        'site.footer': '',
        'auth.allow_register': 'true',
        'site.image_notice': '',
      },
      generateImage,
      editImage,
      imageModels: [
        { id: 1, slug: 'gpt-image-1', type: 'image', description: '标准模型', image_price_per_call: 1500, supports_multi_image: true },
      ],
      selectedImageModel: 'gpt-image-1',
      setSelectedImageModel: (slug: string | null) => useStore.setState({ selectedImageModel: slug }),
    } as any)

    render(<GenerateView />)
    fireEvent.click(screen.getByRole('tab', { name: '图生图' }))

    expect(screen.queryByText('生成张数')).toBeNull()
    expect(screen.queryByText('多张生成会按张数累计扣费')).toBeNull()
    expect(screen.getByText('当前 1 张，预计消耗 0.15 积分')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- web/src/components/generate.image-notice.test.tsx --runInBand`
Expected: 新增断言失败，页面仍能看到“生成张数”或多张计费提示。

- [ ] **Step 3: Write minimal implementation**

```tsx
  const effectiveImageCount = mode === 'img' ? 1 : (supportsMultiImage ? imageCount : 1)
```

```tsx
          {mode === 'txt' && supportsMultiImage ? (
            <p className="mt-1 text-[9px] font-medium text-foreground/80">多张生成会按张数累计扣费</p>
          ) : null}
```

```tsx
              {mode === 'txt' && supportsMultiImage ? (
                <div className="space-y-3">
                  <p className="pl-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">生成张数</p>
                  <div className="grid grid-cols-4 gap-2">
                    {IMAGE_COUNT_OPTIONS.map((count) => {
                      const isActive = imageCount === count
                      return (
                        <button
                          key={count}
                          type="button"
                          onClick={() => setImageCount(count)}
                          className={cn(
                            'rounded-2xl border px-3 py-3 text-sm font-bold transition-all',
                            isActive
                              ? 'border-primary/50 bg-primary/15 text-foreground shadow-lg shadow-primary/10'
                              : 'border-border/50 bg-background/50 text-muted-foreground hover:border-primary/30 hover:text-foreground',
                          )}
                        >
                          {count} 张
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- web/src/components/generate.image-notice.test.tsx --runInBand`
Expected: 新增测试通过。

- [ ] **Step 5: Commit**

```bash
git add web/src/components/generate.image-notice.test.tsx web/src/components/views/Generate.tsx
git commit -m "fix: hide multi-count controls for image editing"
```

### Task 3: 执行聚焦回归验证

**Files:**
Create: 无
Modify: 无
Test: `web/src/store/useStore.test.ts`, `web/src/components/generate.image-notice.test.tsx`

- [ ] **Step 1: Run store tests**

Run: `npm test -- web/src/store/useStore.test.ts --runInBand`
Expected: `useStore` 相关测试全部通过。

- [ ] **Step 2: Run generate view tests**

Run: `npm test -- web/src/components/generate.image-notice.test.tsx --runInBand`
Expected: 生成页相关测试全部通过。

- [ ] **Step 3: Run combined focused regression**

Run: `npm test -- web/src/store/useStore.test.ts web/src/components/generate.image-notice.test.tsx --runInBand`
Expected: 两组测试同时通过。

- [ ] **Step 4: Commit**

```bash
git add web/src/store/useStore.ts web/src/store/useStore.test.ts web/src/components/views/Generate.tsx web/src/components/generate.image-notice.test.tsx docs/superpowers/plans/2026-05-03-img2img-single-count.md
git commit -m "fix: keep image-to-image generation single output"
```
