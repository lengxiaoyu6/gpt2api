import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

test('图生图区移除旧的 Preview 占位提示', () => {
  const playVue = read('web/src/views/personal/OnlinePlay.vue')
  assert.doesNotMatch(playVue, /图生图目前处于 Preview/)
  assert.doesNotMatch(playVue, /当前提交会返回 501/)
})

test('图生图区维护参考主图与结果主图状态', () => {
  const playVue = read('web/src/views/personal/OnlinePlay.vue')
  assert.match(playVue, /const activeRefIndex = ref\(0\)/)
  assert.match(playVue, /const activeResultIndex = ref\(0\)/)
  assert.match(playVue, /const activeRefImage = computed(?:<[^>]+>)?\(\(\) =>/)
  assert.match(playVue, /const activeResultImage = computed(?:<[^>]+>)?\(\(\) =>/)
})

test('图生图区提供查看放大下载与继续编辑入口', () => {
  const playVue = read('web/src/views/personal/OnlinePlay.vue')
  assert.match(playVue, />查看</)
  assert.match(playVue, />放大</)
  assert.match(playVue, />下载</)
  assert.match(playVue, /继续编辑当前结果/)
})

test('继续编辑逻辑会把当前结果图写回参考图区', () => {
  const playVue = read('web/src/views/personal/OnlinePlay.vue')
  assert.match(playVue, /async function continueEditCurrentResult\(\)/)
  assert.match(playVue, /if \(!activeResultImage\.value\?\.url\) return/)
  assert.match(playVue, /const dataUrl = await imageUrlToDataUrl\(activeResultImage\.value\.url\)/)
  assert.match(playVue, /refImages\.value = \[\s*\{[\s\S]*dataUrl,[\s\S]*\}\s*\]/)
  assert.match(playVue, /activeRefIndex\.value = 0/)
})

test('图生图区使用固定双栏画布与缩略条结构', () => {
  const playVue = read('web/src/views/personal/OnlinePlay.vue')
  assert.match(playVue, /class="img2img-compare"/)
  assert.match(playVue, /class="compare-panel compare-panel--reference"/)
  assert.match(playVue, /class="compare-panel compare-panel--result"/)
  assert.match(playVue, /class="thumb-strip"/)
  assert.match(playVue, /class="result-primary-actions"/)
})

test('图生图区为大尺寸参考图提供固定画布约束', () => {
  const playVue = read('web/src/views/personal/OnlinePlay.vue')
  assert.match(playVue, /\.compare-canvas\s*\{[\s\S]*height:\s*min\(62vh, 560px\);/)
  assert.match(playVue, /\.compare-panel__card\s*\{[\s\S]*min-width:\s*0;/)
  assert.match(playVue, /\.compare-image\s*\{[\s\S]*max-width:\s*100%;[\s\S]*max-height:\s*100%;/)
})
