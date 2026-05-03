# Prompt 分类管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 admin 端 Prompt 库增加独立分类管理，并将 Prompt 分类输入改为从分类列表中选择。

**Architecture:** 新增 `prompt_library_categories` 表作为分类主数据，Prompt 记录继续保存分类名称字符串；删除分类时在服务端事务中把关联 Prompt 迁移到“通用”；admin 页面在现有 Prompt 管理页中内嵌分类维护区，并统一使用分类下拉选择。

**Tech Stack:** Go、Gin、sqlx、MySQL、Vue 3、Element Plus、Vitest、Node test

---

### Task 1: 数据库迁移与迁移测试

**Files:**
Create: `sql/migrations/20260503000005_prompt_library_categories.sql`
Modify: `internal/promptlib/migration_test.go`

- [ ] Step 1: 写迁移测试断言，检查分类表创建、默认“通用”、历史分类回填与 Down 语句。
- [ ] Step 2: 运行 `go test ./internal/promptlib -run TestPromptLibrary.*Migration -count=1`，确认新增断言先失败。
- [ ] Step 3: 编写迁移 SQL。
- [ ] Step 4: 再次运行 `go test ./internal/promptlib -run TestPromptLibrary.*Migration -count=1`，确认通过。

### Task 2: 后端分类服务与服务层测试

**Files:**
Modify: `internal/promptlib/model.go`
Modify: `internal/promptlib/service.go`
Modify: `internal/promptlib/dao.go`
Modify: `internal/promptlib/handler.go`
Modify: `internal/promptlib/service_test.go`
Modify: `internal/server/router.go`

- [ ] Step 1: 先补服务层测试，覆盖分类创建、重名、删除迁移、删除“通用”失败、Prompt 保存时分类不存在失败。
- [ ] Step 2: 运行 `go test ./internal/promptlib -run 'TestService(Category|Prompt)' -count=1`，确认红灯。
- [ ] Step 3: 扩展 model、service、dao、handler、router，实现分类管理接口与 Prompt 分类校验。
- [ ] Step 4: 运行 `go test ./internal/promptlib ./internal/server -count=1`，确认通过。

### Task 3: admin 接口与页面静态测试

**Files:**
Modify: `admin/tests/prompt-library.node.test.mjs`
Modify: `admin/src/api/prompt.ts`
Modify: `admin/src/views/admin/Prompts.vue`

- [ ] Step 1: 先补 node 静态测试，检查分类接口、分类管理区、分类选择器与删除迁移提示。
- [ ] Step 2: 运行 `node --test tests/prompt-library.node.test.mjs`，确认新增断言先失败。
- [ ] Step 3: 修改 admin API 与 Prompt 管理页，实现分类增删、分类列表加载、表单与筛选改为下拉选择。
- [ ] Step 4: 再次运行 `node --test tests/prompt-library.node.test.mjs`，确认通过。

### Task 4: 综合回归验证

**Files:**
No direct file changes expected.

- [ ] Step 1: 运行 `go test ./internal/promptlib ./internal/image ./internal/gateway -count=1`。
- [ ] Step 2: 运行 `cd admin && node --test tests/prompt-library.node.test.mjs tests/admin-image-tasks-preview.node.test.mjs`。
- [ ] Step 3: 记录变更点与验证结果。
