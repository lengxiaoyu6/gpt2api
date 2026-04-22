# WAP History Swipe Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `wap` 端记录页详情弹层增加多图左右滑动预览、页码提示，以及按当前预览图下载原图的行为。

**Architecture:** 在 `History` 组件内部增加当前预览索引与触摸起止坐标状态，继续复用现有弹层与下载逻辑。测试先覆盖多图切换和下载目标变化，再以最小代码改动通过回归。

**Tech Stack:** React 19、Vitest、Testing Library、TypeScript、现有 `wap` UI 组件

---

### Task 1: 多图滑动预览测试

**Files:**
- Modify: `wap/src/components/backend-binding.test.tsx`
- Test: `cd wap && npm run test -- --run src/components/backend-binding.test.tsx -t "history view supports swiping multi-image preview"`

- [ ] **Step 1: Write the failing test**

```ts
test('history view supports swiping multi-image preview', async () => {
  // 打开多图任务详情
  // 断言首图与页码 1 / 2
  // 触发左滑
  // 断言切到第二张图与页码 2 / 2
  // 点击下载原图，断言 fetch 请求第二张图地址
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd wap && npm run test -- --run src/components/backend-binding.test.tsx -t "history view supports swiping multi-image preview"`
Expected: FAIL，当前实现仍固定使用第一张图，且没有页码与滑动切换逻辑。

- [ ] **Step 3: Write minimal implementation**

```tsx
const [previewIndex, setPreviewIndex] = useState(0)
const selectedImageUrls = selectedImage?.image_urls ?? []
const selectedPreviewUrl = selectedImageUrls[previewIndex] ?? null
```

```tsx
onClick={() => {
  setSelectedImage(item)
  setPreviewIndex(0)
}}
```

```tsx
onTouchStart={(event) => { /* 记录起点 */ }}
onTouchEnd={(event) => { /* 根据位移切换索引 */ }}
```

```tsx
{selectedImageUrls.length > 1 ? <span>{previewIndex + 1} / {selectedImageUrls.length}</span> : null}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd wap && npm run test -- --run src/components/backend-binding.test.tsx -t "history view supports swiping multi-image preview"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add wap/src/components/views/History.tsx wap/src/components/backend-binding.test.tsx docs/superpowers/specs/2026-04-22-wap-history-swipe-preview-design.md docs/superpowers/plans/2026-04-22-wap-history-swipe-preview.md
git commit -m "feat: add swipe preview for wap history"
```

### Task 2: 全量回归校验

**Files:**
- Modify: `wap/src/components/views/History.tsx`
- Modify: `wap/src/components/backend-binding.test.tsx`
- Test: `cd wap && npm run test -- --run && npm run lint && npm run build`

- [ ] **Step 1: Run full test suite**

Run: `cd wap && npm run test -- --run`
Expected: PASS，全部测试通过。

- [ ] **Step 2: Run type check**

Run: `cd wap && npm run lint`
Expected: PASS，无 TypeScript 错误。

- [ ] **Step 3: Run build**

Run: `cd wap && npm run build`
Expected: PASS，构建成功；允许保留既有 chunk size 提示。

- [ ] **Step 4: Commit**

```bash
git add wap/src/components/views/History.tsx wap/src/components/backend-binding.test.tsx docs/superpowers/specs/2026-04-22-wap-history-swipe-preview-design.md docs/superpowers/plans/2026-04-22-wap-history-swipe-preview.md
git commit -m "test: verify wap history swipe preview"
```
