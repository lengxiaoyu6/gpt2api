import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

test('兑换码后端路由与后台菜单已声明', () => {
  const routerGo = read('internal/server/router.go')
  const menuGo = read('internal/rbac/menu.go')

  assert.match(routerGo, /POST\("\/redeem-codes",\s*d\.RedeemH\.Redeem\)/)
  assert.match(routerGo, /admin\.Group\("\/redeem-codes",\s*middleware\.RequirePerm\(rbac\.PermRechargeManage\)\)/)
  assert.match(routerGo, /GET\("",\s*d\.AdminRedeemH\.List\)/)
  assert.match(routerGo, /POST\("\/generate",\s*d\.AdminRedeemH\.Generate\)/)

  assert.match(menuGo, /Key:\s*"admin\.redeem-codes"/)
  assert.match(menuGo, /Title:\s*"兑换码"/)
  assert.match(menuGo, /Path:\s*"\/admin\/redeem-codes"/)
  assert.match(menuGo, /Perms:\s*\[]Permission\{PermRechargeManage\}/)
})

test('兑换码前端 API 声明用户核销与后台管理方法', () => {
  const apiTs = read('web/src/api/recharge.ts')

  assert.match(apiTs, /export interface RedeemCode\s*\{/)
  assert.match(apiTs, /export interface RedeemResult\s*\{/)
  assert.match(apiTs, /export function redeemCode\(code: string\): Promise<RedeemResult> \{/)
  assert.match(apiTs, /http\.post\('\/api\/recharge\/redeem-codes', \{ code \}\)/)
  assert.match(apiTs, /export function adminListRedeemCodes\(/)
  assert.match(apiTs, /http\.get\('\/api\/admin\/redeem-codes', \{ params \}\)/)
  assert.match(apiTs, /export function adminGenerateRedeemCodes\(/)
  assert.match(apiTs, /http\.post\('\/api\/admin\/redeem-codes\/generate', payload\)/)
})

test('后台静态路由包含兑换码页面', () => {
  const routerTs = read('web/src/router/index.ts')
  assert.match(routerTs, /path:\s*'redeem-codes'/)
  assert.match(routerTs, /RedeemCodes\.vue/)
  assert.match(routerTs, /title:\s*'兑换码'/)
  assert.match(routerTs, /perm:\s*'recharge:manage'/)
})

test('后台兑换码页面包含生成表单与列表展示', () => {
  const pageVue = read('web/src/views/admin/RedeemCodes.vue')
  assert.match(pageVue, /adminGenerateRedeemCodes/)
  assert.match(pageVue, /adminListRedeemCodes/)
  assert.match(pageVue, /生成兑换码/)
  assert.match(pageVue, /批次号/)
  assert.match(pageVue, /兑换码/)
  assert.match(pageVue, /使用者/)
  assert.match(pageVue, /使用时间/)
})

test('个人账单页包含兑换码输入与核销交互', () => {
  const pageVue = read('web/src/views/personal/Billing.vue')
  assert.match(pageVue, /redeemCode\(/)
  assert.match(pageVue, /await userStore\.fetchMe\(\)/)
  assert.match(pageVue, /兑换码/)
  assert.match(pageVue, /立即兑换/)
  assert.match(pageVue, /到账/)
})
