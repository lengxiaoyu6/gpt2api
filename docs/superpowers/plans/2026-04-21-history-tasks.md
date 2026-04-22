# 历史任务菜单拆分 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把图片任务历史从接口文档页拆出为个人中心下的独立“历史任务”菜单与页面。

**Architecture:** 后端继续作为菜单树单一来源，在 `internal/rbac/menu.go` 新增个人中心子菜单；前端在 `web/src/router/index.ts` 新增独立路由，在 `web/src/views/personal/HistoryTasks.vue` 承载原有图片任务历史列表，并从 `ApiDocs.vue` 中移除对应区块与请求逻辑。校验采用 Node 内置测试读取关键源码文件，避免在当前前端工程中额外引入测试框架。

**Tech Stack:** Go、Vue 3、TypeScript、Vite、Element Plus、Node.js `--test`

---

### Task 1: 为菜单与路由新增回归校验，再补齐最小实现

**Files:**
- Create: `web/tests/history-tasks.node.test.mjs`
- Modify: `internal/rbac/menu.go`
- Modify: `web/src/router/index.ts`
- Test: `web/tests/history-tasks.node.test.mjs`

- [ ] **Step 1: 写出失败中的菜单与路由回归测试**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

test('个人中心菜单树包含历史任务入口', () => {
  const menuGo = read('internal/rbac/menu.go')
  assert.match(menuGo, /Key:\s*"personal\.history-tasks"/)
  assert.match(menuGo, /Title:\s*"历史任务"/)
  assert.match(menuGo, /Path:\s*"\/personal\/history-tasks"/)
  assert.match(menuGo, /Perms:\s*\[]Permission\{PermSelfImage\}/)
})

test('个人中心静态路由包含历史任务页面', () => {
  const routerTs = read('web/src/router/index.ts')
  assert.match(routerTs, /path:\s*'history-tasks'/)
  assert.match(routerTs, /HistoryTasks\.vue/)
  assert.match(routerTs, /title:\s*'历史任务'/)
  assert.match(routerTs, /perm:\s*'self:image'/)
})
```

- [ ] **Step 2: 运行测试，确认按预期失败**

Run: `cd web && node --test tests/history-tasks.node.test.mjs`
Expected: FAIL，提示 `personal.history-tasks` 或 `history-tasks` 路由尚未出现。

- [ ] **Step 3: 增加后端菜单项与前端路由最小实现**

```go
// internal/rbac/menu.go
{Key: "personal.docs", Title: "接口文档", Icon: "Document", Path: "/personal/docs",
    Perms: []Permission{PermSelfUsage, PermSelfImage}},
{Key: "personal.history-tasks", Title: "历史任务", Icon: "PictureRounded", Path: "/personal/history-tasks",
    Perms: []Permission{PermSelfImage}},
```

```ts
// web/src/router/index.ts
{ path: 'docs', component: () => import('@/views/personal/ApiDocs.vue'),
  meta: { title: '接口文档', perm: ['self:usage', 'self:image'] } },
{ path: 'history-tasks', component: () => import('@/views/personal/HistoryTasks.vue'),
  meta: { title: '历史任务', perm: 'self:image' } },
```

- [ ] **Step 4: 再次运行测试，确认通过**

Run: `cd web && node --test tests/history-tasks.node.test.mjs`
Expected: PASS，菜单与路由两个测试通过。

### Task 2: 为独立历史任务页写失败测试，再迁移图片任务历史视图

**Files:**
- Modify: `web/tests/history-tasks.node.test.mjs`
- Create: `web/src/views/personal/HistoryTasks.vue`
- Test: `web/tests/history-tasks.node.test.mjs`

- [ ] **Step 1: 向回归测试加入新页面校验**

```js
test('历史任务页面复用图片任务列表能力', () => {
  const pageVue = read('web/src/views/personal/HistoryTasks.vue')
  assert.match(pageVue, /listMyImageTasks/)
  assert.match(pageVue, /<h2 class="page-title">历史任务<\/h2>/)
  assert.match(pageVue, /图片任务历史/)
  assert.match(pageVue, /imageLoadMore/)
})
```

- [ ] **Step 2: 运行测试，确认按预期失败**

Run: `cd web && node --test tests/history-tasks.node.test.mjs`
Expected: FAIL，提示 `HistoryTasks.vue` 文件不存在。

- [ ] **Step 3: 新建独立历史任务页面最小实现**

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { listMyImageTasks, type ImageTask } from '@/api/me'
import { formatCredit, formatDateTime } from '@/utils/format'

const imageTasks = ref<ImageTask[]>([])
const imagePage = ref({ limit: 12, offset: 0 })
const imageLoading = ref(false)
const hasMoreImage = ref(false)

async function loadImageTasks(reset = true) {
  imageLoading.value = true
  try {
    if (reset) {
      imagePage.value.offset = 0
      imageTasks.value = []
    }
    const data = await listMyImageTasks({
      limit: imagePage.value.limit,
      offset: imagePage.value.offset,
    })
    if (reset) imageTasks.value = data.items
    else imageTasks.value.push(...data.items)
    hasMoreImage.value = data.items.length >= imagePage.value.limit
  } finally {
    imageLoading.value = false
  }
}

function imageLoadMore() {
  imagePage.value.offset += imagePage.value.limit
  loadImageTasks(false)
}

function statusTag(s: string): 'success' | 'warning' | 'danger' | 'info' {
  if (s === 'success') return 'success'
  if (s === 'failed') return 'danger'
  if (s === 'running' || s === 'dispatched' || s === 'queued') return 'warning'
  return 'info'
}

onMounted(() => { loadImageTasks(true) })
</script>
```

