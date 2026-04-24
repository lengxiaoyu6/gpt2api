import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

test('历史任务页面显式引入 Element Plus 消息组件，保证构建期类型可见', () => {
  const pageVue = read('web/src/views/personal/HistoryTasks.vue')
  assert.match(pageVue, /import\s+\{\s*ElMessage\s*,\s*ElMessageBox\s*\}\s+from 'element-plus'/)
})
