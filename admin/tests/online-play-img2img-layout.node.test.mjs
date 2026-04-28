import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

function exists(path) {
  return existsSync(resolve(root, path))
}

test('旧个人中心在线体验路由已经收口到登录页', () => {
  const routerTs = read('admin/src/router/index.ts')
  assert.match(routerTs, /path: '\/personal\/:pathMatch\(\.\*\)\*',\s*redirect: '\/login'/)
  assert.doesNotMatch(routerTs, /OnlinePlay\.vue/)
  assert.doesNotMatch(routerTs, /views\/personal/)
})

test('在线体验相关 API 类型仍保留图生图请求与缩略图字段', () => {
  const apiTs = read('web/src/api/me.ts')
  assert.match(apiTs, /reference_images\?: string\[\]/)
  assert.match(apiTs, /thumb_url\?: string/)
  assert.match(apiTs, /export async function playEditImage\(/)
})

test('web 端在线体验页面源码已从后台专用版本裁剪', () => {
  assert.equal(exists('admin/src/views/personal/OnlinePlay.vue'), false)
})

