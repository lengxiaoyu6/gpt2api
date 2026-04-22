import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

test('Vite 的 Element Plus 自动解析关闭按需样式导入，避免重复加载 tab-pane css 模块', () => {
  const viteConfig = read('web/vite.config.ts')
  const matches = viteConfig.match(/ElementPlusResolver\(\{\s*importStyle:\s*false\s*\}\)/g) || []
  assert.equal(matches.length, 2)
})
