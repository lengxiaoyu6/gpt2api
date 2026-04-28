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

test('登录页默认跳转后台首页，并在提交后执行管理员身份校验', () => {
  const loginVue = read('web/src/views/auth/Login.vue')

  assert.match(loginVue, /await store\.login\(form\.email, form\.password\)/)
  assert.match(loginVue, /await store\.assertAdminAccess\(\)/)
  assert.match(loginVue, /const redirect = \(route\.query\.redirect as string\) \|\| '\/admin\/dashboard'/)
  assert.doesNotMatch(loginVue, /\/personal\/dashboard/)
})

test('用户状态仓库提供管理员会话校验与后台菜单派生', () => {
  const userStore = read('web/src/stores/user.ts')

  assert.match(userStore, /function cloneMenuItem\(/)
  assert.match(userStore, /function buildAdminMenu\(items: authApi\.MenuItem\[\]\)/)
  assert.match(userStore, /key: 'admin\.dashboard'/)
  assert.match(userStore, /path: '\/admin\/dashboard'/)
  assert.match(userStore, /const adminMenu = computed<authApi\.MenuItem\[\]>\(\(\) => buildAdminMenu\(menu\.value\)\)/)
  assert.match(userStore, /async function assertAdminAccess\(\)/)
  assert.match(userStore, /if \(role\.value === 'admin'\) return/)
  assert.match(userStore, /clear\(\)/)
  assert.match(userStore, /throw new Error\('仅管理员可访问后台'\)/)
})

test('注册页与公开营销布局源码已经从 web 端移除', () => {
  assert.equal(exists('web/src/views/auth/Register.vue'), false)
  assert.equal(exists('web/src/layouts/PublicLayout.vue'), false)
  assert.equal(exists('web/src/views/public/Home.vue'), false)
  assert.equal(exists('web/src/views/public/Showcase.vue'), false)
  assert.equal(exists('web/src/views/public/Pricing.vue'), false)
})
