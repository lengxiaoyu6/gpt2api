import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

test('图片任务 DAO 支持软删除并在查询时过滤已删除记录', () => {
  const daoGo = read('internal/image/dao.go')
  assert.match(daoGo, /func \(d \*DAO\) SoftDeleteByUser\(/)
  assert.match(daoGo, /UPDATE image_tasks\s+SET deleted_at = NOW\(\)\s+WHERE task_id = \? AND user_id = \? AND deleted_at IS NULL/)
  assert.match(daoGo, /WHERE task_id = \? AND deleted_at IS NULL/)
  assert.match(daoGo, /WHERE user_id = \?\s+AND deleted_at IS NULL/)
})

test('当前用户图片任务接口挂载删除能力', () => {
  const handlerGo = read('internal/image/me_handler.go')
  const routerGo = read('internal/server/router.go')
  assert.match(handlerGo, /func \(h \*MeHandler\) Delete\(c \*gin\.Context\)/)
  assert.match(routerGo, /ig\.DELETE\("\/tasks\/:id", d\.MeImageH\.Delete\)/)
})

test('图片任务表迁移增加 deleted_at 字段', () => {
  const migration = read('sql/migrations/20260422000002_image_tasks_soft_delete.sql')
  assert.match(migration, /ALTER TABLE `image_tasks`\s+ADD COLUMN `deleted_at` DATETIME NULL/)
})



test('迁移版本号保持唯一，软删除迁移使用新的版本号', () => {
  const names = readdirSync(resolve(root, 'sql/migrations')).filter((name) => name.endsWith('.sql'))
  const versions = names.map((name) => name.match(/^(\d+)_/)?.[1]).filter(Boolean)
  assert.equal(new Set(versions).size, versions.length)
  assert.ok(names.includes('20260422000002_image_tasks_soft_delete.sql'))
})

test('个人中心图片任务 API 暴露删除方法', () => {
  const apiTs = read('web/src/api/me.ts')
  assert.match(apiTs, /export function deleteMyImageTask\(taskID: string\)/)
  assert.match(apiTs, /http\.delete\(`\/api\/me\/images\/tasks\/\$\{taskID\}`\)/)
})

test('历史任务页面提供删除入口', () => {
  const pageVue = read('web/src/views/personal/HistoryTasks.vue')
  assert.match(pageVue, /async function onDeleteTask\(task: ImageTask\)/)
  assert.match(pageVue, /await deleteMyImageTask\(task\.task_id\)/)
  assert.match(pageVue, /删除后将从历史任务列表隐藏/)
  assert.match(pageVue, /@click\.stop="onDeleteTask\(item\.task\)"/)
  assert.match(pageVue, /删除中\.\.\./)
})
