# Img2Img Page Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重整在线体验页的图生图区，使参考图与生成结果并排对照，主打查看、放大、下载三项操作，并将继续编辑当前结果降为次级入口。

**Architecture:** 保持 `playGenerateImage + reference_images` 这一请求链路不变，仅重构 `web/src/views/personal/OnlinePlay.vue` 中图生图部分的状态、模板与样式。通过 `activeRefIndex`、`activeResultIndex`、`activeRefImage`、`activeResultImage` 形成双侧主预览结构，并用固定画布承接空态、生成中、完成态、错误态。

**Tech Stack:** Vue 3、TypeScript、Element Plus、SCSS、Node test、Vite

---

### Task 1: 写出图生图页面结构回归测试

**Files:**
Create: `web/tests/online-play-img2img-layout.node.test.mjs`
Test: `cd web && node --test tests/online-play-img2img-layout.node.test.mjs`

- [ ] **Step 1: 新增静态测试文件骨架**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}
```

- [ ] **Step 2: 写入图生图区结构断言**

```js
test('图生图区移除旧的 Preview 占位提示', () => {
  const playVue = read('web/src/views/personal/OnlinePlay.vue')
  assert.doesNotMatch(playVue, /图生图目前处于 Preview/)
  assert.doesNotMatch(playVue, /当前提交会返回 501/)
})

test('图生图区维护参考主图与结果主图状态', () => {
  const playVue = read('web/src/views/personal/OnlinePlay.vue')
  assert.match(playVue, /const activeRefIndex = ref\(0\)/)
  assert.match(playVue, /const activeResultIndex = ref\(0\)/)
  assert.match(playVue, /const activeRefImage = computed\(\(\) =>/)
  assert.match(playVue, /const activeResultImage = computed\(\(\) =>/)
})
```

- [ ] **Step 3: 写入结果操作与继续编辑断言**

```js
test('图生图区提供查看放大下载与继续编辑入口', () => {
  const playVue = read('web/src/views/personal/OnlinePlay.vue')
  assert.match(playVue, />查看</)
  assert.match(playVue, />放大</)
  assert.match(playVue, />下载</)
  assert.match(playVue, /继续编辑当前结果/)
})

test('继续编辑逻辑会把当前结果图写回参考图区', () => {
  const playVue = read('web/src/views/personal/OnlinePlay.vue')
  assert.match(playVue, /async function continueEditCurrentResult\(\)/)
  assert.match(playVue, /refImages\.value = \[/)
  assert.match(playVue, /activeRefIndex\.value = 0/)
})
```

- [ ] **Step 4: 写入固定画布结构断言并运行测试**

```js
test('图生图区使用固定双栏画布与缩略条结构', () => {
  const playVue = read('web/src/views/personal/OnlinePlay.vue')
  assert.match(playVue, /class="img2img-compare"/)
  assert.match(playVue, /class="compare-panel compare-panel--reference"/)
  assert.match(playVue, /class="compare-panel compare-panel--result"/)
  assert.match(playVue, /class="thumb-strip"/)
  assert.match(playVue, /class="result-primary-actions"/)
})
```

Run: `cd web && node --test tests/online-play-img2img-layout.node.test.mjs`
Expected: FAIL，断言指向缺失的 `activeRefIndex`、`continueEditCurrentResult`、`img2img-compare` 等新结构。

### Task 2: 补齐图生图脚本状态与继续编辑逻辑

**Files:**
Modify: `web/src/views/personal/OnlinePlay.vue`
Test: `cd web && node --test tests/online-play-img2img-layout.node.test.mjs`

- [ ] **Step 1: 在图生图状态区新增当前主图索引与派生值**

```ts
const activeRefIndex = ref(0)
const activeResultIndex = ref(0)

const activeRefImage = computed(() => refImages.value[activeRefIndex.value] || null)
const activeResultImage = computed(() => i2iResult.value[activeResultIndex.value] || null)
const i2iResultUrls = computed(() => i2iResult.value.map((item) => item.url))

function setActiveRef(idx: number) {
  if (idx < 0 || idx >= refImages.value.length) return
  activeRefIndex.value = idx
}

function setActiveResult(idx: number) {
  if (idx < 0 || idx >= i2iResult.value.length) return
  activeResultIndex.value = idx
}
```

- [ ] **Step 2: 让上传、删除、生成成功后的索引保持稳定**

```ts
function handleFilePick(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files
  if (!files) return
  const shouldResetActive = refImages.value.length === 0
  for (const file of Array.from(files)) {
    if (file.size > MAX_REF_BYTES) {
      ElMessage.warning(`${file.name} 超过 4MB 限制`)
      continue
    }
    const reader = new FileReader()
    reader.onload = () => {
      refImages.value.push({
        name: file.name,
        dataUrl: String(reader.result || ''),
        size: file.size,
      })
      if (shouldResetActive && refImages.value.length === 1) activeRefIndex.value = 0
    }
    reader.readAsDataURL(file)
  }
  input.value = ''
}

function removeRefImage(idx: number) {
  refImages.value.splice(idx, 1)
  if (refImages.value.length === 0) {
    activeRefIndex.value = 0
    return
  }
  if (activeRefIndex.value >= refImages.value.length) {
    activeRefIndex.value = refImages.value.length - 1
  }
}
```

生成成功后补一行：

```ts
i2iResult.value = resp.data || []
activeResultIndex.value = 0
```

- [ ] **Step 3: 新增结果回写参考图区的辅助函数**

```ts
async function imageUrlToDataUrl(url: string) {
  const resp = await fetch(url)
  const blob = await resp.blob()
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('结果图转换失败'))
    reader.readAsDataURL(blob)
  })
}

