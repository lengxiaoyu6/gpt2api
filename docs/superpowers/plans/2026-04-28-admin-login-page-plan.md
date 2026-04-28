# Admin Login Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `web` 管理后台登录页改成常规后台登录页，移除展示型英雄区，保留现有管理员登录校验与跳转逻辑。

**Architecture:** 登录页继续复用认证共享外壳与表单卡片，但 `AuthShell.vue` 需要支持无英雄区时的单栏居中布局。`Login.vue` 仅保留后台表单与简短说明，测试先调整为验证新的页面结构，再实现页面与样式。

**Tech Stack:** Vue 3、TypeScript、Element Plus、Vite、Node test

---

### Task 1: 调整登录页测试断言

**Files:**
Modify: `web/tests/auth-pages.node.test.mjs`
Test: `cd /root/code/gpt2api/web && node --test tests/auth-pages.node.test.mjs`

- [ ] **Step 1: 写出新的失败断言**

```js
test('登录页改为常规后台登录页', () => {
  const loginVue = read('web/src/views/auth/Login.vue')

  assert.match(loginVue, /AuthShell/)
  assert.match(loginVue, /AuthFormCard/)
  assert.doesNotMatch(loginVue, /AuthHeroPanel/)
  assert.match(loginVue, /title="后台登录"/)
  assert.match(loginVue, /subtitle="请输入管理员账号和密码"/)
  assert.match(loginVue, /管理后台/)
  assert.match(loginVue, /仅限管理员账号访问/)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /root/code/gpt2api/web && node --test tests/auth-pages.node.test.mjs`
Expected: FAIL，旧页面仍引用 `AuthHeroPanel`，旧标题与副标题尚未更新。

### Task 2: 调整共享外壳支持单栏布局

**Files:**
Modify: `web/src/components/auth/AuthShell.vue`
Test: `cd /root/code/gpt2api/web && node --test tests/auth-pages.node.test.mjs`

- [ ] **Step 1: 为外壳增加英雄区存在判断**

```vue
<script setup lang="ts">
import { computed, useSlots } from 'vue'

const props = defineProps<{
  siteFooter?: string
}>()

const slots = useSlots()
const hasHero = computed(() => Boolean(slots.hero))
</script>
```

- [ ] **Step 2: 按是否存在英雄区切换模板与类名**

```vue
<div class="auth-shell">
  <div class="auth-shell__glow auth-shell__glow--blue" />
  <div class="auth-shell__glow auth-shell__glow--cyan" />
  <div class="auth-shell__container" :class="{ 'auth-shell__container--compact': !hasHero }">
    <aside v-if="hasHero" class="auth-shell__hero">
      <slot name="hero" />
    </aside>
    <section class="auth-shell__form">
      <slot />
      <p v-if="props.siteFooter" class="auth-shell__site-footer">{{ props.siteFooter }}</p>
    </section>
  </div>
</div>
```

- [ ] **Step 3: 为单栏布局补齐样式**

```scss
.auth-shell__container--compact {
  grid-template-columns: minmax(320px, 420px);
  justify-content: center;
}

.auth-shell__container--compact .auth-shell__form {
  max-width: 420px;
  margin: 0 auto;
}
```

- [ ] **Step 4: 运行测试，确认仍因登录页尚未修改而失败**

Run: `cd /root/code/gpt2api/web && node --test tests/auth-pages.node.test.mjs`
Expected: FAIL，仅剩登录页文案与结构断言失败。

### Task 3: 将登录页收敛为常规后台登录页

**Files:**
Modify: `web/src/views/auth/Login.vue`
Test: `cd /root/code/gpt2api/web && node --test tests/auth-pages.node.test.mjs`

- [ ] **Step 1: 移除英雄区依赖，保留共享表单卡片**

```vue
<script setup lang="ts">
import AuthFormCard from '@/components/auth/AuthFormCard.vue'
import AuthShell from '@/components/auth/AuthShell.vue'
</script>
```

- [ ] **Step 2: 将标题区改成常规后台表达**

```vue
<AuthFormCard
  title="后台登录"
  subtitle="请输入管理员账号和密码"
>
  <div class="auth-login-head">
    <p class="auth-login-head__badge">管理后台</p>
    <h3>{{ siteName }}</h3>
    <p class="auth-login-head__desc">仅限管理员账号访问，用于处理用户、订单、额度与系统配置。</p>
  </div>
```

- [ ] **Step 3: 精简底部说明并保留登录逻辑**

```vue
<template #footer>
  <div class="auth-foot">
    <p>登录成功后进入后台首页。</p>
    <p>普通账号完成认证后会返回登录页。</p>
  </div>
</template>
```

- [ ] **Step 4: 运行测试确认登录页断言通过**

Run: `cd /root/code/gpt2api/web && node --test tests/auth-pages.node.test.mjs`
Expected: PASS

### Task 4: 完整验证后台登录页调整

**Files:**
Modify: `web/src/views/auth/Login.vue`
Modify: `web/src/components/auth/AuthShell.vue`
Modify: `web/tests/auth-pages.node.test.mjs`
Test: `cd /root/code/gpt2api/web && node --test tests/auth-pages.node.test.mjs tests/public-home.node.test.mjs tests/wap-domain-routing.node.test.mjs && npm run build`

- [ ] **Step 1: 运行完整测试集合**

Run: `cd /root/code/gpt2api/web && node --test tests/auth-pages.node.test.mjs tests/public-home.node.test.mjs tests/wap-domain-routing.node.test.mjs`
Expected: PASS，13 个测试全部通过。

- [ ] **Step 2: 运行构建验证**

Run: `cd /root/code/gpt2api/web && npm run build`
Expected: `vue-tsc --noEmit && vite build` exit 0。

- [ ] **Step 3: 查看仓库变更状态**

Run: `cd /root/code/gpt2api && git status --short && git diff --stat`
Expected: 仅出现本次登录页相关源码、测试与文档变更。
