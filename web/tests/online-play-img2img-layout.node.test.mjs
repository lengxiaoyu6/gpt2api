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

test('图生图区移除参考主图切换状态并保留结果主图状态', () => {
  const playVue = read('web/src/views/personal/OnlinePlay.vue')
  assert.doesNotMatch(playVue, /const activeRefIndex = ref\(0\)/)
  assert.match(playVue, /const activeResultIndex = ref\(0\)/)
  assert.doesNotMatch(playVue, /const activeRefImage = computed(?:<[^>]+>)?\(\(\) =>/)
  assert.match(playVue, /const activeResultImage = computed(?:<[^>]+>)?\(\(\) =>/)
  assert.doesNotMatch(playVue, /function setActiveRef\(idx: number\)/)
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
  assert.doesNotMatch(playVue, /activeRefIndex\.value = 0/)
})

test('图生图区参考图改为方形卡片网格结构', () => {
  const playVue = read('web/src/views/personal/OnlinePlay.vue')
  assert.match(playVue, /class="img2img-compare"/)
  assert.match(playVue, /class="compare-panel compare-panel--reference"/)
  assert.match(playVue, /class="compare-panel compare-panel--result"/)
  assert.match(playVue, /class="ref-card-grid"/)
  assert.match(playVue, /class="ref-card"/)
  assert.match(playVue, /class="ref-card__remove" @click\.stop="removeRefImage\(idx\)"/)
  assert.match(playVue, /@click="openPreview\(refImages\.map\(\(r\) => r\.dataUrl\), idx\)"/)
  assert.match(playVue, /class="result-primary-actions"/)
})

test('图生图区使用方形卡片网格压缩纵向空间', () => {
  const playVue = read('web/src/views/personal/OnlinePlay.vue')
  assert.match(playVue, /\.ref-card-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fill, minmax\(104px, 1fr\)\);/)
  assert.match(playVue, /\.ref-card\s*\{[\s\S]*aspect-ratio:\s*1;/)
  assert.match(playVue, /\.ref-card__image\s*\{[\s\S]*object-fit:\s*cover;/)
  assert.match(playVue, /\.compare-panel__card\s*\{[\s\S]*min-width:\s*0;/)
})

test('在线体验页已清除冲突标记并保留比例与预览提示', () => {
  const playVue = read('web/src/views/personal/OnlinePlay.vue')
  assert.doesNotMatch(playVue, /^(<<<<<<<|=======|>>>>>>>) /m)
  assert.match(playVue, /const t2iRatio = ref<string>\('1:1'\)/)
  assert.match(playVue, /const i2iRatio = ref<string>\('1:1'\)/)
  assert.match(playVue, /const i2iPreview = ref\(false\)/)
  assert.match(playVue, /title="本次未使用 IMG2 灰度生成"/)
  assert.match(playVue, /description="上游没有把本账号放入 IMG2 终稿通道,返回的是 IMG1 预览图。"/)
})

test('比例选择不会改写 Prompt 输入框,提交时始终保持原始 prompt', () => {
  const playVue = read('web/src/views/personal/OnlinePlay.vue')

  assert.doesNotMatch(playVue, /watch\(t2iRatio,[\s\S]*?t2iPrompt\.value\s*=\s*applyRatioPrefix/)
  assert.doesNotMatch(playVue, /watch\(i2iRatio,[\s\S]*?i2iPrompt\.value\s*=\s*applyRatioPrefix/)
  assert.doesNotMatch(playVue, /applyRatioPrefix/)
  assert.doesNotMatch(playVue, /Make the aspect ratio/)
  assert.match(playVue, /function useT2iExample\(p: string\) \{\s*t2iPrompt\.value = p\s*\}/)
  assert.match(playVue, /const rawPrompt = t2iPrompt\.value\.trim\(\)[\s\S]*?if \(!rawPrompt\)[\s\S]*?const prompt = rawPrompt/)
  assert.match(playVue, /const rawPrompt = i2iPrompt\.value\.trim\(\)[\s\S]*?if \(!rawPrompt\)[\s\S]*?const prompt = rawPrompt/)
})
