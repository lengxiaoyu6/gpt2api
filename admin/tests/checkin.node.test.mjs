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

test('签到接口在 me API 中声明', () => {
  const apiTs = read('web/src/api/me.ts')
  assert.match(apiTs, /export interface CheckinStatus/)
  assert.match(apiTs, /export function getMyCheckinStatus\(\) \{/)
  assert.match(apiTs, /http\.get\('\/api\/me\/checkin'\)/)
  assert.match(apiTs, /export function checkinToday\(\) \{/)
  assert.match(apiTs, /http\.post\('\/api\/me\/checkin'\)/)
})

test('签到接口挂载到当前用户路由并复用 self:profile 权限', () => {
  const routerGo = read('internal/server/router.go')
  assert.match(routerGo, /GET\("\/me\/checkin"/)
  assert.match(routerGo, /POST\("\/me\/checkin"/)
  assert.match(routerGo, /middleware\.RequirePerm\(rbac\.PermSelfProfile\)/)
})

test('系统设置声明每日签到奖励键', () => {
  const modelGo = read('internal/settings/model.go')
  assert.match(modelGo, /AuthDailyCheckinCredits\s+=\s+"auth\.daily_checkin_credits"/)
  assert.match(modelGo, /Label:\s*"每日签到积分"/)
  assert.match(modelGo, /Desc:\s*"单位:厘,10000 = 1 积分;0 = 关闭"/)
})

test('web 端个人总览签到页面源码已从后台专用版本裁剪', () => {
  assert.equal(exists('admin/src/views/personal/Dashboard.vue'), false)
})

test('积分流水类型映射补充签到与管理员调账，旧个人中心使用记录页面已裁剪', () => {
  const creditsVue = read('admin/src/views/admin/Credits.vue')
  assert.match(creditsVue, /checkin:\s*\{\s*label:\s*'签到'/)
  assert.match(creditsVue, /admin_adjust:\s*\{\s*label:\s*'管理员调账'/)
  assert.equal(exists('admin/src/views/personal/Usage.vue'), false)
})
