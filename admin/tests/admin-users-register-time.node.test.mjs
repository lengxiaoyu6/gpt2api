import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

test('admin 用户列表展示注册时间列', () => {
  const pageVue = read('admin/src/views/admin/Users.vue')
  assert.match(pageVue, /<el-table-column label="注册时间"/)
  assert.match(pageVue, /formatDateTime\(row\.created_at\)/)
})
