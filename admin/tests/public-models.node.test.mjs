import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

test('公开路由暴露启用模型列表接口', () => {
  const routerGo = read('internal/server/router.go')
  assert.match(routerGo, /if d\.AdminModelH != nil \{\s*pub\.GET\("\/models", d\.AdminModelH\.ListEnabledForPublic\)\s*\}/s)
})

test('公开模型 handler 返回启用模型的基础信息与按次价格字段', () => {
  const handlerGo = read('internal/model/admin_handler.go')
  const publicHandler = handlerGo.match(/func \(h \*AdminHandler\) ListEnabledForPublic\(c \*gin\.Context\)[\s\S]*?resp\.OK\(c, gin\.H\{"items": out, "total": len\(out\)\}\)\n\}/)?.[0] ?? ''

  assert.notEqual(publicHandler, '')
  assert.match(publicHandler, /func \(h \*AdminHandler\) ListEnabledForPublic\(c \*gin\.Context\)/)
  assert.match(publicHandler, /Slug\s+string\s+`json:"slug"`/)
  assert.match(publicHandler, /Type\s+string\s+`json:"type"`/)
  assert.match(publicHandler, /Description\s+string\s+`json:"description"`/)
  assert.match(publicHandler, /PricePerCall\s+int64\s+`json:"price_per_call"`/)
  assert.doesNotMatch(publicHandler, /InputPricePer1M\s+int64\s+`json:"input_price_per_1m"`/)
  assert.doesNotMatch(publicHandler, /OutputPricePer1M\s+int64\s+`json:"output_price_per_1m"`/)
  assert.doesNotMatch(publicHandler, /CacheReadPricePer1M\s+int64\s+`json:"cache_read_price_per_1m"`/)
  assert.doesNotMatch(publicHandler, /ImagePricePerCall\s+int64\s+`json:"image_price_per_call"`/)
  assert.match(publicHandler, /rows, err := h\.dao\.ListEnabled\(c\.Request\.Context\(\)\)/)
  assert.match(publicHandler, /if m\.Type != TypeImage \{\s*continue\s*\}/)
  assert.match(publicHandler, /PricePerCall:\s*m\.ImagePricePerCall/)
  assert.match(publicHandler, /resp\.OK\(c, gin\.H\{"items": out, "total": len\(out\)\}\)/)
})
