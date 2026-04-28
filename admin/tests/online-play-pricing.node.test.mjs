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

test('普通用户模型列表返回图片单张价格字段', () => {
  const handlerGo = read('internal/model/admin_handler.go')
  assert.match(handlerGo, /ImagePricePerCall\s+int64\s+`json:"image_price_per_call"`/)
  assert.match(handlerGo, /ImagePricePerCall2K\s+int64\s+`json:"image_price_per_call_2k"`/)
  assert.match(handlerGo, /ImagePricePerCall4K\s+int64\s+`json:"image_price_per_call_4k"`/)
  assert.match(handlerGo, /ImagePricePerCall:\s*m\.ImagePricePerCall/)
  assert.match(handlerGo, /ImagePricePerCall2K:\s*m\.ImagePricePerCall2K/)
  assert.match(handlerGo, /ImagePricePerCall4K:\s*m\.ImagePricePerCall4K/)
  assert.match(handlerGo, /SupportsMultiImage\s+bool\s+`json:"supports_multi_image"`/)
  assert.match(handlerGo, /SupportsOutputSize\s+bool\s+`json:"supports_output_size"`/)
  assert.match(handlerGo, /SupportsMultiImage:\s*m\.SupportsMultiImage/)
  assert.match(handlerGo, /SupportsOutputSize:\s*m\.SupportsOutputSize/)
})

test('普通用户模型列表返回图片上游渠道能力字段', () => {
  const handlerGo = read('internal/model/admin_handler.go')
  const apiTs = read('web/src/api/me.ts')
  assert.match(handlerGo, /rows, err := h\.dao\.ListEnabledForMe\(c\.Request\.Context\(\)\)/)
  assert.match(handlerGo, /HasImageChannel\s+bool\s+`json:"has_image_channel"`/)
  assert.match(handlerGo, /HasImageChannel:\s*m\.HasImageChannel/)
  assert.match(apiTs, /has_image_channel\?:\s*boolean/)
})

test('前端模型类型包含图片价格与能力字段', () => {
  const apiTs = read('web/src/api/me.ts')
  assert.match(apiTs, /image_price_per_call:\s*number/)
  assert.match(apiTs, /image_price_per_call_2k\??:\s*number/)
  assert.match(apiTs, /image_price_per_call_4k\??:\s*number/)
  assert.match(apiTs, /supports_multi_image\?:\s*boolean/)
  assert.match(apiTs, /supports_output_size\?:\s*boolean/)
})

test('管理端模型类型与页面包含多档图片价格字段', () => {
  const statsTs = read('admin/src/api/stats.ts')
  const modelsVue = read('admin/src/views/admin/Models.vue')
  assert.match(statsTs, /image_price_per_call_2k\??:\s*number/)
  assert.match(statsTs, /image_price_per_call_4k\??:\s*number/)
  assert.match(statsTs, /supports_multi_image\?:\s*boolean/)
  assert.match(statsTs, /supports_output_size\?:\s*boolean/)
  assert.match(modelsVue, /image_price_per_call_2k/)
  assert.match(modelsVue, /image_price_per_call_4k/)
  assert.match(modelsVue, /supports_multi_image/)
  assert.match(modelsVue, /supports_output_size/)
  assert.match(modelsVue, /1K\s*\/\s*张/)
  assert.match(modelsVue, /2K\s*\/\s*张/)
  assert.match(modelsVue, /4K\s*\/\s*张/)
})

test('旧个人中心在线体验与接口文档路由已经收口到登录页', () => {
  const routerTs = read('admin/src/router/index.ts')
  assert.match(routerTs, /path: '\/personal\/:pathMatch\(\.\*\)\*',\s*redirect: '\/login'/)
  assert.doesNotMatch(routerTs, /OnlinePlay\.vue/)
  assert.doesNotMatch(routerTs, /ApiDocs\.vue/)
  assert.doesNotMatch(routerTs, /views\/personal/)
})

test('web 端在线体验页面源码已从后台专用版本裁剪', () => {
  assert.equal(exists('admin/src/views/personal/OnlinePlay.vue'), false)
})

test('web 端接口文档页面源码已从后台专用版本裁剪', () => {
  assert.equal(exists('admin/src/views/personal/ApiDocs.vue'), false)
})

