# WAP Home Footer Site Name Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `wap` 首页底部版权文案使用 `site.name`，与页面标题来源保持一致。

**Architecture:** 继续由 `App.tsx` 统一读取 `siteInfo['site.name']`，再通过属性传递给 `HomeView`。`HomeView` 保持展示职责，只替换底部版权的文本来源，不引入新的全局依赖。

**Tech Stack:** React 19、TypeScript、Vitest、Testing Library、Tailwind CSS

---

### Task 1: 写出首页版权回归测试

**Files:**
Modify: `wap/src/components/app.integration.test.tsx`
Test: `cd wap && npm run test -- --run src/components/app.integration.test.tsx`

- [ ] **Step 1: 新增首页底部版权跟随站点名称的回归断言**

```tsx
test('home footer uses site name from site info', () => {
  useStore.setState({
    siteInfo: {
      'site.name': '星河图像',
      'site.description': 'AI 创作平台',
      'site.logo_url': '',
      'site.footer': '',
      'auth.allow_register': 'true',
    },
    bootstrapApp: vi.fn().mockResolvedValue(undefined),
  })

  render(<App />)

  expect(screen.getAllByText('星河图像')).toHaveLength(2)
  expect(screen.getByText('© 星河图像')).toBeInTheDocument()
  expect(screen.queryByText('GPT2API • Creative Studio')).toBeNull()
})
```

- [ ] **Step 2: 运行集成测试并确认失败原因准确**

Run: `cd wap && npm run test -- --run src/components/app.integration.test.tsx`
Expected: FAIL，断言指向首页底部版权仍为写死的 `GPT2API` 文案或 `HomeView` 缺少基于 `siteName` 的渲染。

### Task 2: 修改首页版权文本来源

**Files:**
Modify: `wap/src/App.tsx`
Modify: `wap/src/components/views/Home.tsx`
Test: `cd wap && npm run test -- --run src/components/app.integration.test.tsx`

- [ ] **Step 1: 为 `HomeView` 增加 `siteName` 属性并在 `App.tsx` 传入该值**

```tsx
interface HomeViewProps {
  onStartGeneration: () => void;
  siteName: string;
}
```

```tsx
{activeTab === 'home' && <HomeView siteName={siteName} onStartGeneration={() => handleTabChange('generate')} />}
```

- [ ] **Step 2: 将首页底部版权替换为 `site.name` 文案**

```tsx
<div className="text-center pb-8 opacity-50 space-y-1">
  <p className="text-[10px] font-medium tracking-widest uppercase">{siteName}</p>
  <p className="text-[8px]">© {siteName}</p>
</div>
```

- [ ] **Step 3: 运行集成测试并确认回归断言通过**

Run: `cd wap && npm run test -- --run src/components/app.integration.test.tsx`
Expected: PASS，首页版权与现有生成页断言全部通过。

### Task 3: 完整校验与改动核对

**Files:**
Modify: `wap/src/App.tsx`
Modify: `wap/src/components/views/Home.tsx`
Modify: `wap/src/components/app.integration.test.tsx`
Create: `docs/superpowers/specs/2026-04-22-wap-home-footer-site-name-design.md`
Create: `docs/superpowers/plans/2026-04-22-wap-home-footer-site-name.md`

- [ ] **Step 1: 运行 `wap` 全量测试**

Run: `cd wap && npm run test -- --run`
Expected: PASS，全部 Vitest 用例通过。

- [ ] **Step 2: 运行类型检查与构建**

Run: `cd wap && npm run lint && npm run build`
Expected: exit 0，TypeScript 检查与 Vite 构建成功。

- [ ] **Step 3: 核对改动范围**

Run: `git diff -- wap/src/App.tsx wap/src/components/views/Home.tsx wap/src/components/app.integration.test.tsx docs/superpowers/specs/2026-04-22-wap-home-footer-site-name-design.md docs/superpowers/plans/2026-04-22-wap-home-footer-site-name.md`
Expected: diff 仅包含首页底部版权文本来源调整、属性传递、回归测试与文档文件。
