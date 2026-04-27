# Web API Message Localization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `web` 前端对 `/api/*` 业务接口返回的英文 `message` 统一显示为中文，同时保持 `/v1/*` 与后端协议不变。

**Architecture:** 在 `web/src/utils/api-message.ts` 新增纯函数处理英文 message 到中文的映射，并在 `web/src/api/http.ts` 的业务错误与 HTTP 异常分支统一接入。页面层继续复用现有 `ApiError.message` 与 `ElMessage.error(...)`，避免逐页修改。

**Tech Stack:** Vue 3、TypeScript、Axios、Element Plus、Node.js `node:test`

---

## 文件结构

`web/src/utils/api-message.ts`

负责 `/api/*` 请求的 message 中文化。包含精确匹配、前缀匹配与仅对 `/api/*` 生效的边界判断。

`web/src/api/http.ts`

统一请求层。接入本地化函数，确保 `ApiError.message`、`ElMessage.error(...)`、401 刷新失败跳转提示使用同一文案。

`web/tests/api-message-localization.node.test.mjs`

源码级约束测试，覆盖请求层接入点、关键映射与 `/api/*` 生效边界。

### Task 1: 增加失败测试约束本地化入口

**Files:**
Create: `web/tests/api-message-localization.node.test.mjs`
Test: `node --test web/tests/api-message-localization.node.test.mjs`

- [ ] **Step 1: 写失败测试**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd())
const read = (path) => readFileSync(resolve(root, path), 'utf8')

test('web http 请求层接入统一 message 本地化工具', () => {
  const httpTs = read('web/src/api/http.ts')
  assert.match(httpTs, /from '\.\.\/utils\/api-message'|from '\.\/\.\.\/utils\/api-message'|from '\.\.\/utils\/api-message'/)
  assert.match(httpTs, /localizeApiMessage\(/)
})

test('web message 本地化工具覆盖核心英文提示与 api 边界', () => {
  const utilTs = read('web/src/utils/api-message.ts')
  assert.match(utilTs, /invalid email or password/)
  assert.match(utilTs, /not logged in/)
  assert.match(utilTs, /insufficient permission/)
  assert.match(utilTs, /\/api\//)
  assert.match(utilTs, /\/v1\//)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test web/tests/api-message-localization.node.test.mjs`
Expected: FAIL，提示 `web/src/utils/api-message.ts` 不存在，或 `web/src/api/http.ts` 尚未接入 `localizeApiMessage`。

### Task 2: 实现 message 本地化工具并接入请求层

**Files:**
Create: `web/src/utils/api-message.ts`
Modify: `web/src/api/http.ts`
Test: `node --test web/tests/api-message-localization.node.test.mjs`

- [ ] **Step 1: 新增本地化工具最小实现**

```ts
const EXACT_MESSAGE_MAP: Record<string, string> = {
  'invalid email or password': '邮箱或密码错误',
  'email already registered': '邮箱已注册',
  'user registration is currently disabled': '当前已关闭用户注册',
  'this email domain is not allowed for registration': '当前邮箱域名不允许注册',
  'password is too short': '密码长度过短',
  'email verification code is required': '请输入邮箱验证码',
  'invalid or expired email verification code': '邮箱验证码无效或已过期',
  'email verification is disabled': '当前未启用邮箱验证',
  'email service is unavailable': '邮件服务暂不可用',
  'failed to send email verification code': '发送邮箱验证码失败',
  'email code requested too frequently': '邮箱验证码请求过于频繁，请稍后再试',
  'email code request rate limit exceeded': '邮箱验证码请求次数已达上限，请稍后再试',
  'user banned': '账号已被封禁',
  'missing bearer token': '缺少登录凭证',
  'not authenticated': '当前未登录',
  'not logged in': '请先登录',
  unauthorized: '未登录或登录状态已失效',
  'admin only': '仅管理员可访问',
  'insufficient permission': '当前账号无权执行此操作',
}

const PREFIX_MESSAGE_MAP = [
  ['invalid token', '登录状态已失效'],
  ['unknown key', '未知配置项'],
  ['invalid email', '邮箱格式有误'],
  ['file is required', '缺少上传文件'],
] as const

function normalizePath(url?: string) {
  return url || ''
}

function replacePrefix(message: string) {
  for (const [prefix, translated] of PREFIX_MESSAGE_MAP) {
    if (message.startsWith(prefix + ':') || message.startsWith(prefix + '：')) {
      return translated + '：' + message.slice(prefix.length + 1).trim()
    }
  }
  return message
}

export function localizeApiMessage(message?: string, requestUrl?: string) {
  const raw = (message || '').trim()
  if (!raw) return raw
  const path = normalizePath(requestUrl)
  if (!path.includes('/api/')) return raw
  if (path.includes('/v1/')) return raw
  return EXACT_MESSAGE_MAP[raw] || replacePrefix(raw)
}
```

- [ ] **Step 2: 在请求层接入最小修改**

```ts
import { localizeApiMessage } from '../utils/api-message'

const reqUrl = (response.config.url || '') as string
const msg = localizeApiMessage(payload.message || `请求失败 (code=${payload.code})`, reqUrl)

const reqUrl = (error.config?.url || '') as string
const msg = localizeApiMessage(payload?.message || error.message || '网络错误', reqUrl)
```

并确保以下位置统一使用转换后的 `msg`：

```ts
ElMessage.error(msg)
return Promise.reject(new ApiError(msg, { ... }))
redirectToLogin(msg || '登录已失效')
```

- [ ] **Step 3: 运行测试确认通过**

Run: `node --test web/tests/api-message-localization.node.test.mjs`
Expected: PASS

### Task 3: 回归现有认证请求层约束

**Files:**
Modify: `web/src/api/http.ts`
Test: `node --test web/tests/auth-refresh.node.test.mjs web/tests/api-message-localization.node.test.mjs`

- [ ] **Step 1: 运行回归测试**

Run: `node --test web/tests/auth-refresh.node.test.mjs web/tests/api-message-localization.node.test.mjs`
Expected: PASS

- [ ] **Step 2: 如测试暴露提示分支不一致，做最小整理**

```ts
const requestUrl = ((error.config as RetryAxiosRequestConfig | undefined)?.url || '') as string
const localized = localizeApiMessage(rawMessage, requestUrl)
```

统一在 401、403、默认分支复用同一个 `localized` 变量，避免再次出现局部硬编码翻译。

- [ ] **Step 3: 再次运行回归测试**

Run: `node --test web/tests/auth-refresh.node.test.mjs web/tests/api-message-localization.node.test.mjs`
Expected: PASS
