import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')

function exists(path) {
  return existsSync(resolve(root, path))
}

test('web 端历史任务页面源码已从后台专用版本裁剪', () => {
  assert.equal(exists('web/src/views/personal/HistoryTasks.vue'), false)
})

