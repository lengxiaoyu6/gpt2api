import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

function exists(path) {
  return existsSync(resolve(root, path))
}

test('个人中心菜单树包含安全中心入口', () => {
  const menuGo = read('internal/rbac/menu.go')
  assert.match(menuGo, /Key:\s*"personal\.security"/)
  assert.match(menuGo, /Title:\s*"安全中心"/)
  assert.match(menuGo, /Path:\s*"\/personal\/security"/)
  assert.match(menuGo, /Perms:\s*\[]Permission\{PermSelfProfile\}/)
})

test('旧个人中心路由已经收口到登录页，且不再引用安全中心页面源码', () => {
  const routerTs = read('web/src/router/index.ts')
  assert.match(routerTs, /path: '\/personal\/:pathMatch\(\.\*\)\*',\s*redirect: '\/login'/)
  assert.doesNotMatch(routerTs, /Security\.vue/)
  assert.doesNotMatch(routerTs, /views\/personal/)
})

test('me API 增加修改密码请求封装', () => {
  const apiTs = read('web/src/api/me.ts')
  assert.match(apiTs, /export function changeMyPassword\(/)
  assert.match(apiTs, /http\.post\('\/api\/me\/change-password', req\)/)
})

test('web 端安全中心页面源码已从后台专用版本裁剪', () => {
  assert.equal(exists('web/src/views/personal/Security.vue'), false)
})

