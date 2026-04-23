import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

test('系统设置声明生图页公告键并标记为公开', () => {
  const modelGo = read('internal/settings/model.go')
  assert.match(modelGo, /SiteImageNotice\s+=\s+"site\.image_notice"/)
  assert.match(modelGo, /Label:\s*"生图页公告"/)
  assert.match(modelGo, /Desc:\s*"展示在 Web 与移动端生图页顶部的公告文本"/)
  assert.match(modelGo, /Public:\s*true/)
})

test('后台系统设置页为生图页公告使用多行输入框', () => {
  const settingsVue = read('web/src/views/admin/Settings.vue')
  assert.match(settingsVue, /function isTextarea\(it: SettingItem\)/)
  assert.match(settingsVue, /it\.key === 'site\.image_notice'/)
  assert.match(settingsVue, /:type="isTextarea\(it\) \? 'textarea' : inputType\(it\)"/)
  assert.match(settingsVue, /:rows="isTextarea\(it\) \? 3 : undefined"/)
})

test('后台系统设置页将首页 Showcase 图片渲染为多行输入框', () => {
  const modelGo = read('internal/settings/model.go')
  const settingsVue = read('web/src/views/admin/Settings.vue')
  assert.match(modelGo, /SiteShowcaseURLs\s+=\s+"site\.showcase_urls"/)
  assert.match(modelGo, /Label:\s*"首页 Showcase 图片"/)
  assert.match(modelGo, /Type:\s*"string"/)
  assert.match(settingsVue, /function isTextarea\(it: SettingItem\)/)
  assert.match(settingsVue, /it\.key === 'site\.showcase_urls'/)
  assert.match(settingsVue, /:rows="isTextarea\(it\) \? 3 : undefined"/)
})

test('Web 生图页读取并展示生图页公告', () => {
  const playVue = read('web/src/views/personal/OnlinePlay.vue')
  assert.match(playVue, /useSiteStore/)
  assert.match(playVue, /site\.image_notice/)
  assert.match(playVue, /const noticeText = computed/)
  assert.match(playVue, /v-if="noticeText"/)
  assert.doesNotMatch(playVue, /title="生图公告"/)
})