async function continueEditCurrentResult() {
  if (!activeResultImage.value?.url) return
  const dataUrl = await imageUrlToDataUrl(activeResultImage.value.url)
  refImages.value = [{
    name: `generated-${Date.now()}.png`,
    dataUrl,
    size: Math.round((dataUrl.length * 3) / 4),
  }]
  activeRefIndex.value = 0
}
```

- [ ] **Step 4: 运行静态测试确认脚本断言通过**

Run: `cd web && node --test tests/online-play-img2img-layout.node.test.mjs`
Expected: 结构相关断言仍失败，脚本状态与 `continueEditCurrentResult` 相关断言通过。

### Task 3: 重构图生图模板为并排对照结构

**Files:**
Modify: `web/src/views/personal/OnlinePlay.vue`
Test: `cd web && node --test tests/online-play-img2img-layout.node.test.mjs`

- [ ] **Step 1: 将图生图区根容器改为固定双栏对照布局**

```vue
<div class="img2img-compare">
  <section class="card-block compare-panel compare-panel--reference">
    <div class="compare-panel__head">
      <div>
        <div class="compare-panel__title">参考图</div>
        <div class="compare-panel__sub">上传参考图后，左侧始终展示当前参考主图</div>
      </div>
    </div>
  </section>

  <section class="card-block compare-panel compare-panel--result">
    <div class="compare-panel__head">
      <div>
        <div class="compare-panel__title">生成结果</div>
        <div class="compare-panel__sub">右侧固定展示当前结果主图与主要操作</div>
      </div>
    </div>
  </section>
</div>
```

- [ ] **Step 2: 用统一主画布替换左侧上传框与缩略网格**

```vue
<div class="compare-canvas compare-canvas--reference">
  <label v-if="!activeRefImage" class="upload-zone upload-zone--canvas">
    <el-icon class="up-ic"><UploadFilled /></el-icon>
    <div class="up-t">点击选择 / 拖拽图片到这里</div>
    <div class="up-s">最多多张，每张 ≤ 4MB</div>
    <input type="file" accept="image/*" multiple @change="handleFilePick" />
  </label>
  <img v-else :src="activeRefImage.dataUrl" :alt="activeRefImage.name" class="compare-image" />
</div>

<div v-if="refImages.length" class="thumb-strip">
  <button
    v-for="(r, idx) in refImages"
    :key="`${r.name}-${idx}`"
    :class="['thumb-strip__item', { active: idx === activeRefIndex }]"
    @click="setActiveRef(idx)"
  >
    <img :src="r.dataUrl" :alt="r.name" />
    <span class="thumb-strip__remove" @click.stop="removeRefImage(idx)">
      <el-icon><Close /></el-icon>
    </span>
  </button>

  <label class="thumb-strip__adder">
    <el-icon><Plus /></el-icon>
    <input type="file" accept="image/*" multiple @change="handleFilePick" />
  </label>
</div>
```

- [ ] **Step 3: 用主结果图、缩略条与操作带替换右侧宫格**

```vue
<div class="compare-canvas compare-canvas--result">
  <div v-if="i2iError" class="canvas-state canvas-state--error">
    <div class="err-block">
      <el-icon><WarningFilled /></el-icon>
      {{ i2iError }}
    </div>
  </div>
  <div v-else-if="i2iSending" class="canvas-state canvas-state--loading">
    <div class="orb"><el-icon class="spin"><Loading /></el-icon></div>
    <div class="stage-title">正在生成…</div>
    <div class="stage-sub">请保持页面打开，结果会在当前画布中更新</div>
  </div>
  <div v-else-if="!activeResultImage" class="canvas-state">
    <div class="stage-art">🎨</div>
    <div class="stage-title">还没有结果</div>
    <div class="stage-sub">先在左侧上传参考图并填写改动描述</div>
  </div>
  <img v-else :src="activeResultImage.url" :alt="`result-${activeResultIndex}`" class="compare-image" />
