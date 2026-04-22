# WAP Generate Contrast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正 `wap` 生成页深色模式下比例选中态副文字与“开始创作”按钮文字的对比度，并保持当前页面结构与视觉层级。

**Architecture:** 继续沿用现有主题变量与 `Button` 组件的语义色体系，只修改 `Generate` 页面里写死的 `text-white` 类名与相关透明度。测试维持 `app.integration.test.tsx` 的集成回归方式，围绕默认选中比例项和主按钮增加类名断言，确保后续样式回退时能够被及时发现。

**Tech Stack:** React 19、TypeScript、Tailwind CSS、shadcn Button、Vitest、Testing Library

---

### Task 1: 写出可读性回归测试

**Files:**
Modify: `wap/src/components/app.integration.test.tsx`
Test: `cd wap && npm run test -- --run src/components/app.integration.test.tsx`

- [ ] **Step 1: 在生成页现有测试中加入主按钮与比例副文字的类名断言**

```tsx
test('generate page keeps pricing copy and semantic foreground colors', () => {
  useStore.setState({
    user: {
      id: 1,
      email: 'demo@example.com',
      nickname: 'Demo',
      role: 'user',
      status: 'active',
      group_id: 1,
      credit_balance: 2300,
      credit_frozen: 0,
    },
    imageModels: [{ id: 1, slug: 'gpt-image-1', type: 'image', description: 'img', image_price_per_call: 1500 }],
    selectedImageModel: 'gpt-image-1',
  })

  render(<GenerateView />)

  expect(screen.queryByText('极致优化')).toBeNull()
  expect(screen.getByText('每次生成消耗 0.15 积分')).toBeInTheDocument()

  const createButton = screen.getByRole('button', { name: '开始创作' })
  expect(createButton.className).not.toContain('text-white')

  const ratioDesc = screen.getByText('社交媒体')
  expect(ratioDesc.className).not.toContain('text-white')
})
```

- [ ] **Step 2: 运行单个集成测试并确认失败位置准确**

Run: `cd wap && npm run test -- --run src/components/app.integration.test.tsx`
Expected: FAIL，断言指向 `Generate.tsx` 中按钮或比例副文字仍包含 `text-white`。

### Task 2: 修正 Generate 页面语义色使用

**Files:**
Modify: `wap/src/components/views/Generate.tsx`
Test: `cd wap && npm run test -- --run src/components/app.integration.test.tsx`

- [ ] **Step 1: 调整比例副文字类名，让选中态继承语义前景色并提高轻度透明度**

```tsx
<span
  className={`text-[8px] mt-0.5 ${
    aspectRatio === r.value ? 'opacity-70' : 'opacity-60 text-muted-foreground'
  }`}
>
  {r.desc}
</span>
```

保留父级选中态：

```tsx
aspectRatio === r.value
  ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20'
  : 'bg-background/50 border-border/50 hover:border-primary/30'
```

- [ ] **Step 2: 调整“开始创作”按钮文字颜色，改回主题前景语义色**

```tsx
<Button
  className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-black text-lg shadow-xl shadow-primary/25 disabled:opacity-50"
  onClick={handleGenerate}
  disabled={isGenerating}
>
```

- [ ] **Step 3: 运行生成页集成测试并确认回归断言转绿**

Run: `cd wap && npm run test -- --run src/components/app.integration.test.tsx`
Expected: PASS，生成页文案断言与类名断言全部通过。

- [ ] **Step 4: 记录当前实现提交点**

```bash
git add wap/src/components/views/Generate.tsx wap/src/components/app.integration.test.tsx docs/superpowers/specs/2026-04-22-wap-generate-contrast-design.md docs/superpowers/plans/2026-04-22-wap-generate-contrast.md
git commit -m "fix: restore wap generate contrast"
```

### Task 3: 完整校验与改动核对

**Files:**
Modify: `wap/src/components/app.integration.test.tsx`
Modify: `wap/src/components/views/Generate.tsx`
Create: `docs/superpowers/plans/2026-04-22-wap-generate-contrast.md`

- [ ] **Step 1: 运行 `wap` 全量测试**

Run: `cd wap && npm run test -- --run`
Expected: PASS，全部 Vitest 用例通过。

- [ ] **Step 2: 运行类型检查与构建**

Run: `cd wap && npm run lint && npm run build`
Expected: exit 0，TypeScript 检查与 Vite 构建成功。

- [ ] **Step 3: 核对改动范围只包含设计约定内的文件与样式类名**

Run: `git diff -- wap/src/components/views/Generate.tsx wap/src/components/app.integration.test.tsx docs/superpowers/specs/2026-04-22-wap-generate-contrast-design.md docs/superpowers/plans/2026-04-22-wap-generate-contrast.md`
Expected: diff 仅包含比例副文字语义色修正、主按钮前景色修正、集成测试断言与文档文件。
