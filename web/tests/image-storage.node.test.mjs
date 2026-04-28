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

test('系统设置页面包含存储设置页签与下拉枚举渲染', () => {
  const pageVue = read('web/src/views/admin/Settings.vue')
  assert.match(pageVue, /\{ name: 'storage', label: '存储设置'/)
  assert.match(pageVue, /function isSelect\(it: SettingItem\)/)
  assert.match(pageVue, /<el-select\s+v-else-if="isSelect\(it\)"/)
  assert.match(pageVue, /:disabled="opt\.disabled"/)
})

test('Sanyue-ImgHub 配置包含专用类型与序列化逻辑', () => {
  const pageVue = read('web/src/views/admin/Settings.vue')
  const apiTs = read('web/src/api/settings.ts')

  assert.match(apiTs, /type:\s*'string'\s*\|\s*'bool'\s*\|\s*'int'\s*\|\s*'float'\s*\|\s*'email'\s*\|\s*'url'\s*\|\s*'password'\s*\|\s*'select'\s*\|\s*'sanyue_img_hub'\s*\|\s*string/)
  assert.match(pageVue, /function isSanyueImgHub\(it: SettingItem\)/)
  assert.match(pageVue, /parseSanyueImgHubDraft/)
  assert.match(pageVue, /stringifySanyueImgHubDraft/)
  assert.match(pageVue, /authCode/)
  assert.match(pageVue, /serverCompress/)
  assert.match(pageVue, /returnFormat/)
  assert.match(pageVue, /uploadChannel/)
  assert.match(pageVue, /upload_channel/)
  assert.match(pageVue, /telegram/)
  assert.match(pageVue, /huggingface/)
  assert.match(pageVue, /仅在云存储模式下生效/)
  assert.match(pageVue, /type="password"/)
  assert.match(pageVue, /storage\.cloud_config/)
})

test('图片文件后台具备菜单、权限、路由与接口注册', () => {
  const permGo = read('internal/rbac/permission.go')
  const menuGo = read('internal/rbac/menu.go')
  const routerGo = read('internal/server/router.go')
  const routerTs = read('web/src/router/index.ts')

  assert.match(permGo, /PermSystemImageFile\s*=\s*Permission\("system:image_file"\)/)
  assert.match(menuGo, /Key:\s*"admin\.image-files"/)
  assert.match(menuGo, /Title:\s*"图片文件"/)
  assert.match(menuGo, /Path:\s*"\/admin\/image-files"/)
  assert.match(routerTs, /path:\s*'image-files'/)
  assert.match(routerTs, /ImageFiles\.vue/)
  assert.match(routerGo, /GET\("\/p\/thumb\/:task_id\/:idx"/)
  assert.match(routerGo, /admin\.Group\("\/system\/image-files"/)
})

test('个人图片任务 API 保留缩略图字段，历史任务页面源码已裁剪', () => {
  const apiTs = read('web/src/api/me.ts')
  assert.match(apiTs, /thumb_urls: string\[\]/)
  assert.equal(exists('web/src/views/personal/HistoryTasks.vue'), false)
})

test('在线体验响应类型保留缩略图字段，在线体验页面源码已裁剪', () => {
  const apiTs = read('web/src/api/me.ts')
  assert.match(apiTs, /thumb_url\?: string/)
  assert.equal(exists('web/src/views/personal/OnlinePlay.vue'), false)
})

