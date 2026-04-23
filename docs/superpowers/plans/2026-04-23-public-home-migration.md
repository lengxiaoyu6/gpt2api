# Public Home Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Web 端新增参考站点风格的公开营销首页与配套公开页面，并保留现有登录注册与控制台流程。

**Architecture:** 使用独立公开营销布局承载首页、案例页、定价页、登录页、注册页，控制台仍保留现有 `BasicLayout`。先以静态源码测试锁定路由与页面结构，再迁移展示层并接入现有认证接口。

**Tech Stack:** Vue 3, Vue Router, Pinia, Element Plus, node:test, SCSS

---

### Task 1: 公开营销路由测试

**Files:**
Create: `web/tests/public-home.node.test.mjs`
Modify: `web/tests/auth-pages.node.test.mjs`
Test: `cd web && node --test tests/public-home.node.test.mjs tests/auth-pages.node.test.mjs`

- [ ] **Step 1: 编写失败测试**
- [ ] **Step 2: 运行测试确认失败**
- [ ] **Step 3: 修改源码使测试通过**
- [ ] **Step 4: 重新运行测试确认通过**

### Task 2: 新增营销布局与公开页面

**Files:**
Create: `web/src/layouts/PublicLayout.vue`
Create: `web/src/views/public/Home.vue`
Create: `web/src/views/public/Showcase.vue`
Create: `web/src/views/public/Pricing.vue`
Modify: `web/src/views/auth/Login.vue`
Modify: `web/src/views/auth/Register.vue`
Modify: `web/src/router/index.ts`
Test: `cd web && node --test tests/public-home.node.test.mjs tests/auth-pages.node.test.mjs`

- [ ] **Step 1: 新增布局与共享视觉样式**
- [ ] **Step 2: 迁移首页、案例页、定价页结构**
- [ ] **Step 3: 调整登录注册页为营销风格并保留现有提交逻辑**
- [ ] **Step 4: 调整公开路由**
- [ ] **Step 5: 运行静态测试确认通过**

### Task 3: 构建验证

**Files:**
Modify: `web/src/layouts/PublicLayout.vue`
Modify: `web/src/views/public/Home.vue`
Modify: `web/src/views/public/Showcase.vue`
Modify: `web/src/views/public/Pricing.vue`
Modify: `web/src/views/auth/Login.vue`
Modify: `web/src/views/auth/Register.vue`
Modify: `web/src/router/index.ts`

- [ ] **Step 1: 运行 `cd web && npm run build`**
- [ ] **Step 2: 修正编译问题并重跑构建**
- [ ] **Step 3: 输出最终变更摘要**
