import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

test('登录页与注册页切换为营销风格认证卡片', () => {
  const loginVue = read('web/src/views/auth/Login.vue')
  const registerVue = read('web/src/views/auth/Register.vue')
  assert.match(loginVue, /返回首页/)
  assert.match(loginVue, /欢迎回来/)
  assert.match(loginVue, /确认登录/)
  assert.match(registerVue, /返回首页/)
  assert.match(registerVue, /加入/)
  assert.match(registerVue, /立即创建账户/)
})

test('登录页与注册页保留现有认证接线', () => {
  const loginVue = read('web/src/views/auth/Login.vue')
  const registerVue = read('web/src/views/auth/Register.vue')
  assert.match(loginVue, /store\.login\(/)
  assert.match(loginVue, /route\.query\.redirect/)
  assert.match(registerVue, /store\.register\(/)
  assert.match(registerVue, /await store\.login\(/)
})
