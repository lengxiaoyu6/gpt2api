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

test('个人中心菜单树包含历史任务入口', () => {
  const menuGo = read('internal/rbac/menu.go')
  assert.match(menuGo, /Key:\s*"personal\.history-tasks"/)
  assert.match(menuGo, /Title:\s*"历史任务"/)
  assert.match(menuGo, /Path:\s*"\/personal\/history-tasks"/)
  assert.match(menuGo, /Perms:\s*\[]Permission\{PermSelfImage\}/)
})

test('旧个人中心历史任务路由已经收口到登录页', () => {
  const routerTs = read('web/src/router/index.ts')
  assert.match(routerTs, /path: '\/personal\/:pathMatch\(\.\*\)\*',\s*redirect: '\/login'/)
  assert.doesNotMatch(routerTs, /HistoryTasks\.vue/)
  assert.doesNotMatch(routerTs, /ApiDocs\.vue/)
  assert.doesNotMatch(routerTs, /views\/personal/)
})

test('个人图片任务 API 仍保留列表、详情与删除方法', () => {
  const apiTs = read('web/src/api/me.ts')
  assert.match(apiTs, /export function listMyImageTasks\(/)
  assert.match(apiTs, /export function getMyImageTask\(taskID: string\)/)
  assert.match(apiTs, /export function deleteMyImageTask\(taskID: string\)/)
})

test('个人图片任务类型仍保留缩略图与耗时相关字段', () => {
  const apiTs = read('web/src/api/me.ts')
  assert.match(apiTs, /thumb_urls: string\[\]/)
  assert.match(apiTs, /started_at\?: string \| null/)
  assert.match(apiTs, /finished_at\?: string \| null/)
})

test('web 端历史任务与接口文档页面源码已从后台专用版本裁剪', () => {
  assert.equal(exists('web/src/views/personal/HistoryTasks.vue'), false)
  assert.equal(exists('web/src/views/personal/ApiDocs.vue'), false)
})

