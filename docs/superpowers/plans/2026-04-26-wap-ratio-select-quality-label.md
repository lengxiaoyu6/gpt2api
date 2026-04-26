# WAP Ratio Select And Quality Label Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 WAP 生图页的画布比例改为下拉选择，并让输出质量仅显示质量档位。

**Architecture:** 仅修改 WAP 生成页组件与对应交互测试。比例映射与提交参数逻辑继续复用 `wap/src/features/image/options.ts` 现有实现，避免影响尺寸换算与计费行为。

**Tech Stack:** React, TypeScript, Vitest, Testing Library, Tailwind CSS

---

### Task 1: 调整测试描述新交互

**Files:**
- Modify: `wap/src/components/generate.image-notice.test.tsx`
- Test: `wap/src/components/generate.image-notice.test.tsx`

- [ ] **Step 1: Write the failing test**

将现有“输出质量与实际尺寸”测试改为断言：

```ts
expect(screen.getByLabelText('画布比例')).toBeInTheDocument()
expect(screen.getByRole('option', { name: '1:1 方形' })).toBeInTheDocument()
expect(screen.getByRole('button', { name: '1K' })).toBeInTheDocument()
expect(screen.queryByText('1024x1024')).toBeNull()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd wap && npm run test -- --run src/components/generate.image-notice.test.tsx`
Expected: FAIL，因为当前页面仍是比例按钮网格，且质量按钮仍显示分辨率。

- [ ] **Step 3: Write minimal implementation**

在 `wap/src/components/views/Generate.tsx` 中：

```tsx
<select aria-label="画布比例" value={activeAspectRatio} onChange={...}>
  {IMAGE_RATIO_OPTIONS.map((option) => (
    <option key={option.ratio} value={option.ratio}>
      {option.ratio} {option.label}
    </option>
  ))}
</select>
```

并将质量按钮内容收敛为：

```tsx
<span className="block text-[11px] font-bold">{option.label}</span>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd wap && npm run test -- --run src/components/generate.image-notice.test.tsx`
Expected: PASS

### Task 2: 回归图片选项映射

**Files:**
- Test: `wap/src/features/image/options.test.ts`

- [ ] **Step 1: Run existing mapping test**

Run: `cd wap && npm run test -- --run src/features/image/options.test.ts`
Expected: PASS

- [ ] **Step 2: Run both related suites together**

Run: `cd wap && npm run test -- --run src/components/generate.image-notice.test.tsx src/features/image/options.test.ts`
Expected: PASS
