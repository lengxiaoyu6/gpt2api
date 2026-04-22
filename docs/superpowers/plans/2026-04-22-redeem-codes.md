# Redeem Codes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为后台增加兑换码生成功能，并允许用户通过兑换码为当前账号充值积分。

**Architecture:** 后端新增兑换码数据表、管理员生成与查询接口、用户核销接口，并复用现有积分账变服务写入余额与流水。前端在后台新增兑换码管理页，在用户充值页新增兑换入口，所有展示继续沿用现有管理台与用户中心风格。

**Tech Stack:** Go, Gin, GORM, Vue 3, Element Plus, Vitest, node:test

---

### Task 1: 后端兑换码领域模型与失败测试

**Files:**
Create: `internal/redeem/model.go`
Create: `internal/redeem/service.go`
Create: `internal/redeem/service_test.go`
Modify: `internal/model/models.go`

- [ ] **Step 1: 编写后端失败测试**
- [ ] **Step 2: 运行 `go test ./internal/redeem -v` 确认失败**
- [ ] **Step 3: 实现最小模型与服务逻辑**
- [ ] **Step 4: 再次运行 `go test ./internal/redeem -v` 确认通过**

### Task 2: 管理员接口与用户核销接口

**Files:**
Create: `internal/redeem/admin_handler.go`
Create: `internal/redeem/user_handler.go`
Modify: `internal/router/router.go`
Modify: `internal/credits/service.go`
Test: `go test ./internal/redeem -v`

- [ ] **Step 1: 先补接口层失败测试**
- [ ] **Step 2: 运行定向测试确认失败**
- [ ] **Step 3: 实现管理员生成、列表、作废与用户核销接口**
- [ ] **Step 4: 运行定向测试确认通过**

### Task 3: 后台与用户前端页面

**Files:**
Modify: `web/src/api/admin.ts`
Modify: `web/src/api/recharge.ts`
Modify: `web/src/router/index.ts`
Create: `web/src/views/admin/RedeemCodes.vue`
Modify: `web/src/views/admin/AdminLayout.vue`
Modify: `web/src/views/personal/Billing.vue`
Test: `cd web && node --test ...`

- [ ] **Step 1: 先补前端静态或组件失败测试**
- [ ] **Step 2: 运行前端测试确认失败**
- [ ] **Step 3: 实现后台兑换码页与用户兑换入口**
- [ ] **Step 4: 运行前端测试确认通过**

### Task 4: 整体验证

**Files:**
Modify: 上述全部文件

- [ ] **Step 1: 运行 `go test ./internal/redeem -v ./internal/credits -v` 或等效定向验证**
- [ ] **Step 2: 运行 Web 定向测试**
- [ ] **Step 3: 运行相关回归测试并确认通过**
