import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

test('admin 图片任务类型包含模型字段', () => {
  const apiTs = read('admin/src/api/admin.ts')
  assert.match(apiTs, /model_id: number/)
  assert.match(apiTs, /model_slug\?: string/)
})

test('admin 图片任务页面包含模型列并优先展示 model_slug', () => {
  const pageVue = read('admin/src/views/admin/ImageTasks.vue')
  assert.match(pageVue, /<el-table-column label="模型"/)
  assert.match(pageVue, /row\.model_slug \|\| `#\$\{row\.model_id\}`/)
  assert.match(pageVue, /v-if="row\.model_slug"/)
})
