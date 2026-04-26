# WAP Canvas Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 WAP 生图页的画布比例选择器改为底部抽屉单列卡片列表，并保留当前质量与计费行为。

**Architecture:** 复用 `wap/src/components/ui/sheet.tsx` 作为底部抽屉容器，继续使用 `wap/src/features/image/options.ts` 提供比例数据与缩略预览尺寸。`GenerateView` 内仅调整比例选择器 UI 与少量本地状态，不改变请求参数与价格逻辑。

**Tech Stack:** React, TypeScript, Vitest, Testing Library, Tailwind CSS, Base UI Dialog

---

### Task 1: 用测试描述底部抽屉比例选择器

**Files:**
- Modify: `wap/src/components/generate.image-notice.test.tsx`
- Test: `wap/src/components/generate.image-notice.test.tsx`

- [ ] **Step 1: Write the failing test**

将现有比例断言改为触发器与抽屉行为，并新增一次选择后摘要更新断言：

```ts
expect(screen.getByRole('button', { name: '画布比例 1:1 方形 社交媒体' })).toBeInTheDocument()
fireEvent.click(screen.getByRole('button', { name: '画布比例 1:1 方形 社交媒体' }))
expect(screen.getByText('选择画布比例')).toBeInTheDocument()
expect(screen.getByRole('button', { name: '16:9 宽屏 电影宽屏' })).toBeInTheDocument()
fireEvent.click(screen.getByRole('button', { name: '16:9 宽屏 电影宽屏' }))
expect(screen.queryByText('选择画布比例')).toBeNull()
expect(screen.getByRole('button', { name: '画布比例 16:9 宽屏 电影宽屏' })).toBeInTheDocument()
```

并保留质量区域仅显示 `1K/2K/4K` 的断言。

- [ ] **Step 2: Run test to verify it fails**

Run: `cd wap && npm run test -- --run src/components/generate.image-notice.test.tsx`
Expected: FAIL，因为当前仍是原生 `select`，没有底部抽屉与卡片项。

- [ ] **Step 3: Write minimal implementation**

在 `wap/src/components/views/Generate.tsx` 中：

```tsx
const [isAspectRatioSheetOpen, setIsAspectRatioSheetOpen] = useState(false)
const activeRatioOption = IMAGE_RATIO_OPTIONS.find((option) => option.ratio === activeAspectRatio) ?? IMAGE_RATIO_OPTIONS[0]
```

使用 `Sheet`、`SheetContent`、`SheetHeader`、`SheetTitle` 包裹单列卡片列表，触发器与列表项都展示缩略预览、名称、场景说明。

- [ ] **Step 4: Run test to verify it passes**

Run: `cd wap && npm run test -- --run src/components/generate.image-notice.test.tsx`
Expected: PASS

### Task 2: 回归比例映射与质量显示

**Files:**
- Test: `wap/src/features/image/options.test.ts`

- [ ] **Step 1: Run mapping test**

Run: `cd wap && npm run test -- --run src/features/image/options.test.ts`
Expected: PASS

- [ ] **Step 2: Run combined suites**

Run: `cd wap && npm run test -- --run src/components/generate.image-notice.test.tsx src/features/image/options.test.ts`
Expected: PASS
