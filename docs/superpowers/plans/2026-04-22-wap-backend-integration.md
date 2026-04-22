# Wap Backend Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `wap` 目录接入现有后端认证、用户、签到、图片生成与历史任务接口，并保持现有页面样式结构。

**Architecture:** `wap` 新增与 `web` 对齐的 API 层，统一处理 token、响应解包与鉴权失效；`zustand` store 负责启动恢复、认证串联、模型选择、历史拉取与页面协调；组件层保留现有布局和 class，只替换字段绑定、事件逻辑与异常提示。

**Tech Stack:** React 19、TypeScript、Vite 6、Zustand、Axios、Vitest、Testing Library、Sonner

---

### Task 1: 建立测试基建与首批失败用例

**Files:**
Create: `wap/vitest.config.ts`
Create: `wap/src/test/setup.ts`
Create: `wap/src/api/http.test.ts`
Create: `wap/src/store/useStore.test.ts`
Modify: `wap/package.json`
Test: `cd wap && npm run test -- --run src/api/http.test.ts src/store/useStore.test.ts`

- [ ] **Step 1: 在包配置中加入测试依赖与脚本**

```json
{
  "scripts": {
    "test": "vitest"
  },
  "devDependencies": {
    "vitest": "^3.2.4",
    "jsdom": "^26.1.0",
    "@testing-library/react": "^16.3.0",
    "@testing-library/jest-dom": "^6.6.3"
  }
}
```

- [ ] **Step 2: 新建 Vitest 配置与浏览器测试初始化**

```ts
// wap/vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    clearMocks: true,
  },
})
```

```ts
// wap/src/test/setup.ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 3: 先写 http 层失败用例，覆盖 token 注入、401 清理与 envelope 解包**

```ts
test('request helper attaches bearer token and unwraps data payload', async () => {
  localStorage.setItem('gpt2api.access', 'token-1')
  mock.onGet('/api/me').reply((config) => {
    expect(config.headers?.Authorization).toBe('Bearer token-1')
    return [200, { code: 0, message: 'ok', data: { ok: true } }]
  })
  await expect(http.get('/api/me')).resolves.toEqual({ ok: true })
})

