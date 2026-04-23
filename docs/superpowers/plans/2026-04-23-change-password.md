# 用户自主修改密码 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为当前登录用户增加修改密码能力，要求校验原密码，并在 `web` 与 `wap` 端于修改成功后立即清理当前登录态并回到认证入口。

**Architecture:** 后端增加 `POST /api/me/change-password`，复用现有 `PasswordService` 做原密码校验与新哈希生成。`web` 通过新增“安全中心”页面提交接口并回到 `/login`；`wap` 通过个人中心中的安全中心弹层提交接口，并通过 store 集中执行重新登录状态切换。

**Tech Stack:** Go, Gin, sqlx, Vue 3, Pinia, Element Plus, React, Zustand, Vitest, Node test

---

## 文件结构

### 新增文件

`docs/superpowers/specs/2026-04-23-change-password-design.md`
记录本次设计。

`web/src/views/personal/Security.vue`
承载 `web` 安全中心页面。

`web/tests/change-password.node.test.mjs`
承载 `web` 静态断言。

### 修改文件

`cmd/server/main.go`
为普通用户 `Handler` 注入密码服务。

`internal/auth/service.go`
统一密码长度校验逻辑。

`internal/rbac/menu.go`
补充个人中心“安全中心”菜单。

`internal/server/router.go`
注册 `POST /api/me/change-password`。

`internal/user/handler.go`
实现修改密码接口。

`internal/user/admin_handler.go`
复用 `PasswordService` 接口给普通用户 handler。

`web/src/api/me.ts`
增加修改密码请求封装。

`web/src/router/index.ts`
增加安全中心静态路由。

`wap/src/api/me.ts`
增加修改密码请求封装。

`wap/src/store/useStore.ts`
增加重新登录动作。

`wap/src/store/useStore.test.ts`
补充 store 行为测试。

`wap/src/components/views/Profile.tsx`
增加安全中心弹层与成功后重新登录。

`wap/src/components/backend-binding.test.tsx`
补充组件行为测试。

### 测试文件

`internal/auth/service_test.go`

`internal/rbac/menu_test.go`

`internal/user/handler_test.go`

`web/tests/change-password.node.test.mjs`

`wap/src/store/useStore.test.ts`

`wap/src/components/backend-binding.test.tsx`

## Task 1: 后端测试先行

**Files:**
Create: `internal/auth/service_test.go`
Create: `internal/rbac/menu_test.go`
Create: `internal/user/handler_test.go`
Test: `go test ./internal/auth ./internal/rbac ./internal/user`

- [ ] **Step 1: 为密码最小长度和安全中心菜单写失败测试**
- [ ] **Step 2: 为 ChangePassword 的原密码错误、重复密码、成功路径写失败测试**
- [ ] **Step 3: 运行 `go test ./internal/auth ./internal/rbac ./internal/user` 并确认失败点指向缺失实现**

## Task 2: 实现后端接口

**Files:**
Modify: `internal/auth/service.go`
Modify: `internal/user/handler.go`
Modify: `internal/server/router.go`
Modify: `internal/rbac/menu.go`
Modify: `cmd/server/main.go`
Test: `go test ./internal/auth ./internal/rbac ./internal/user`

- [ ] **Step 1: 让 `HashPassword` 读取动态密码最小长度**
- [ ] **Step 2: 在 `user.Handler` 中注入 `PasswordService` 并实现 `ChangePassword`**
- [ ] **Step 3: 注册 `POST /api/me/change-password` 并加入“安全中心”菜单**
- [ ] **Step 4: 运行 `go test ./internal/auth ./internal/rbac ./internal/user` 确认通过**

## Task 3: Web 测试先行并实现

**Files:**
Create: `web/tests/change-password.node.test.mjs`
Modify: `web/src/api/me.ts`
Modify: `web/src/router/index.ts`
Create: `web/src/views/personal/Security.vue`
Test: `cd web && node --test tests/change-password.node.test.mjs`

- [ ] **Step 1: 写静态断言，覆盖 API、路由、菜单与页面关键行为**
- [ ] **Step 2: 运行 `cd web && node --test tests/change-password.node.test.mjs` 并确认失败**
- [ ] **Step 3: 实现 `changeMyPassword`、安全中心路由与页面**
- [ ] **Step 4: 再次运行 `cd web && node --test tests/change-password.node.test.mjs` 确认通过**

## Task 4: WAP 测试先行并实现

**Files:**
Modify: `wap/src/store/useStore.test.ts`
Modify: `wap/src/components/backend-binding.test.tsx`
Modify: `wap/src/api/me.ts`
Modify: `wap/src/store/useStore.ts`
Modify: `wap/src/components/views/Profile.tsx`
Test: `cd wap && npm run test -- --run src/store/useStore.test.ts src/components/backend-binding.test.tsx`

- [ ] **Step 1: 先为 `forceRelogin` 与安全中心弹层写失败测试**
- [ ] **Step 2: 运行 `cd wap && npm run test -- --run src/store/useStore.test.ts src/components/backend-binding.test.tsx` 并确认失败**
- [ ] **Step 3: 实现 API、store 与 Profile 弹层逻辑**
- [ ] **Step 4: 再次运行同一组测试并确认通过**

## Task 5: 汇总验证

**Files:**
Modify: 上述全部文件
Test: `go test ./internal/auth ./internal/rbac ./internal/user && cd web && node --test tests/change-password.node.test.mjs && cd ../wap && npm run test -- --run src/store/useStore.test.ts src/components/backend-binding.test.tsx`

- [ ] **Step 1: 运行后端测试**
- [ ] **Step 2: 运行 `web` 静态测试**
- [ ] **Step 3: 运行 `wap` 测试**
- [ ] **Step 4: 检查差异文件仅包含本次需求相关内容**
