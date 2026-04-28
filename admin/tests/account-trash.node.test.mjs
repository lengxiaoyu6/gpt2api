import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

test('账号 DAO 支持已删除列表恢复与彻底删除', () => {
  const daoGo = read('internal/account/dao.go')
  assert.match(daoGo, /func \(d \*DAO\) ListDeleted\(/)
  assert.match(daoGo, /deleted_at IS NOT NULL/)
  assert.match(daoGo, /func \(d \*DAO\) Restore\(/)
  assert.match(daoGo, /SET deleted_at = NULL WHERE id = \? AND deleted_at IS NOT NULL/)
  assert.match(daoGo, /func \(d \*DAO\) Purge\(/)
  assert.match(daoGo, /DELETE FROM oai_account_cookies WHERE account_id = \?/) 
  assert.match(daoGo, /DELETE FROM account_proxy_bindings WHERE account_id = \?/) 
  assert.match(daoGo, /DELETE FROM account_quota_snapshots WHERE account_id = \?/) 
  assert.match(daoGo, /DELETE FROM oai_accounts WHERE id = \? AND deleted_at IS NOT NULL/)
})

test('账号池路由挂载已删除列表恢复与彻底删除接口', () => {
  const routerGo = read('internal/server/router.go')
  assert.match(routerGo, /ag\.GET\("\/deleted", d\.AccountH\.ListDeleted\)/)
  assert.match(routerGo, /ag\.POST\("\/:id\/restore", .*d\.AccountH\.Restore\)/)
  assert.match(routerGo, /ag\.DELETE\("\/:id\/purge", .*d\.AccountH\.Purge\)/)
})

test('前端 API 暴露已删除列表恢复与彻底删除方法', () => {
  const apiTs = read('admin/src/api/accounts.ts')
  assert.match(apiTs, /deleted_at\?:\s*\{ Time: string; Valid: boolean \} \| string \| null/)
  assert.match(apiTs, /export function listDeletedAccounts\(/)
  assert.match(apiTs, /export function restoreAccount\(/)
  assert.match(apiTs, /export function purgeAccount\(/)
})

test('账号池页面提供已删除标签与恢复清理操作', () => {
  const pageVue = read('admin/src/views/admin/Accounts.vue')
  assert.match(pageVue, /label="已删除"/)
  assert.match(pageVue, /恢复/)
  assert.match(pageVue, /彻底删除/)
  assert.match(pageVue, /已删除列表/)
})

test('账号池页面已清除冲突标记并保留额度信息列', () => {
  const pageVue = read('admin/src/views/admin/Accounts.vue')
  assert.doesNotMatch(pageVue, /^(<<<<<<<|=======|>>>>>>>) /m)
  assert.match(pageVue, /label="类型"/)
  assert.match(pageVue, /label="凭证"/)
  assert.match(pageVue, /label="今日已用 \/ 上限"/)
  assert.match(pageVue, /熔断阈值\(仅用于停止派发\)/)
  assert.match(pageVue, /待探测/)
})
