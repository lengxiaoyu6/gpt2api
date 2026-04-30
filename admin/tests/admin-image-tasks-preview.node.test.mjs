import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

test('admin 图片任务类型包含预览图字段', () => {
  const apiTs = read('admin/src/api/admin.ts')
  assert.match(apiTs, /preview_urls_parsed: string\[\]/)
})

test('admin 图片任务页面展示与预览使用预览图字段，下载仍使用原图字段', () => {
  const pageVue = read('admin/src/views/admin/ImageTasks.vue')
  assert.match(pageVue, /preview_urls_parsed: string\[\]/)
  assert.match(pageVue, /previewRow\.value\?\.preview_urls_parsed \|\| \[\]/)
  assert.match(pageVue, /row\.preview_urls_parsed\?\.length/)
  assert.match(pageVue, /row\.preview_urls_parsed\.slice\(0, 3\)/)
  assert.match(pageVue, /:src=\"url\"/)
  assert.doesNotMatch(pageVue, /withThumb\(/)
  assert.match(pageVue, /const urls = row\.result_urls_parsed \|\| \[\]/)
})