```vue
<template>
  <div class="page-container">
    <div class="card-block hero">
      <div>
        <h2 class="page-title">历史任务</h2>
        <p class="desc">当前页面展示图片生成任务记录，可刷新并继续加载更多。</p>
      </div>
    </div>

    <div class="card-block">
      <div class="flex-between" style="margin-bottom: 10px">
        <h3 class="section-title">图片任务历史</h3>
        <el-button size="small" @click="loadImageTasks(true)">刷新</el-button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 4: 再次运行测试，确认通过**

Run: `cd web && node --test tests/history-tasks.node.test.mjs`
Expected: PASS，新页面相关测试通过。

### Task 3: 为接口文档页清理写失败测试，再移除旧区块

**Files:**
- Modify: `web/tests/history-tasks.node.test.mjs`
- Modify: `web/src/views/personal/ApiDocs.vue`
- Test: `web/tests/history-tasks.node.test.mjs`

- [ ] **Step 1: 向回归测试加入文档页清理断言**

```js
test('接口文档页不再内置图片任务历史', () => {
  const pageVue = read('web/src/views/personal/ApiDocs.vue')
  assert.doesNotMatch(pageVue, /图片任务历史/)
  assert.doesNotMatch(pageVue, /listMyImageTasks/)
  assert.doesNotMatch(pageVue, /type ImageTask/)
  assert.match(pageVue, /历史任务/) 
})
```

- [ ] **Step 2: 运行测试，确认按预期失败**

Run: `cd web && node --test tests/history-tasks.node.test.mjs`
Expected: FAIL，提示 `ApiDocs.vue` 仍包含图片任务历史相关文本或导入。

- [ ] **Step 3: 从接口文档页移除图片任务历史逻辑与样式，并补充菜单提示**

```ts
// web/src/views/personal/ApiDocs.vue
import {
  listMyModels,
  listMyUsageLogs,
  getMyUsageStats,
  type SimpleModel,
  type UsageItem,
  type MyStatsResp,
} from '@/api/me'
```

```vue
<p class="desc">
  <template v-if="ENABLE_CHAT_MODEL">
    外部调用走 <code>/v1/chat/completions</code> 与 <code>/v1/images/generations</code>,
  </template>
  <template v-else>
    外部调用走 <code>/v1/images/generations</code>,
  </template>
  下面给出 curl / Python SDK 代码片段；个人用量汇总在这里。图片任务记录请在「历史任务」菜单查看。若想在浏览器里直接体验，请打开「在线体验」。
</p>
```

```vue
<!-- 删除整个“图片任务历史” card-block，以及对应 grid/img-card/empty 样式 -->
```

- [ ] **Step 4: 再次运行测试，确认通过**

Run: `cd web && node --test tests/history-tasks.node.test.mjs`
Expected: PASS，文档页清理断言通过。

### Task 4: 进行类型与构建校验

**Files:**
- Verify: `internal/rbac/menu.go`
- Verify: `web/src/router/index.ts`
- Verify: `web/src/views/personal/ApiDocs.vue`
- Verify: `web/src/views/personal/HistoryTasks.vue`
- Verify: `web/tests/history-tasks.node.test.mjs`

- [ ] **Step 1: 运行 Node 回归测试，确认源码结构保持预期**

```bash
cd web && node --test tests/history-tasks.node.test.mjs
```

Expected: 所有测试通过。

- [ ] **Step 2: 运行前端构建检查**

```bash
cd web && npm run build
```

Expected: `vue-tsc --noEmit` 与 `vite build` 退出码为 0。

- [ ] **Step 3: 运行 Go 编译校验**

```bash
go test ./internal/rbac ./internal/server
```

Expected: 两个包编译通过，退出码为 0。
