import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

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

test('登录页与注册页保留现有认证接线', () => {
  const loginVue = read('web/src/views/auth/Login.vue')
  const registerVue = read('web/src/views/auth/Register.vue')
  assert.match(loginVue, /store\.login\(/)
  assert.match(loginVue, /route\.query\.redirect/)
  assert.match(registerVue, /store\.register\(/)
  assert.match(registerVue, /await store\.login\(/)
})

test('注册页接入邮箱验证码交互', () => {
  const registerVue = read('web/src/views/auth/Register.vue')
  assert.match(registerVue, /email_code/i)
  assert.match(registerVue, /sendEmailCode/i)
  assert.match(registerVue, /sessionStorage/)
  assert.match(registerVue, /retry_after_sec/)
})

test('认证接口扩展邮箱验证码能力', () => {
  const authApi = read('web/src/api/auth.ts')
  const userStore = read('web/src/stores/user.ts')
  assert.match(authApi, /email_code/i)
  assert.match(authApi, /email-code\/send/)
  assert.match(userStore, /emailCode/i)
})

test('站点公开设置暴露邮箱验证开关', () => {
  const siteStore = read('web/src/stores/site.ts')
  assert.match(siteStore, /auth\.require_email_verify/)
  assert.match(siteStore, /requireEmailVerify/)
})
