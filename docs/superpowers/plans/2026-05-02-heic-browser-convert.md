# HEIC 参考图浏览器转码 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为图生图参考图增加浏览器端 HEIC、HEIF 转 JPEG 能力，使预览与提交都使用转换后的 JPEG 文件，同时保留服务端 HEIC 兜底处理。

**Architecture:** `Generate.tsx` 继续负责上传与提交流程，但把 HEIC 识别与浏览器端转码抽到独立工具模块。普通图片继续原样进入预览与提交；HEIC、HEIF 通过 Worker 风格封装转换为 JPEG 后再进入列表。服务端已有 HEIC 兼容逻辑保持不变，用回归测试确认双层兼容仍可用。

**Tech Stack:** React 19、TypeScript、Vitest、Vite、heic-to、Go

---

### Task 1: 建立前端 HEIC 转码测试基线

**Files:**
Create: 无
Modify: `web/src/components/generate.image-notice.test.tsx`
Test: `web/src/components/generate.image-notice.test.tsx`

- [ ] **Step 1: 写前端失败测试**

```ts
test('image-to-image converts heic files to jpeg previews before submit', async () => {
  // 上传 HEIC 后显示真实预览，提交时传入 JPEG
})

test('image-to-image converts disguised heic png files before submit', async () => {
  // 文件名是 png，文件头是 heic，也要转 JPEG
})

test('image-to-image removes heic file when conversion fails', async () => {
  // 转码失败时提示错误，并阻止失败文件进入提交列表
})
```

- [ ] **Step 2: 运行测试确认当前失败**

Run: `pnpm --dir web test --run src/components/generate.image-notice.test.tsx -t 'image-to-image (converts heic files to jpeg previews before submit|converts disguised heic png files before submit|removes heic file when conversion fails)'`
Expected: FAIL，当前实现仍显示占位卡片，且提交原始 HEIC 文件。

- [ ] **Step 3: 为转码模块建立测试替身**

```ts
const convertHEICToJPEG = vi.fn()

vi.mock('../lib/heic', async () => {
  const actual = await vi.importActual('../lib/heic')
  return {
    ...actual,
    convertHEICToJPEG,
  }
})
```

测试中让 `convertHEICToJPEG` 返回新的 JPEG `File`，并断言 `URL.createObjectURL` 接收到的是转换后的文件。

- [ ] **Step 4: 运行测试确认继续失败在真实行为断言上**

Run: `pnpm --dir web test --run src/components/generate.image-notice.test.tsx -t 'image-to-image (converts heic files to jpeg previews before submit|converts disguised heic png files before submit|removes heic file when conversion fails)'`
Expected: FAIL，说明测试已正确约束目标行为。

### Task 2: 提取 HEIC 识别与浏览器端转码模块

**Files:**
Create: `web/src/lib/heic.ts`
Modify: `web/package.json`
Test: `web/src/components/generate.image-notice.test.tsx`

- [ ] **Step 1: 安装浏览器端转码依赖**

Run: `pnpm --dir web add heic-to`
Expected: `package.json` 与锁文件新增 `heic-to`。

- [ ] **Step 2: 编写最小转码封装**

```ts
import { heicTo } from 'heic-to/next'

export async function convertHEICToJPEG(file: File): Promise<File> {
  const output = await heicTo({
    blob: file,
    type: 'image/jpeg',
    quality: 0.9,
  })
  const blob = Array.isArray(output) ? output[0] : output
  if (!(blob instanceof Blob) || blob.size === 0) {
    throw new Error('empty converted blob')
  }
  return new File([blob], toJPEGFileName(file.name), { type: 'image/jpeg' })
}
```

同文件补充：

```ts
export type SourceImageFormat = 'png' | 'jpeg' | 'webp' | 'heic' | 'heif'
export async function detectSourceImageFormat(file: File): Promise<SourceImageFormat | null> { /* 复用现有 MIME、扩展名、文件头判断 */ }
export function isConvertibleSourceImageFormat(format: SourceImageFormat): boolean { /* ... */ }
```

- [ ] **Step 3: 运行前端测试，确认仍因组件未接入而失败**

Run: `pnpm --dir web test --run src/components/generate.image-notice.test.tsx -t 'image-to-image (converts heic files to jpeg previews before submit|converts disguised heic png files before submit|removes heic file when conversion fails)'`
Expected: FAIL，失败集中在 `Generate.tsx` 当前行为。

### Task 3: 接入 Generate 图生图上传、预览与提交流程

**Files:**
Create: 无
Modify: `web/src/components/views/Generate.tsx`
Test: `web/src/components/generate.image-notice.test.tsx`

- [ ] **Step 1: 最小化调整参考图状态结构**

```ts
interface SourceImage {
  originalFile: File
  uploadFile: File
  preview: string | null
  previewMode: 'image' | 'converting'
  sourceFormat: SourceImageFormat
}
```

普通图片直接写入：

```ts
{
  originalFile: file,
  uploadFile: file,
  preview: URL.createObjectURL(file),
  previewMode: 'image',
  sourceFormat: format,
}
```

HEIC、HEIF 先写入转换中占位，再异步替换为转换结果。

- [ ] **Step 2: 修改上传流程使用转码结果**

```ts
const format = await detectSourceImageFormat(file)
if (format === 'heic' || format === 'heif') {
  const convertedFile = await convertHEICToJPEG(file)
  return {
    originalFile: file,
    uploadFile: convertedFile,
    preview: URL.createObjectURL(convertedFile),
    previewMode: 'image',
    sourceFormat: format,
  }
}
```

转换失败时：

```ts
toast.error('参考图转换失败，请更换图片后重试')
return null
```

- [ ] **Step 3: 修改提交流程与删除回收逻辑**

```ts
files: sourceImages.map((image) => image.uploadFile)
```

删除与卸载阶段继续按 `preview` 回收 blob URL。

- [ ] **Step 4: 运行前端测试确认通过**

Run: `pnpm --dir web test --run src/components/generate.image-notice.test.tsx -t 'image-to-image (converts heic files to jpeg previews before submit|converts disguised heic png files before submit|removes heic file when conversion fails)'`
Expected: PASS

### Task 4: 完整回归与构建验证

**Files:**
Create: 无
Modify: 视前面任务实际结果而定
Test: `web/src/components/generate.image-notice.test.tsx`, `internal/gateway/image_channel_test.go`

- [ ] **Step 1: 运行前端相关完整测试**

Run: `pnpm --dir web test --run src/components/generate.image-notice.test.tsx`
Expected: PASS

- [ ] **Step 2: 运行前端构建**

Run: `pnpm --dir web build`
Expected: PASS

- [ ] **Step 3: 运行服务端回归**

Run: `go test ./internal/gateway -count=1`
Expected: PASS

- [ ] **Step 4: 检查规格覆盖与实际变更**

Run: `git diff -- web/src/components/views/Generate.tsx web/src/components/generate.image-notice.test.tsx web/src/lib/heic.ts web/package.json web/pnpm-lock.yaml`
Expected: 变更覆盖识别、转码、预览、提交、测试与依赖更新。
