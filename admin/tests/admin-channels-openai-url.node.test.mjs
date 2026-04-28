import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

test('管理后台要求 OpenAI 渠道填写完整 endpoint URL', () => {
  const view = read('web/src/views/admin/Channels.vue')
  assert.match(view, /https:\/\/api\.openai\.com\/v1\/images\/generations/)
  assert.match(view, /https:\/\/api\.openai\.com\/v1\/chat\/completions/)
  assert.match(view, /https:\/\/api\.openai\.com\/v1\/responses/)
  assert.doesNotMatch(view, /由系统自动拼接/)
})

test('README 说明 OpenAI 渠道使用完整 endpoint URL', () => {
  const readme = read('README.md')
  assert.match(readme, /图片渠道可使用 `\/v1\/images\/generations`/)
  assert.match(readme, /文本或图片渠道都可填写 `\/v1\/responses`/)
  assert.doesNotMatch(readme, /配置根地址即可,系统会自动拼接/)
})
