import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

test('开发环境默认通过 Vite 代理访问后端，避免写死绝对 API 地址触发跨域', () => {
  const envFile = read('admin/.env.development')
  assert.doesNotMatch(envFile, /^VITE_API_BASE=https?:\/\//m)
})
