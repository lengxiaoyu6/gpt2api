# WAP 生图参数同步 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `wap` 端生成页在比例、输出尺寸和 prompt 比例前缀行为上与 `web` 端保持一致。

**Architecture:** 在 `wap` 端新增统一图片参数模块，集中维护比例与输出尺寸定义。`store` 负责把页面选择转换为接口参数并补齐 prompt 比例前缀，`Generate` 页面负责渲染文生图与图生图两套参数区。

**Tech Stack:** React 19、TypeScript、Zustand、Vitest、Testing Library

---

### Task 1: 先写失败测试，锁定 store 参数语义

**Files:**
- Modify: `wap/src/store/useStore.test.ts`
- Test: `cd wap && npm run test -- --run src/store/useStore.test.ts`

- [ ] **Step 1: 为文生图补充 21:9 比例、4K 输出和比例前缀断言**

```ts
test('generateImage maps 21:9, applies ratio prefix, forwards upscale and refreshes me plus history', async () => {
  localStorage.setItem('gpt2api.access', 'access-token')
  const state = useStore.getState() as any
  await state.fetchMe()
  await state.fetchImageModels()

  await state.generateImage({
    prompt: 'future skyline',
    aspectRatio: '21:9',
    upscale: '4k',
    count: 4,
  })

  expect(meApi.playGenerateImage).toHaveBeenCalledWith(
    expect.objectContaining({
      model: 'gpt-image-1',
      prompt: 'Make the aspect ratio 21:9 , future skyline',
      size: '1792x1024',
      upscale: '4k',
      n: 4,
    }),
    undefined,
  )
})
```

- [ ] **Step 2: 为图生图补充 2:3 比例、2K 输出和比例前缀断言**

```ts
test('editImage maps 2:3, applies ratio prefix, forwards upscale and refreshes me plus history', async () => {
  localStorage.setItem('gpt2api.access', 'access-token')
  const state = useStore.getState() as any
  await state.fetchMe()
  await state.fetchImageModels()
  const file = new File(['demo'], 'demo.png', { type: 'image/png' })

  await state.editImage({
    prompt: 'portrait relight',
    aspectRatio: '2:3',
    upscale: '2k',
    file,
    count: 3,
  })

  expect(meApi.playEditImage).toHaveBeenCalledWith(
    'gpt-image-1',
    'Make the aspect ratio 2:3 , portrait relight',
    file,
    expect.objectContaining({
      size: '1024x1792',
      upscale: '2k',
      n: 3,
    }),
  )
})
```

- [ ] **Step 3: 运行 store 测试并确认按预期失败**

Run: `cd wap && npm run test -- --run src/store/useStore.test.ts`
Expected: FAIL，提示 `21:9` 与 `2:3` 类型、`upscale` 字段或 prompt 前缀行为尚未实现。

### Task 2: 先写失败测试，锁定页面交互

**Files:**
- Modify: `wap/src/components/app.integration.test.tsx`
- Test: `cd wap && npm run test -- --run src/components/app.integration.test.tsx`

- [ ] **Step 1: 增加文生图 10 档比例和输出尺寸选择断言**

```tsx
expect(screen.getByRole('button', { name: '21:9 超宽屏' })).toBeInTheDocument()
expect(screen.getByRole('button', { name: '2:3 竖版' })).toBeInTheDocument()
expect(screen.getByRole('button', { name: '2K 高清' })).toBeInTheDocument()
expect(screen.getByRole('button', { name: '4K 高清' })).toBeInTheDocument()
```

- [ ] **Step 2: 修改文生图提交断言，覆盖比例与输出尺寸**

```tsx
fireEvent.click(screen.getByRole('button', { name: '21:9 超宽屏' }))
fireEvent.click(screen.getByRole('button', { name: '4K 高清' }))
fireEvent.click(screen.getByRole('button', { name: '4 张' }))
fireEvent.change(screen.getByPlaceholderText('描述想看到的画面...'), {
  target: { value: '未来城市夜景' },
})
fireEvent.click(createButton)

await waitFor(() => {
  expect(generateImage).toHaveBeenCalledWith({
    prompt: '未来城市夜景',
    aspectRatio: '21:9',
    upscale: '4k',
    count: 4,
  })
})
```

- [ ] **Step 3: 运行页面集成测试并确认按预期失败**

Run: `cd wap && npm run test -- --run src/components/app.integration.test.tsx`
Expected: FAIL，提示缺少新比例按钮、输出尺寸按钮，或提交参数仍未包含 `upscale`。

### Task 3: 实现统一图片参数模块与 API 透传

**Files:**
- Create: `wap/src/features/image/options.ts`
- Modify: `wap/src/api/me.ts`
- Modify: `wap/src/store/useStore.ts`
- Test: `cd wap && npm run test -- --run src/store/useStore.test.ts`

