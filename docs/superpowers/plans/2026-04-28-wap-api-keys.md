# WAP API Keys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 WAP 端个人中心补齐 API Keys 的列表、新建、启用与禁用、删除、明文 Key 单次展示能力。

**Architecture:** 在个人中心内部新增 `apiKeys` 二级页面，使用独立的 `ProfileApiKeys` 组件承载列表与弹窗交互；新增 `wap/src/api/apikey.ts` 统一封装后端 `/api/keys` 接口；测试覆盖入口导航、列表、新建、更新与删除。

**Tech Stack:** React、TypeScript、Vitest、Testing Library、Axios、现有 WAP UI 组件。

---

### Task 1: API Keys 页面入口测试

**Files:**
Create: 无
Modify: `wap/src/components/app.integration.test.tsx`
Test: `wap/src/components/app.integration.test.tsx`

- [ ] **Step 1: 写失败测试**

在 `profile menu entries` 附近新增断言，验证个人中心存在 `API Keys` 菜单项。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd wap && npm test -- src/components/app.integration.test.tsx -t "profile renders api keys menu entry"`
Expected: FAIL，提示页面未出现 `API Keys`。

- [ ] **Step 3: 最小实现**

在 `Profile.tsx` 的 `menuItems` 中增加 `API Keys` 项。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd wap && npm test -- src/components/app.integration.test.tsx -t "profile renders api keys menu entry"`
Expected: PASS

### Task 2: API 模块与子页面导航测试

**Files:**
Create: `wap/src/api/apikey.ts`
Create: `wap/src/components/views/ProfileApiKeys.tsx`
Modify: `wap/src/components/views/Profile.tsx`
Modify: `wap/src/components/backend-binding.test.tsx`
Test: `wap/src/components/backend-binding.test.tsx`

- [ ] **Step 1: 写失败测试**

新增测试：点击 `API Keys` 后进入二级页面，并能通过返回按钮回到个人中心。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd wap && npm test -- src/components/backend-binding.test.tsx -t "profile api keys page can open and return"`
Expected: FAIL，提示未找到页面标题或返回按钮。

- [ ] **Step 3: 最小实现**

实现 `ProfileApiKeys.tsx` 基础骨架，提供标题、说明、返回按钮与空态；在 `Profile.tsx` 扩展 `activeSection` 分支并接入该组件。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd wap && npm test -- src/components/backend-binding.test.tsx -t "profile api keys page can open and return"`
Expected: PASS

### Task 3: 列表加载与空态测试

**Files:**
Create: `wap/src/api/apikey.ts`
Modify: `wap/src/components/views/ProfileApiKeys.tsx`
Modify: `wap/src/components/backend-binding.test.tsx`
Test: `wap/src/components/backend-binding.test.tsx`

- [ ] **Step 1: 写失败测试**

新增两条测试：

一条验证空列表时显示“还没有 API Key”。

一条验证接口返回后正确渲染名称、前缀、状态、额度、RPM、TPM、允许模型、IP 白名单、最近使用、创建时间。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd wap && npm test -- src/components/backend-binding.test.tsx -t "profile api keys"`
Expected: FAIL，提示未调用接口或缺少字段渲染。

- [ ] **Step 3: 最小实现**

在 `wap/src/api/apikey.ts` 中实现 `listKeys`。

在 `ProfileApiKeys.tsx` 中实现首屏加载、空态、卡片列表和字段格式化。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd wap && npm test -- src/components/backend-binding.test.tsx -t "profile api keys"`
Expected: PASS

### Task 4: 新建与明文 Key 展示测试

**Files:**
Modify: `wap/src/components/views/ProfileApiKeys.tsx`
Modify: `wap/src/components/backend-binding.test.tsx`
Test: `wap/src/components/backend-binding.test.tsx`

- [ ] **Step 1: 写失败测试**

新增测试，验证：

点击“新建 Key”打开弹窗。

填写完整字段后提交，`createKey` 收到拆分后的 `allowed_models` 与 `allowed_ips`。

创建成功后展示明文 Key 弹窗。

点击复制按钮会调用剪贴板接口。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd wap && npm test -- src/components/backend-binding.test.tsx -t "profile api keys creates key and shows plaintext key once"`
Expected: FAIL

- [ ] **Step 3: 最小实现**

实现创建弹窗、字段受控状态、`createKey` 请求、成功后弹出明文 Key 对话框、复制逻辑。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd wap && npm test -- src/components/backend-binding.test.tsx -t "profile api keys creates key and shows plaintext key once"`
Expected: PASS

### Task 5: 启用与禁用、删除确认测试

**Files:**
Modify: `wap/src/components/views/ProfileApiKeys.tsx`
Modify: `wap/src/components/backend-binding.test.tsx`
Test: `wap/src/components/backend-binding.test.tsx`

- [ ] **Step 1: 写失败测试**

新增测试，验证：

点击“禁用”或“启用”会调用 `updateKey` 并刷新列表。

点击“删除”打开确认弹窗，确认后调用 `deleteKey` 并刷新列表。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd wap && npm test -- src/components/backend-binding.test.tsx -t "profile api keys updates status and deletes key"`
Expected: FAIL

- [ ] **Step 3: 最小实现**

实现状态切换、删除确认弹窗、删除提交与列表刷新。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd wap && npm test -- src/components/backend-binding.test.tsx -t "profile api keys updates status and deletes key"`
Expected: PASS

### Task 6: 加载更多与回页逻辑测试

**Files:**
Modify: `wap/src/components/views/ProfileApiKeys.tsx`
Modify: `wap/src/components/backend-binding.test.tsx`
Test: `wap/src/components/backend-binding.test.tsx`

- [ ] **Step 1: 写失败测试**

新增测试，验证总数大于当前列表时显示“加载更多”，点击后拉取下一页并追加数据。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd wap && npm test -- src/components/backend-binding.test.tsx -t "profile api keys loads more results"`
Expected: FAIL

- [ ] **Step 3: 最小实现**

实现累计列表、页码推进与“加载更多”按钮状态。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd wap && npm test -- src/components/backend-binding.test.tsx -t "profile api keys loads more results"`
Expected: PASS

### Task 7: 回归验证

**Files:**
Modify: `wap/src/components/views/Profile.tsx`
Modify: `wap/src/components/views/ProfileApiKeys.tsx`
Modify: `wap/src/components/backend-binding.test.tsx`
Modify: `wap/src/components/app.integration.test.tsx`
Test: `wap/src/components/backend-binding.test.tsx`
Test: `wap/src/components/app.integration.test.tsx`

- [ ] **Step 1: 运行 API Keys 相关测试**

Run: `cd wap && npm test -- src/components/backend-binding.test.tsx src/components/app.integration.test.tsx`
Expected: PASS

- [ ] **Step 2: 如有失败，最小范围修正**

仅修正与 API Keys 页面接入有关的断言、文案或状态流。

- [ ] **Step 3: 再次运行测试**

Run: `cd wap && npm test -- src/components/backend-binding.test.tsx src/components/app.integration.test.tsx`
Expected: PASS
