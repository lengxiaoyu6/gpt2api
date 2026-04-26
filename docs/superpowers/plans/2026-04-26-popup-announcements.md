# Popup Announcements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增加后台多条公告维护，并在 Web 个人中心与 WAP 首页展示未读弹窗和公告列表。

**Architecture:** 后端新增 `announcement` 包与 `announcements` 表，后台接口负责公告维护，公开接口返回启用公告。Web 与 WAP 通过统一公开接口读取公告，按本地缓存记录已读 ID。

**Tech Stack:** Go, Gin, MySQL, Vue 3, Element Plus, React, Zustand, Vitest, node:test

---

### Task 1: 后端公告模型与服务

**Files:**

Create: `internal/announcement/model.go`
Create: `internal/announcement/service.go`
Create: `internal/announcement/service_test.go`
Create: `sql/migrations/20260426000004_announcements.sql`

- [x] 编写服务层失败测试，覆盖启用过滤、排序、输入校验。
- [x] 增加公告模型、存储接口、服务实现。
- [x] 增加 Goose 迁移创建 `announcements` 表。
- [x] 运行 `go test ./internal/announcement -v`。

### Task 2: 后端 DAO、Handler 与路由

**Files:**

Create: `internal/announcement/dao.go`
Create: `internal/announcement/handler.go`
Modify: `cmd/server/main.go`
Modify: `internal/server/router.go`
Modify: `internal/rbac/menu.go`
Create: `web/tests/announcements.node.test.mjs`

- [x] 编写静态失败测试，覆盖路由、菜单、API 封装和前端挂载点。
- [x] 增加 DAO 与 Handler。
- [x] 在 main 依赖注入公告 handler。
- [x] 注册后台接口和公开接口。
- [x] 增加后台菜单项。
- [x] 运行 `go test ./...` 与 `cd web && node --test tests/announcements.node.test.mjs`。

### Task 3: Web 管理端与个人中心弹窗

**Files:**

Create: `web/src/api/announcement.ts`
Create: `web/src/components/AnnouncementCenter.vue`
Create: `web/src/views/admin/Announcements.vue`
Modify: `web/src/router/index.ts`
Modify: `web/src/layouts/BasicLayout.vue`

- [x] 增加 Web API 封装。
- [x] 增加个人中心公告弹窗组件。
- [x] 增加后台公告管理页。
- [x] 在个人中心布局挂载公告组件。
- [x] 增加后台路由。
- [x] 运行 `cd web && node --test tests/announcements.node.test.mjs` 与 `cd web && npm run build`。

### Task 4: WAP 首页公告

**Files:**

Create: `wap/src/api/announcement.ts`
Create: `wap/src/components/AnnouncementCenter.tsx`
Modify: `wap/src/App.tsx`
Create: `wap/src/components/announcement-center.test.tsx`

- [x] 增加 WAP API 封装。
- [x] 增加 WAP 公告弹窗与列表组件。
- [x] 在首页标签挂载公告组件。
- [x] 编写组件测试覆盖未读弹窗、已读缓存、公告列表入口。
- [x] 运行 `cd wap && npm run test -- --run src/components/announcement-center.test.tsx` 与 `cd wap && npm run build`。

### Task 5: 全量验证

**Files:** 上述全部文件。

- [x] 运行 `git diff --check`。
- [x] 运行 `go test ./...`。
- [x] 运行 `cd web && npm run build`。
- [x] 运行 `cd wap && npm run build`。