- [ ] **Step 1: 新增图片参数模块，集中维护比例、尺寸、输出尺寸与 prompt 前缀方法**

```ts
export type AspectRatio = '1:1' | '5:4' | '9:16' | '21:9' | '16:9' | '4:3' | '3:2' | '4:5' | '3:4' | '2:3'
export type UpscaleLevel = '' | '2k' | '4k'

export const IMAGE_RATIO_OPTIONS = [
  { label: '方形', ratio: '1:1', w: 1, h: 1, size: '1024x1024', desc: '社交媒体' },
  { label: '横屏', ratio: '5:4', w: 5, h: 4, size: '1792x1024', desc: '海报横幅' },
]

const RATIO_PREFIX_RE = /^\s*Make the aspect ratio\s+\S+\s*,\s*/i

export function applyRatioPrefix(prompt: string, ratio: AspectRatio) {
  const prefix = `Make the aspect ratio ${ratio} , `
  const lines = prompt.split(/\r?\n/)
  if (lines.length > 0 && RATIO_PREFIX_RE.test(lines[0])) {
    lines[0] = lines[0].replace(RATIO_PREFIX_RE, prefix)
    return lines.join('\n')
  }
  return prefix + prompt
}
```

- [ ] **Step 2: 在 API 与 store 中接入 `upscale` 与比例前缀**

```ts
export interface PlayImageRequest {
  model: string
  prompt: string
  n?: number
  size?: string
  reference_images?: string[]
  upscale?: '' | '2k' | '4k'
}
```

```ts
if (opts?.upscale) fd.append('upscale', opts.upscale)
```

```ts
prompt: applyRatioPrefix(input.prompt, input.aspectRatio),
size: ASPECT_RATIO_TO_SIZE[input.aspectRatio],
upscale: input.upscale,
```

- [ ] **Step 3: 运行 store 测试确认转绿**

Run: `cd wap && npm run test -- --run src/store/useStore.test.ts`
Expected: PASS。

### Task 4: 实现 Generate 页面参数区同步

**Files:**
- Modify: `wap/src/components/views/Generate.tsx`
- Test: `cd wap && npm run test -- --run src/components/app.integration.test.tsx`

- [ ] **Step 1: 将页面状态拆分为文生图与图生图各自的比例和输出尺寸**

```tsx
const [textAspectRatio, setTextAspectRatio] = useState<AspectRatio>('1:1')
const [imageAspectRatio, setImageAspectRatio] = useState<AspectRatio>('1:1')
const [textUpscale, setTextUpscale] = useState<UpscaleLevel>('')
const [imageUpscale, setImageUpscale] = useState<UpscaleLevel>('')
```

- [ ] **Step 2: 用统一配置渲染 10 档比例和 3 档输出尺寸按钮组**

```tsx
{IMAGE_RATIO_OPTIONS.map((option) => (
  <button
    key={option.ratio}
    type="button"
    aria-label={`${option.ratio} ${option.label}`}
    onClick={() => setTextAspectRatio(option.ratio)}
  >
    <span>{option.ratio}</span>
    <span>{option.label}</span>
  </button>
))}
```

```tsx
{OUTPUT_SIZE_OPTIONS.map((option) => (
  <button
    key={option.value}
    type="button"
    aria-label={option.label}
    onClick={() => setTextUpscale(option.value)}
  >
    {option.label}
  </button>
))}
```

- [ ] **Step 3: 调整提交参数并运行页面集成测试确认转绿**

```tsx
await generateImage({
  prompt: nextPrompt,
  aspectRatio: textAspectRatio,
  upscale: textUpscale,
  count: imageCount,
})
```

```tsx
await editImage({
  prompt: nextPrompt || '增强细节，提升画面质感',
  aspectRatio: imageAspectRatio,
  upscale: imageUpscale,
  file: sourceFile as File,
  count: imageCount,
})
```

Run: `cd wap && npm run test -- --run src/components/app.integration.test.tsx`
Expected: PASS。

### Task 5: 全量校验

**Files:**
- Modify: `docs/superpowers/specs/2026-04-23-wap-image-options-sync-design.md`
- Modify: `docs/superpowers/plans/2026-04-23-wap-image-options-sync.md`
- Test: `cd wap && npm run test -- --run src/store/useStore.test.ts src/components/app.integration.test.tsx`

- [ ] **Step 1: 运行本次相关测试集合**

Run: `cd wap && npm run test -- --run src/store/useStore.test.ts src/components/app.integration.test.tsx`
Expected: PASS。

- [ ] **Step 2: 记录最终影响范围并准备交付说明**

```bash
git diff -- wap/src/features/image/options.ts wap/src/api/me.ts wap/src/store/useStore.ts wap/src/store/useStore.test.ts wap/src/components/views/Generate.tsx wap/src/components/app.integration.test.tsx
```

Expected: 仅出现本次参数同步相关改动。
