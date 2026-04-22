# Auth Pages GPT-image Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将登录页与注册页改造成统一的 GPT-image 中转 API 平台认证入口，突出图像能力、控制台入口与体验额度信息。

**Architecture:** 以共享认证外壳组件承载背景、品牌能力区与统一卡片结构，登录页与注册页仅保留各自字段、校验与提交逻辑。测试层继续使用现有 `node:test` 静态断言方式验证组件复用与关键文案，再通过前端构建做类型与打包校验。

**Tech Stack:** Vue 3、TypeScript、Pinia、Vue Router、Element Plus、SCSS、Node test、Vite

---

### Task 1: 补齐认证页回归测试

**Files:**
Create: `web/tests/auth-pages.node.test.mjs`
Test: `node --test web/tests/auth-pages.node.test.mjs`

- [ ] **Step 1: 写出失败测试**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

test('登录页与注册页复用认证外壳组件', () => {
  const loginVue = read('web/src/views/auth/Login.vue')
  const registerVue = read('web/src/views/auth/Register.vue')
  assert.match(loginVue, /AuthShell/)
  assert.match(loginVue, /AuthFormCard/)
  assert.match(registerVue, /AuthShell/)
  assert.match(registerVue, /AuthFormCard/)
})

test('品牌能力区展示 GPT-image 平台能力与接口规格', () => {
  const heroVue = read('web/src/components/auth/AuthHeroPanel.vue')
  assert.match(heroVue, /统一接入 GPT-image 能力/)
  assert.match(heroVue, /OpenAI Images Compatible/)
  assert.match(heroVue, /POST \/v1\/images\/generations/)
  assert.match(heroVue, /文生图/)
  assert.match(heroVue, /图生图/)
  assert.match(heroVue, /批量生成/)
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd web && node --test tests/auth-pages.node.test.mjs`
Expected: FAIL，提示 `AuthHeroPanel.vue` 或 `AuthShell` 相关断言失败。

- [ ] **Step 3: 扩展登录页与注册页文案断言**

```js
test('登录页强调控制台入口与体验额度', () => {
  const loginVue = read('web/src/views/auth/Login.vue')
  assert.match(loginVue, /登录控制台/)
  assert.match(loginVue, /首次使用可先注册账号并领取体验额度/)
})

test('注册页强调体验额度与进入控制台', () => {
  const registerVue = read('web/src/views/auth/Register.vue')
  assert.match(registerVue, /新账号赠送体验额度/)
  assert.match(registerVue, /注册并进入控制台/)
})
```

- [ ] **Step 4: 再次运行测试并确认仍为失败状态**

Run: `cd web && node --test tests/auth-pages.node.test.mjs`
Expected: FAIL，断言仍指向尚未实现的新组件或新文案。

### Task 2: 实现共享认证外壳与品牌能力区

**Files:**
Create: `web/src/components/auth/AuthShell.vue`
Create: `web/src/components/auth/AuthHeroPanel.vue`
Create: `web/src/components/auth/AuthFormCard.vue`
Modify: `web/src/stores/site.ts`
Test: `cd web && node --test tests/auth-pages.node.test.mjs`

- [ ] **Step 1: 编写认证外壳组件骨架**

```vue
<script setup lang="ts">
defineProps<{
  siteFooter?: string
}>()
</script>

<template>
  <div class="auth-shell">
    <div class="auth-shell__glow auth-shell__glow--blue" />
    <div class="auth-shell__glow auth-shell__glow--cyan" />
    <div class="auth-shell__container">
      <slot name="hero" />
      <div class="auth-shell__form">
        <slot />
        <p v-if="siteFooter" class="auth-shell__footer">{{ siteFooter }}</p>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 编写品牌能力区组件**

```vue
<script setup lang="ts">
const props = defineProps<{
  siteName: string
  siteDesc: string
  siteLogo?: string
  allowRegister: boolean
}>()

const capabilities = [
  { title: '文生图', detail: '输入 prompt，快速生成首版图像', meta: 'model · prompt · size · n' },
  { title: '图生图', detail: '支持参考图输入与二次生成', meta: 'reference_images · prompt · size' },
  { title: '批量生成', detail: '支持多张输出、尺寸选择与模型切换', meta: 'n · size · automation' },
]
</script>
```

- [ ] **Step 3: 编写统一表单卡片组件**

```vue
<script setup lang="ts">
defineProps<{
  title: string
  subtitle: string
  noticeTitle?: string
  noticeDesc?: string
  noticeTone?: 'success' | 'warning'
}>()
</script>
```

- [ ] **Step 4: 更新站点默认描述**

```ts
const info = ref<Record<string, string>>({
  'site.name': 'GPT2API',
  'site.description': '面向开发者与小规模业务的 GPT-image 中转 API 平台',
```

- [ ] **Step 5: 运行测试确认组件断言通过，其余断言仍可能失败**

Run: `cd web && node --test tests/auth-pages.node.test.mjs`
Expected: 登录页、注册页文案断言可能仍失败，组件存在与能力区断言通过。

### Task 3: 重构登录页

**Files:**
Modify: `web/src/views/auth/Login.vue`
Test: `cd web && node --test tests/auth-pages.node.test.mjs`

- [ ] **Step 1: 登录页改为使用共享组件**

```vue
<script setup lang="ts">
import AuthShell from '@/components/auth/AuthShell.vue'
import AuthHeroPanel from '@/components/auth/AuthHeroPanel.vue'
import AuthFormCard from '@/components/auth/AuthFormCard.vue'
```

- [ ] **Step 2: 增加表单内错误状态并保留登录逻辑**

```ts
const submitError = ref('')

async function onSubmit() {
  if (!formRef.value) return
  const ok = await formRef.value.validate().catch(() => false)
  if (!ok) return
  submitError.value = ''
  loading.value = true
  try {
    await store.login(form.email, form.password)
    ElMessage.success('登录成功')
    const redirect = (route.query.redirect as string) || '/personal/dashboard'
    router.replace(redirect)
  } catch (err: unknown) {
    submitError.value = err instanceof Error ? err.message : '登录失败，请稍后重试'
  } finally {
    loading.value = false
  }
}
```

- [ ] **Step 3: 替换模板文案**

```vue
<AuthFormCard
  title="登录控制台"
  subtitle="管理 API 密钥，查看图像任务、调用记录与账户额度"
>
```

并补入：

```vue
<el-alert v-if="submitError" type="error" :closable="false" :title="submitError" />
<p class="auth-tip">首次使用可先注册账号并领取体验额度</p>
```

- [ ] **Step 4: 运行测试确认登录页断言通过**

Run: `cd web && node --test tests/auth-pages.node.test.mjs`
Expected: 登录页相关断言通过，注册页断言可能仍失败。

### Task 4: 重构注册页

**Files:**
Modify: `web/src/views/auth/Register.vue`
Test: `cd web && node --test tests/auth-pages.node.test.mjs`

- [ ] **Step 1: 注册页改为使用共享组件**

```vue
<script setup lang="ts">
import AuthShell from '@/components/auth/AuthShell.vue'
import AuthHeroPanel from '@/components/auth/AuthHeroPanel.vue'
import AuthFormCard from '@/components/auth/AuthFormCard.vue'
```

- [ ] **Step 2: 加入顶部体验额度提示与错误状态**

```ts
const submitError = ref('')
const noticeTitle = computed(() => allowRegister.value ? '新账号赠送体验额度' : '当前采用邀请开通方式')
const noticeDesc = computed(() => allowRegister.value
  ? '注册后即可进入控制台创建 API 密钥并开始图像生成调用'
  : '可联系管理员创建账号后登录控制台使用')
```

- [ ] **Step 3: 调整按钮与底部说明文案**

```vue
<el-button type="primary" class="submit" :loading="loading" :disabled="!allowRegister" @click="onSubmit">
  注册并进入控制台
</el-button>
<p class="steps">注册账号 → 进入控制台 → 创建 API 密钥</p>
```

- [ ] **Step 4: 运行测试确认全部静态断言通过**

Run: `cd web && node --test tests/auth-pages.node.test.mjs`
Expected: PASS，`auth-pages.node.test.mjs` 全部通过。

### Task 5: 完整验证构建

**Files:**
Modify: `web/src/views/auth/Login.vue`
Modify: `web/src/views/auth/Register.vue`
Modify: `web/src/components/auth/AuthShell.vue`
Modify: `web/src/components/auth/AuthHeroPanel.vue`
Modify: `web/src/components/auth/AuthFormCard.vue`
Modify: `web/src/stores/site.ts`
Test: `cd web && node --test tests/auth-pages.node.test.mjs && npm run build`

- [ ] **Step 1: 运行认证页静态测试**

Run: `cd web && node --test tests/auth-pages.node.test.mjs`
Expected: PASS，全部测试通过。

- [ ] **Step 2: 运行前端构建**

Run: `cd web && npm run build`
Expected: `vue-tsc --noEmit` 与 `vite build` 均成功退出。

- [ ] **Step 3: 检查最终差异范围**

Run: `git diff -- web/src/components/auth web/src/views/auth/Login.vue web/src/views/auth/Register.vue web/src/stores/site.ts web/tests/auth-pages.node.test.mjs docs/superpowers/specs/2026-04-22-auth-gpt-image-design.md docs/superpowers/plans/2026-04-22-auth-gpt-image-redesign.md`
Expected: 仅包含认证页改版相关文件差异。
