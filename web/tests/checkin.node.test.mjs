import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

test('签到接口在 me API 中声明', () => {
  const apiTs = read('web/src/api/me.ts')
  assert.match(apiTs, /export interface MyCheckinStatus/)
  assert.match(apiTs, /export function getMyCheckinStatus\(\): Promise<MyCheckinStatus> \{/)
  assert.match(apiTs, /http\.get\('\/api\/me\/checkin'\)/)
  assert.match(apiTs, /export function checkinToday\(\): Promise<MyCheckinStatus> \{/)
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

test('个人总览包含每日签到卡片与交互', () => {
  const pageVue = read('web/src/views/personal/Dashboard.vue')
  assert.match(pageVue, /每日签到/)
  assert.match(pageVue, /getMyCheckinStatus/)
  assert.match(pageVue, /checkinToday/)
  assert.match(pageVue, /async function submitCheckin\(/)
  assert.match(pageVue, /today_reward_credits/)
  assert.match(pageVue, /checked_in \? '今日已签到' : '立即签到'/)
})

test('积分流水类型映射补充签到与管理员调账', () => {
  const dashboardVue = read('web/src/views/personal/Dashboard.vue')
  const usageVue = read('web/src/views/personal/Usage.vue')
  const creditsVue = read('web/src/views/admin/Credits.vue')
  assert.match(dashboardVue, /admin_adjust:\s*'调账'/)
  assert.match(dashboardVue, /checkin:\s*'签到'/)
  assert.match(usageVue, /admin_adjust:\s*'调账'/)
  assert.match(usageVue, /checkin:\s*'签到'/)
  assert.match(creditsVue, /checkin:\s*\{\s*label:\s*'签到'/)
})
