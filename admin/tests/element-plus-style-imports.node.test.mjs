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

test('Vite 的 Sass 预处理使用 modern-compiler API，消除 legacy JS API 废弃提示', () => {
  const viteConfig = read('web/vite.config.ts')

  assert.match(viteConfig, /preprocessorOptions:\s*\{\s*scss:\s*\{\s*api:\s*['"]modern-compiler['"]/s)
})

test('Vite 的 chunk 体积提示阈值覆盖当前 Element Plus 独立分包体积', () => {
  const viteConfig = read('web/vite.config.ts')
  const match = viteConfig.match(/chunkSizeWarningLimit:\s*(\d+)/)

  assert.ok(match, '缺少 chunkSizeWarningLimit 配置')
  assert.ok(Number(match[1]) >= 1000)
})
