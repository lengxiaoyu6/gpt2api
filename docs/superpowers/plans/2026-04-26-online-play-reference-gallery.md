# OnlinePlay 参考图区卡片化改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将图生图参考图区改为紧凑的方形卡片网格，并保留上传、删除、预览、继续编辑当前结果的能力。

**Architecture:** 仅调整 `web/src/views/personal/OnlinePlay.vue` 中参考图区的模板、状态与样式，结果图区与上游请求协议保持现状。静态节点测试同步从“主画布 + 缩略条”迁移到“卡片网格 + 预览入口”的断言模型。

**Tech Stack:** Vue 3 SFC、TypeScript、Element Plus、Node `node:test`

---

### Task 1: 先改测试，锁定新界面行为

**Files:**
Create: 无
Modify: `web/tests/online-play-img2img-layout.node.test.mjs`
Test: `web/tests/online-play-img2img-layout.node.test.mjs`

- [ ] **Step 1: 写出新的失败断言**

```js
test('图生图区参考图改为方形卡片网格并移除主图切换状态', () => {
  const playVue = read('web/src/views/personal/OnlinePlay.vue')
  assert.doesNotMatch(playVue, /const activeRefIndex = ref\(0\)/)
  assert.doesNotMatch(playVue, /const activeRefImage = computed(?:<[^>]+>)?\(\(\) =>/)
  assert.doesNotMatch(playVue, /function setActiveRef\(idx: number\)/)
  assert.match(playVue, /class="ref-card-grid"/)
  assert.match(playVue, /class="ref-card"/)
  assert.match(playVue, /class="ref-card ref-card--adder"/)
})

test('图生图区参考图卡片支持点击预览与删除', () => {
  const playVue = read('web/src/views/personal/OnlinePlay.vue')
  assert.match(playVue, /@click="openPreview\(refImages\.map\(\(r\) => r\.dataUrl\), idx\)"/)
  assert.match(playVue, /class="ref-card__remove" @click\.stop="removeRefImage\(idx\)"/)
})

test('图生图区使用方形卡片网格压缩纵向空间', () => {
  const playVue = read('web/src/views/personal/OnlinePlay.vue')
  assert.match(playVue, /\.ref-card-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fill, minmax\(104px, 1fr\)\);/)
  assert.match(playVue, /\.ref-card\s*\{[\s\S]*aspect-ratio:\s*1;/)
  assert.match(playVue, /\.ref-card__image\s*\{[\s\S]*object-fit:\s*cover;/)
})
```

- [ ] **Step 2: 运行单测，确认当前实现失败**

Run: `node --test web/tests/online-play-img2img-layout.node.test.mjs`
Expected: FAIL，旧结构相关断言仍存在，新卡片网格断言缺失。

- [ ] **Step 3: 提交测试文件修改**

```bash
git add web/tests/online-play-img2img-layout.node.test.mjs
```

### Task 2: 修改参考图区模板、状态与样式

**Files:**
Create: 无
Modify: `web/src/views/personal/OnlinePlay.vue`
Test: `web/tests/online-play-img2img-layout.node.test.mjs`

- [ ] **Step 1: 删掉参考主图切换状态，保留结果图区状态**

```ts
const activeResultIndex = ref(0)
const activeResultImage = computed<PlayImageData | null>(() => i2iResult.value[activeResultIndex.value] || null)
const i2iResultUrls = computed(() => i2iResult.value.map((item) => item.url))
```

并从脚本中删除：

```ts
const activeRefIndex = ref(0)
const activeRefImage = computed<RefImage | null>(() => refImages.value[activeRefIndex.value] || null)

function setActiveRef(idx: number) {
  if (idx < 0 || idx >= refImages.value.length) return
  activeRefIndex.value = idx
}
```

同步简化 `handleFilePick`、`removeRefImage`、`continueEditCurrentResult` 中与参考主图索引有关的处理。

- [ ] **Step 2: 把参考图区模板改成卡片网格**

将原有参考图区：

```vue
<div class="compare-canvas compare-canvas--reference">...</div>
<div v-if="refImages.length" class="thumb-strip">...</div>
```

替换为：

```vue
<div class="ref-card-grid">
  <template v-if="refImages.length">
    <button
      v-for="(r, idx) in refImages"
      :key="`${r.name}-${idx}-${r.size}`"
      type="button"
      class="ref-card"
      @click="openPreview(refImages.map((r) => r.dataUrl), idx)"
    >
      <img :src="r.dataUrl" :alt="r.name" class="ref-card__image" loading="lazy" />
      <span class="ref-card__meta">
        <span class="ref-card__name">{{ r.name }}</span>
        <span class="ref-card__size">{{ (r.size / 1024).toFixed(0) }} KB</span>
      </span>
      <span class="ref-card__remove" @click.stop="removeRefImage(idx)">
        <el-icon><Close /></el-icon>
      </span>
    </button>
  </template>

  <label :class="['ref-card', 'ref-card--adder', { 'ref-card--empty': !refImages.length }]">
    <el-icon class="ref-card__adder-icon"><UploadFilled /></el-icon>
    <div class="ref-card__adder-title">点击选择</div>
    <div class="ref-card__adder-sub">支持多张 · 单张 ≤ 4MB</div>
    <input type="file" accept="image/*" multiple @change="handleFilePick" />
  </label>
</div>
```

- [ ] **Step 3: 为新卡片网格补齐样式**

```scss
.ref-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
  gap: 12px;
}
.ref-card {
  position: relative;
  aspect-ratio: 1;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
  padding: 0;
  cursor: zoom-in;
}
.ref-card__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
```

并新增上传卡片、底部信息层、删除按钮与移动端样式；删除 `compare-canvas--reference`、`thumb-strip`、`thumb-strip__item`、`thumb-strip__adder`、`thumb-strip__remove` 的参考图区依赖样式。

- [ ] **Step 4: 运行单测，确认新断言通过**

Run: `node --test web/tests/online-play-img2img-layout.node.test.mjs`
Expected: PASS

### Task 3: 回归验证相关静态测试

**Files:**
Create: 无
Modify: 无
Test: `web/tests/online-play-img2img-layout.node.test.mjs`, `web/tests/online-play-pricing.node.test.mjs`

- [ ] **Step 1: 运行参考图区相关静态测试集合**

Run: `node --test web/tests/online-play-img2img-layout.node.test.mjs web/tests/online-play-pricing.node.test.mjs`
Expected: PASS，比例、价格、参考图区布局断言同时通过。

- [ ] **Step 2: 检查工作区变更范围**

Run: `git diff -- web/src/views/personal/OnlinePlay.vue web/tests/online-play-img2img-layout.node.test.mjs docs/superpowers/specs/2026-04-26-online-play-reference-gallery-design.md docs/superpowers/plans/2026-04-26-online-play-reference-gallery.md`
Expected: 仅包含参考图区卡片化相关修改与文档新增。

- [ ] **Step 3: 提交本次改动**

```bash
git add web/src/views/personal/OnlinePlay.vue \
  web/tests/online-play-img2img-layout.node.test.mjs \
  docs/superpowers/specs/2026-04-26-online-play-reference-gallery-design.md \
  docs/superpowers/plans/2026-04-26-online-play-reference-gallery.md
```
