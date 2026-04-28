import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

test('开发代理只转发 /p/ 图片签名路径,不会吞掉 /personal 前端路由', () => {
  const viteConfig = read('web/vite.config.ts')
  assert.match(viteConfig, /'\^\/p\/':\s*\{\s*target:\s*apiBase,\s*changeOrigin:\s*true\s*\}/s)
  assert.doesNotMatch(viteConfig, /'\/p':\s*\{/)
})

test('生产 nginx 转发图片签名路径到后端', () => {
  const nginxConf = read('deploy/nginx.conf')
  assert.match(nginxConf, /location \/p\/ \{\s*proxy_pass http:\/\/gpt2api_backend;\s*\}/s)
})

test('后端 SPA 兜底排除图片签名路径', () => {
  const spaGo = read('internal/server/spa.go')
  assert.match(spaGo, /"\/p\/"/)
})
