import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

test('个人中心菜单树包含安全中心入口', () => {
  const menuGo = read('internal/rbac/menu.go')
  assert.match(menuGo, /Key:\s*"personal\.security"/)
  assert.match(menuGo, /Title:\s*"安全中心"/)
  assert.match(menuGo, /Path:\s*"\/personal\/security"/)
  assert.match(menuGo, /Perms:\s*\[]Permission\{PermSelfProfile\}/)
})

test('个人中心静态路由包含安全中心页面', () => {
  const routerTs = read('web/src/router/index.ts')
  assert.match(routerTs, /path:\s*'security'/)
  assert.match(routerTs, /Security\.vue/)
  assert.match(routerTs, /title:\s*'安全中心'/)
  assert.match(routerTs, /perm:\s*'self:profile'/)
})

test('me API 增加修改密码请求封装', () => {
  const apiTs = read('web/src/api/me.ts')
  assert.match(apiTs, /export function changeMyPassword\(/)
  assert.match(apiTs, /http\.post\('\/api\/me\/change-password', req\)/)
})

test('安全中心页面包含统一页面布局、三项密码字段与提交成功后的重新登录处理', () => {
  const pageVue = read('web/src/views/personal/Security.vue')
  assert.match(pageVue, /class="page-container security-page"/)
  assert.match(pageVue, /class="card-block security-hero"/)
  assert.match(pageVue, /class="card-block security-panel"/)
  assert.match(pageVue, /class="flex-between security-panel__header"/)
  assert.match(pageVue, /原密码/)
  assert.match(pageVue, /新密码/)
  assert.match(pageVue, /确认新密码/)
  assert.match(pageVue, /changeMyPassword\(/)
  assert.match(pageVue, /await store\.logout\(\)/)
  assert.match(pageVue, /router\.replace\('\/login'\)/)
})
