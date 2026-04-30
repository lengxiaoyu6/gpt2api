# Admin 用户列表注册时间展示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 admin 用户列表中新增注册时间列，展示用户创建时间。

**Architecture:** 保持后端接口不变，复用用户列表现有 `created_at` 字段，仅调整 `admin/src/views/admin/Users.vue` 的表格结构。先补前端源码测试验证列存在且使用 `formatDateTime(row.created_at)`，再进行最小实现并执行构建验证。

**Tech Stack:** Vue 3、TypeScript、Element Plus、Node.js test runner、Vite

---

### Task 1: 为用户列表补注册时间展示测试与实现

**Files:**
Create: `admin/tests/admin-users-register-time.node.test.mjs`
Modify: `admin/src/views/admin/Users.vue`
Test: `admin/tests/admin-users-register-time.node.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

test('admin 用户列表展示注册时间列', () => {
  const pageVue = read('admin/src/views/admin/Users.vue')
  assert.match(pageVue, /<el-table-column label="注册时间"/)
  assert.match(pageVue, /formatDateTime\(row\.created_at\)/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd admin && node --test tests/admin-users-register-time.node.test.mjs`
Expected: FAIL，提示找不到“注册时间”列或 `formatDateTime(row.created_at)`。

- [ ] **Step 3: Write minimal implementation**

```vue
<el-table-column label="注册时间" min-width="160">
  <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
</el-table-column>
```

插入位置：`admin/src/views/admin/Users.vue` 的“余额 / 冻结”列与“最近登录”列之间。

- [ ] **Step 4: Run test to verify it passes**

Run: `cd admin && node --test tests/admin-users-register-time.node.test.mjs`
Expected: PASS

- [ ] **Step 5: Run build verification**

Run: `cd admin && npm run build`
Expected: 构建成功，`vue-tsc --noEmit && vite build` 通过。