test('401 handler clears tokens and notifies auth reset callback', async () => {
  localStorage.setItem('gpt2api.access', 'token-1')
  localStorage.setItem('gpt2api.refresh', 'token-2')
  const onUnauthorized = vi.fn()
  setUnauthorizedHandler(onUnauthorized)
  mock.onGet('/api/me').reply(401, { message: 'expired' })
  await expect(http.get('/api/me')).rejects.toThrow()
  expect(localStorage.getItem('gpt2api.access')).toBeNull()
  expect(onUnauthorized).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 4: 先写 store 失败用例，覆盖启动恢复、匿名受保护页拦截、登录串联与尺寸映射**

```ts
test('bootstrap loads site info and keeps anonymous state without token', async () => {
  await useStore.getState().bootstrapApp()
  expect(useStore.getState().siteInfo['site.name']).toBe('GPT2API')
  expect(useStore.getState().user).toBeNull()
  expect(useStore.getState().bootstrapStatus).toBe('ready')
})

test('openAuthForTab records pending protected tab and opens overlay', () => {
  useStore.getState().openAuthForTab('history')
  expect(useStore.getState().pendingTab).toBe('history')
  expect(useStore.getState().authOverlayOpen).toBe(true)
})

test('generateImage uses mapped size 1792x1024 for 16:9 and refreshes me plus history', async () => {
  await useStore.getState().generateImage({ prompt: 'night city', aspectRatio: '16:9' })
  expect(playGenerateImage).toHaveBeenCalledWith(expect.objectContaining({ size: '1792x1024' }))
  expect(fetchMe).toHaveBeenCalled()
  expect(fetchHistory).toHaveBeenCalled()
})
```

- [ ] **Step 5: 运行测试确认失败原因准确**

Run: `cd wap && npm run test -- --run src/api/http.test.ts src/store/useStore.test.ts`
Expected: FAIL，提示缺少测试配置、API 工具或 store 行为。

### Task 2: 实现 API 层与请求基础设施

**Files:**
Create: `wap/src/api/http.ts`
Create: `wap/src/api/auth.ts`
Create: `wap/src/api/site.ts`
Create: `wap/src/api/me.ts`
Modify: `wap/vite.config.ts`
Test: `cd wap && npm run test -- --run src/api/http.test.ts`

- [ ] **Step 1: 建立统一请求实例与 token 常量**

```ts
export const TOKEN_KEY = 'gpt2api.access'
export const REFRESH_KEY = 'gpt2api.refresh'

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '',
  timeout: 30_000,
})
```

- [ ] **Step 2: 在请求与响应拦截器中实现 token 注入、envelope 解包与 401 回调**

```ts
let unauthorizedHandler: (() => void) | null = null
export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler
}
```

```ts
if (status === 401) {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
  unauthorizedHandler?.()
}
```

- [ ] **Step 3: 新增认证、站点、用户、签到、模型、任务、图片生成与图生图 API 封装**

```ts
export function login(req: { email: string; password: string }) {
  return http.post('/api/auth/login', req)
}

export function fetchSiteInfo() {
  return http.get('/api/public/site-info')
}

export function listMyImageTasks(params = { limit: 20, offset: 0 }) {
  return http.get('/api/me/images/tasks', { params })
}
```

```ts
export async function playEditImage(model: string, prompt: string, file: File, size: string) {
  const fd = new FormData()
  fd.append('model', model)
  fd.append('prompt', prompt)
  fd.append('size', size)
  fd.append('image', file, file.name)
  return fetch('/api/me/playground/image-edit', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd })
}
```

- [ ] **Step 4: 在开发代理中补齐 `/api` 与 `/p/img` 转发，移除 Gemini 注入定义**

```ts
server: {
  hmr: process.env.DISABLE_HMR !== 'true',
  proxy: {
    '/api': { target: env.VITE_PROXY_TARGET || 'http://127.0.0.1:8080', changeOrigin: true },
    '/p/img': { target: env.VITE_PROXY_TARGET || 'http://127.0.0.1:8080', changeOrigin: true },
  },
}
```

- [ ] **Step 5: 运行 http 测试确认转绿**

Run: `cd wap && npm run test -- --run src/api/http.test.ts`
Expected: PASS。

### Task 3: 重写 store 为真实业务状态协调层

**Files:**
Modify: `wap/src/store/useStore.ts`
Test: `cd wap && npm run test -- --run src/store/useStore.test.ts`

- [ ] **Step 1: 定义真实状态模型与持久化白名单**

```ts
export type TabKey = 'home' | 'generate' | 'history' | 'profile'
export type BootstrapStatus = 'idle' | 'loading' | 'ready' | 'error'

siteInfo: Record<string, string>
bootstrapStatus: BootstrapStatus
user: MeUser | null
checkin: CheckinState | null
imageModels: ImageModel[]
selectedImageModel: string | null
history: ImageTask[]
authOverlayOpen: boolean
pendingTab: TabKey
activeTab: TabKey
```

- [ ] **Step 2: 实现 `bootstrapApp`、`applyLoginSession`、`resetAuthState` 与匿名启动分支**

```ts
async function bootstrapApp() {
  set({ bootstrapStatus: 'loading' })
  await get().fetchSiteInfo()
  if (!localStorage.getItem(TOKEN_KEY)) {
    set({ bootstrapStatus: 'ready' })
    return
  }
  await get().fetchMe()
  await Promise.allSettled([get().fetchCheckin(), get().fetchImageModels()])
  set({ bootstrapStatus: 'ready' })
}
```

- [ ] **Step 3: 实现登录、注册、退出、签到、历史拉取与模型选择规则**

```ts
async function register(input) {
  await authApi.register(input)
  await get().login({ email: input.email, password: input.password })
}
```

```ts
const available = models.items.filter((item) => item.type === 'image')
const nextModel = available.some((item) => item.slug === state.selectedImageModel)
  ? state.selectedImageModel
  : available[0]?.slug ?? null
```

- [ ] **Step 4: 实现文生图与图生图动作，并在成功后刷新用户与历史**

```ts
const size = ASPECT_RATIO_TO_SIZE[input.aspectRatio]
const result = await meApi.playGenerateImage({ model, prompt: input.prompt, size, n: 1 })
await Promise.allSettled([get().fetchMe(), get().fetchHistory(true)])
return result
```

```ts
const result = await meApi.playEditImage(model, input.prompt, input.file, size)
await Promise.allSettled([get().fetchMe(), get().fetchHistory(true)])
return result
```

- [ ] **Step 5: 运行 store 测试确认转绿**

Run: `cd wap && npm run test -- --run src/store/useStore.test.ts`
Expected: PASS。

### Task 4: 调整页面组件接入真实状态

**Files:**
Modify: `wap/src/App.tsx`
Modify: `wap/src/components/AuthOverlay.tsx`
Modify: `wap/src/components/views/Generate.tsx`
Modify: `wap/src/components/views/History.tsx`
Modify: `wap/src/components/views/Profile.tsx`
Modify: `wap/src/components/views/Home.tsx`
Test: `cd wap && npm run test -- --run src/components/app.integration.test.tsx`

- [ ] **Step 1: 新增应用级集成测试，先写失败断言**

```ts
test('anonymous navigation to history opens auth overlay and keeps current tab', async () => {
  render(<App />)
  await user.click(screen.getByRole('button', { name: '记录' }))
  expect(screen.getByText('欢迎回来')).toBeInTheDocument()
  expect(useStore.getState().pendingTab).toBe('history')
})

test('home page only renders two capability cards', () => {
  render(<HomeView onStartGeneration={() => {}} />)
  expect(screen.getByText('文生图')).toBeInTheDocument()
  expect(screen.getByText('图生图')).toBeInTheDocument()
  expect(screen.queryByText('极致优化')).toBeNull()
})
```

- [ ] **Step 2: 在 `App.tsx` 中接管启动、导航、认证弹层与积分显示**

```ts
const { user, bootstrapApp, authOverlayOpen, closeAuth, activeTab, setActiveTab, openAuthForTab } = useStore()
useEffect(() => { void bootstrapApp() }, [bootstrapApp])
```

- [ ] **Step 3: 在 `AuthOverlay.tsx` 中改为邮箱密码登录与昵称邮箱密码注册**

```ts
const allowRegister = parseAllowRegister(siteInfo)
await login({ email, password })
await register({ nickname, email, password })
```

- [ ] **Step 4: 在生成、历史、个人中心、首页中改为真实数据与真实动作**

```ts
await generateImage({ prompt, aspectRatio })
await editImage({ prompt, aspectRatio, file })
```

```ts
const filtered = history.filter((item) => item.prompt.toLowerCase().includes(search.toLowerCase()))
const previewUrl = task.image_urls?.[0] || ''
```

```ts
<Button onClick={() => submitCheckin()} disabled={!checkin?.enabled || checkin?.checked_in}>每日签到</Button>
```

- [ ] **Step 5: 运行集成测试确认页面行为转绿**

Run: `cd wap && npm run test -- --run src/components/app.integration.test.tsx`
Expected: PASS。

### Task 5: 清理旧逻辑并执行完整验证

**Files:**
Modify: `wap/package.json`
Delete: `wap/src/lib/gemini.ts`
Delete: `wap/src/lib/gemini.test.ts`
Create: `docs/superpowers/plans/2026-04-22-wap-backend-integration.md`
Modify: `wap/src/api/http.ts`
Modify: `wap/src/api/auth.ts`
Modify: `wap/src/api/site.ts`
Modify: `wap/src/api/me.ts`
Modify: `wap/src/store/useStore.ts`
Modify: `wap/src/App.tsx`
Modify: `wap/src/components/AuthOverlay.tsx`
Modify: `wap/src/components/views/Generate.tsx`
Modify: `wap/src/components/views/History.tsx`
Modify: `wap/src/components/views/Profile.tsx`
Modify: `wap/src/components/views/Home.tsx`
Modify: `wap/vite.config.ts`
Create: `wap/vitest.config.ts`
Create: `wap/src/test/setup.ts`
Create: `wap/src/api/http.test.ts`
Create: `wap/src/store/useStore.test.ts`
Create: `wap/src/components/app.integration.test.tsx`

- [ ] **Step 1: 移除 Gemini 业务依赖与遗留测试**

```bash
rm -f wap/src/lib/gemini.ts wap/src/lib/gemini.test.ts
```

- [ ] **Step 2: 运行类型检查与测试**

Run: `cd wap && npm run lint`
Expected: PASS。

Run: `cd wap && npm run test -- --run`
Expected: PASS。

- [ ] **Step 3: 运行构建验证**

Run: `cd wap && npm run build`
Expected: PASS。

- [ ] **Step 4: 核对改动范围**

Run: `cd /root/code/gpt2api && git diff -- wap/package.json wap/vite.config.ts wap/vitest.config.ts wap/src/App.tsx wap/src/components/AuthOverlay.tsx wap/src/components/views/Generate.tsx wap/src/components/views/History.tsx wap/src/components/views/Profile.tsx wap/src/components/views/Home.tsx wap/src/store/useStore.ts wap/src/api/http.ts wap/src/api/auth.ts wap/src/api/site.ts wap/src/api/me.ts wap/src/test/setup.ts wap/src/api/http.test.ts wap/src/store/useStore.test.ts wap/src/components/app.integration.test.tsx docs/superpowers/plans/2026-04-22-wap-backend-integration.md`
Expected: diff 仅包含 `wap` 后端接入、测试基建与计划文档。
