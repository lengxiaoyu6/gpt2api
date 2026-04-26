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

test('前端模型类型包含 image_price_per_call', () => {
  const apiTs = read('web/src/api/me.ts')
  assert.match(apiTs, /image_price_per_call:\s*number/)
  assert.match(apiTs, /image_price_per_call_2k\??:\s*number/)
  assert.match(apiTs, /image_price_per_call_4k\??:\s*number/)
  assert.match(apiTs, /supports_multi_image\?:\s*boolean/)
  assert.match(apiTs, /supports_output_size\?:\s*boolean/)
})

test('管理端模型类型包含多档图片价格字段', () => {
  const statsTs = read('web/src/api/stats.ts')
  const modelsVue = read('web/src/views/admin/Models.vue')
  assert.match(statsTs, /image_price_per_call_2k\??:\s*number/)
  assert.match(statsTs, /image_price_per_call_4k\??:\s*number/)
  assert.match(modelsVue, /image_price_per_call_2k/)
  assert.match(modelsVue, /image_price_per_call_4k/)
  assert.match(modelsVue, /1K\s*\/\s*张/)
  assert.match(modelsVue, /2K\s*\/\s*张/)
  assert.match(modelsVue, /4K\s*\/\s*张/)
})

test('在线体验页与接口文档页优先选择具备图片渠道的模型', () => {
  const playVue = read('web/src/views/personal/OnlinePlay.vue')
  const docsVue = read('web/src/views/personal/ApiDocs.vue')
  assert.match(playVue, /function pickPreferredImageModel/)
  assert.match(playVue, /item\.has_image_channel/)
  assert.match(playVue, /selectedImageModel\.value = pickPreferredImageModel\(/)
  assert.match(docsVue, /function pickPreferredImageModel/)
  assert.match(docsVue, /item\.has_image_channel/)
  assert.match(docsVue, /selectedImageModel\.value = pickPreferredImageModel\(/)
})

test('在线体验页展示按输出质量变化的图片价格提示', () => {
  const playVue = read('web/src/views/personal/OnlinePlay.vue')
  assert.match(playVue, /resolveImageUnitPrice/)
  assert.match(playVue, /currentT2iPrice/)
  assert.match(playVue, /currentI2iPrice/)
  assert.match(playVue, /image_price_per_call_2k/)
  assert.match(playVue, /image_price_per_call_4k/)
  assert.match(playVue, /当前质量价格/)
  assert.match(playVue, /多张生成会按张数累计扣费/)
  assert.match(playVue, /预计消耗/)
})

test('在线体验页按模型能力控制张数和输出质量', () => {
  const playVue = read('web/src/views/personal/OnlinePlay.vue')
  assert.match(playVue, /supportsMultiImage/)
  assert.match(playVue, /supportsOutputSize/)
  assert.match(playVue, /effectiveT2iN/)
  assert.match(playVue, /v-if="supportsMultiImage"/)
  assert.match(playVue, /v-if="supportsOutputSize"/)
  assert.match(playVue, /const OUTPUT_QUALITY_OPTIONS:/)
  assert.match(playVue, /function resolveOutputSize\(ratio: string, quality: OutputQualityValue\): string/)
  assert.match(playVue, /\.\.\.\(supportsOutputSize\.value\s*\?\s*\{\s*size:\s*resolveOutputSize\(t2iRatio\.value,\s*t2iQuality\.value\)\s*\}\s*:\s*\{\s*\}\)/s)
  assert.match(playVue, /const prompt = rawPrompt/)
  assert.doesNotMatch(playVue, /applyRatioPrefix/)
  assert.doesNotMatch(playVue, /Make the aspect ratio/)
})


test('在线体验页提供完整画面比例选项', () => {
  const playVue = read('web/src/views/personal/OnlinePlay.vue')
  const requiredOptions = [
    "{ l: '1:1', w: 36, h: 36 }",
    "{ l: '5:4', w: 45, h: 36 }",
    "{ l: '9:16', w: 27, h: 48 }",
    "{ l: '16:9', w: 48, h: 27 }",
    "{ l: '4:3', w: 44, h: 33 }",
    "{ l: '3:2', w: 48, h: 32 }",
    "{ l: '4:5', w: 29, h: 36 }",
    "{ l: '3:4', w: 33, h: 44 }",
    "{ l: '2:3', w: 32, h: 48 }",
    "{ l: '21:9', w: 48, h: 21 }",
  ]
  for (const option of requiredOptions) {
    const escaped = option.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const matches = playVue.match(new RegExp(escaped, 'g')) || []
    assert.equal(matches.length, 2, `${option} should exist in text2img and img2img options`)
  }
})

test('在线体验页展示输出质量选项并按比例映射实际尺寸', () => {
  const playVue = read('web/src/views/personal/OnlinePlay.vue')
  assert.match(playVue, /输出质量/)
  assert.match(playVue, /label: '1K'/)
  assert.match(playVue, /label: '2K'/)
  assert.match(playVue, /label: '4K'/)
  assert.match(playVue, /'5:4': \{ '1K': '1040x832', '2K': '2080x1664', '4K': '3200x2560' \}/)
  assert.match(playVue, /'9:16': \{ '1K': '720x1280', '2K': '1152x2048', '4K': '2160x3840' \}/)
  assert.match(playVue, /'16:9': \{ '1K': '1280x720', '2K': '2048x1152', '4K': '3840x2160' \}/)
  assert.match(playVue, /'2:3': \{ '1K': '672x1008', '2K': '1344x2016', '4K': '2336x3504' \}/)
  assert.match(playVue, /'3:2': \{ '1K': '1008x672', '2K': '2016x1344', '4K': '3504x2336' \}/)
  assert.match(playVue, /'4:5': \{ '1K': '832x1040', '2K': '1664x2080', '4K': '2560x3200' \}/)
  assert.match(playVue, /'21:9': \{ '1K': '1344x576', '2K': '2016x864', '4K': '3696x1584' \}/)
  assert.doesNotMatch(playVue, /支持输出质量时按所选尺寸向上游传递 size,无需再把比例写入 prompt/)
  assert.doesNotMatch(playVue, /当前模型缺少输出质量能力,提交时会把/)
  assert.doesNotMatch(playVue, /当前比例对应上游尺寸/)
})