</div>

<div v-if="i2iResult.length > 1" class="thumb-strip thumb-strip--result">
  <button
    v-for="(img, idx) in i2iResult"
    :key="img.url"
    :class="['thumb-strip__item', { active: idx === activeResultIndex }]"
    @click="setActiveResult(idx)"
  >
    <img :src="img.url" :alt="`result-thumb-${idx}`" />
  </button>
</div>

<div v-if="activeResultImage" class="result-primary-actions">
  <el-button @click="window.open(activeResultImage.url, '_blank', 'noopener')">查看</el-button>
  <el-button @click="openPreview(i2iResultUrls, activeResultIndex)">放大</el-button>
  <el-button type="primary" @click="downloadUrl(activeResultImage.url)">下载</el-button>
  <button class="result-secondary-link" @click="continueEditCurrentResult">继续编辑当前结果</button>
</div>
```

图生图区顶部旧提示整段删除：

```vue
<el-alert
  type="warning"
  :closable="false"
  title="图生图目前处于 Preview"
  description="上游 ChatGPT 文件上传协议还在接入,当前提交会返回 501。UI 已准备就绪,协议完成后即刻可用。"
  show-icon
  style="margin-bottom: 14px; border-radius: 10px;"
/>
```

- [ ] **Step 4: 运行静态测试确认模板断言通过**

Run: `cd web && node --test tests/online-play-img2img-layout.node.test.mjs`
Expected: PASS，页面结构、主操作带与继续编辑断言全部通过。

### Task 4: 补齐图生图样式并核对移动端

**Files:**
Modify: `web/src/views/personal/OnlinePlay.vue`
Test: `cd web && node --test tests/online-play-img2img-layout.node.test.mjs`

- [ ] **Step 1: 为图生图双栏、主画布与缩略条补样式**

```scss
.img2img-compare {
  display: grid;
  grid-template-columns: minmax(320px, 380px) minmax(0, 1fr);
  gap: 16px;
}

.compare-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.compare-canvas {
  min-height: 420px;
  border-radius: 18px;
  border: 1px solid var(--el-border-color-lighter);
  background: linear-gradient(180deg, var(--el-fill-color-lighter), var(--el-bg-color));
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.compare-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
```

- [ ] **Step 2: 为缩略条、主操作带与次级入口补样式**

```scss
.thumb-strip {
  display: flex;
  gap: 10px;
  overflow-x: auto;
}

.thumb-strip__item,
.thumb-strip__adder {
  position: relative;
  flex: 0 0 72px;
  width: 72px;
  height: 72px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--el-border-color);
  background: var(--el-fill-color-light);
}

.thumb-strip__item.active {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 3px rgba(64, 158, 255, 0.12);
}

.result-primary-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.result-secondary-link {
  border: none;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
}
```

- [ ] **Step 3: 让响应式断点在小屏回落为单列**

```scss
@media (max-width: 1100px) {
  .chat-grid,
  .img-grid,
  .img2img-compare {
    grid-template-columns: 1fr;
  }

  .result-primary-actions {
    align-items: flex-start;
  }
}
```

- [ ] **Step 4: 运行静态测试确认样式相关结构仍可通过**

Run: `cd web && node --test tests/online-play-img2img-layout.node.test.mjs`
Expected: PASS，结构断言全部保持通过。

### Task 5: 完整验证与改动核对

**Files:**
Modify: `web/src/views/personal/OnlinePlay.vue`
Create: `web/tests/online-play-img2img-layout.node.test.mjs`
Modify: `docs/superpowers/specs/2026-04-22-img2img-page-design.md`
Create: `docs/superpowers/plans/2026-04-22-img2img-page.md`

- [ ] **Step 1: 运行图生图静态测试**

Run: `cd web && node --test tests/online-play-img2img-layout.node.test.mjs`
Expected: PASS，新增图生图页面断言全部通过。

- [ ] **Step 2: 运行既有在线体验页静态测试**

Run: `cd web && node --test tests/online-play-pricing.node.test.mjs`
Expected: PASS，既有价格与比例断言继续通过。

- [ ] **Step 3: 运行前端构建**

Run: `cd web && npm run build`
Expected: exit 0，Vite 构建成功。

- [ ] **Step 4: 核对改动范围**

Run: `git diff -- web/src/views/personal/OnlinePlay.vue web/tests/online-play-img2img-layout.node.test.mjs docs/superpowers/specs/2026-04-22-img2img-page-design.md docs/superpowers/plans/2026-04-22-img2img-page.md`
Expected: diff 仅包含图生图页面结构调整、静态测试与设计文档。
