import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

test('普通用户模型列表返回图片单张价格字段', () => {
  const handlerGo = read('internal/model/admin_handler.go')
  assert.match(handlerGo, /ImagePricePerCall\s+int64\s+`json:"image_price_per_call"`/)
  assert.match(handlerGo, /ImagePricePerCall:\s*m\.ImagePricePerCall/)
})

test('前端模型类型包含 image_price_per_call', () => {
  const apiTs = read('web/src/api/me.ts')
  assert.match(apiTs, /image_price_per_call:\s*number/)
})

test('在线体验页展示单张基准价格提示', () => {
  const playVue = read('web/src/views/personal/OnlinePlay.vue')
  assert.match(playVue, /单张基准价格/)
  assert.match(playVue, /多张生成会按张数累计扣费/)
  assert.match(playVue, /image_price_per_call/)
})


test('在线体验页提供 4:3 画面比例选项', () => {
  const playVue = read('web/src/views/personal/OnlinePlay.vue')
  const optionMatches = playVue.match(/\{ v: '1536x1152', l: '4:3',\s+w: 44, h: 33 \}/g) || []
  assert.equal(optionMatches.length, 2)
})
