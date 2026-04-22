# Online Play Base Price Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在在线体验页展示图片模型的单张基准价格，并让普通用户模型列表返回对应价格字段。

**Architecture:** 继续使用现有模型配置作为唯一价格来源，后端仅扩展 `GET /api/me/models` 的响应字段。前端在 `SimpleModel` 上补齐类型后，通过当前选中的图片模型计算价格并在文生图、图生图侧栏显示提示。

**Tech Stack:** Go、Gin、Vue 3、TypeScript、Element Plus、SCSS、Node test、Vite

---

### Task 1: 写出价格字段回归测试

**Files:**
Create: `web/tests/online-play-pricing.node.test.mjs`
Test: `cd web && node --test tests/online-play-pricing.node.test.mjs`

- [ ] **Step 1: 新增静态断言测试文件**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

test('普通用户模型列表返回图片单张价格字段', () => {
  const handlerGo = read('internal/model/admin_handler.go')
  assert.match(handlerGo, /ImagePricePerCall\s+int64\s+`json:"image_price_per_call"`/)
  assert.match(handlerGo, /ImagePricePerCall:\s*m\.ImagePricePerCall/)
})
```

- [ ] **Step 2: 扩展前端类型与页面文案断言**

```js
test('前端模型类型包含 image_price_per_call', () => {
  const apiTs = read('web/src/api/me.ts')
  assert.match(apiTs, /image_price_per_call:\s*number/)
})

test('在线体验页展示单张基准价格提示', () => {
  const playVue = read('web/src/views/personal/OnlinePlay.vue')
  assert.match(playVue, /单张基准价格/)
  assert.match(playVue, /多张生成会按张数累计扣费/)
  assert.match(playVue, /image_price_per_call/)
})
```

- [ ] **Step 3: 运行测试并确认失败**

Run: `cd web && node --test tests/online-play-pricing.node.test.mjs`
Expected: FAIL，断言指向缺失的 `image_price_per_call` 字段或价格文案。

### Task 2: 扩展普通用户模型列表返回结构

**Files:**
Modify: `internal/model/admin_handler.go`
Test: `cd web && node --test tests/online-play-pricing.node.test.mjs`

- [ ] **Step 1: 为 `simple` 结构添加价格字段**

```go
type simple struct {
    ID                uint64 `json:"id"`
    Slug              string `json:"slug"`
    Type              string `json:"type"`
    Description       string `json:"description"`
    ImagePricePerCall int64  `json:"image_price_per_call"`
}
```

- [ ] **Step 2: 在返回数组中写入模型价格**

```go
out = append(out, simple{
    ID:                m.ID,
    Slug:              m.Slug,
    Type:              m.Type,
    Description:       m.Description,
    ImagePricePerCall: m.ImagePricePerCall,
})
```

- [ ] **Step 3: 运行测试确认后端断言通过**

Run: `cd web && node --test tests/online-play-pricing.node.test.mjs`
Expected: 后端相关断言通过，前端断言仍失败。

### Task 3: 在前端模型类型与在线体验页显示价格

**Files:**
Modify: `web/src/api/me.ts`
Modify: `web/src/views/personal/OnlinePlay.vue`
Test: `cd web && node --test tests/online-play-pricing.node.test.mjs`

- [ ] **Step 1: 为 `SimpleModel` 添加价格类型**

```ts
export interface SimpleModel {
  id: number
  slug: string
  type: 'chat' | 'image' | string
  description: string
  image_price_per_call: number
}
```

- [ ] **Step 2: 在在线体验页计算当前图片模型价格**

```ts
const currentImageModel = computed(
  () => imageModels.value.find((m) => m.slug === selectedImageModel.value),
)
const currentImageDesc = computed(() => currentImageModel.value?.description || '')
const currentImageBasePrice = computed(() => currentImageModel.value?.image_price_per_call ?? 0)
```

- [ ] **Step 3: 在图片模型选择器下方增加提示区**

```vue
<div v-if="selectedImageModel" class="price-hint">
  <span class="price-hint__title">单张基准价格：{{ formatCredit(currentImageBasePrice) }} 积分 / 张</span>
  <span class="price-hint__sub">多张生成会按张数累计扣费</span>
</div>
```

图生图区域使用同样的提示块，保持信息一致。

- [ ] **Step 4: 添加最小样式并运行静态测试**

Run: `cd web && node --test tests/online-play-pricing.node.test.mjs`
Expected: PASS，价格字段与页面文案断言全部通过。

### Task 4: 完整验证

**Files:**
Modify: `internal/model/admin_handler.go`
Modify: `web/src/api/me.ts`
Modify: `web/src/views/personal/OnlinePlay.vue`
Create: `web/tests/online-play-pricing.node.test.mjs`

- [ ] **Step 1: 运行单测**

Run: `cd web && node --test tests/online-play-pricing.node.test.mjs`
Expected: PASS，全部断言通过。

- [ ] **Step 2: 运行前端构建**

Run: `cd web && npm run build`
Expected: exit 0，Vite 构建成功。

- [ ] **Step 3: 核对改动范围**

Run: `git diff -- internal/model/admin_handler.go web/src/api/me.ts web/src/views/personal/OnlinePlay.vue web/tests/online-play-pricing.node.test.mjs docs/superpowers/specs/2026-04-22-online-play-base-price-design.md docs/superpowers/plans/2026-04-22-online-play-base-price.md`
Expected: diff 仅包含普通用户模型价格字段、在线体验页价格提示、测试与文档。
