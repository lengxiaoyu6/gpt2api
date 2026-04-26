import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
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

  assert.match(apiTs, /type: 'string' \| 'bool' \| 'int' \| 'float' \| 'email' \| 'url' \| 'select' \| 'sanyue_img_hub' \| string/)
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

test('历史任务页面改为优先使用缩略图并展示已过期占位', () => {
  const pageVue = read('web/src/views/personal/HistoryTasks.vue')
  const apiTs = read('web/src/api/me.ts')

  assert.match(apiTs, /thumb_urls: string\[\]/)
  assert.match(pageVue, /task\.thumb_urls\?\.length \? task\.thumb_urls : task\.image_urls/)
  assert.match(pageVue, /已过期/)
  assert.match(pageVue, /openPreview\(previewURLs\(item\.task\), item\.image_index\)/)
})

test('在线体验响应类型包含缩略图并且展示使用缩略图下载使用原图', () => {
  const apiTs = read('web/src/api/me.ts')
  const pageVue = read('web/src/views/personal/OnlinePlay.vue')

  assert.match(apiTs, /thumb_url\?: string/)
  assert.match(pageVue, /function displayImageURL\(img: PlayImageData\)/)
  assert.match(pageVue, /return img\.thumb_url \|\| img\.url/)
  assert.match(pageVue, /function resultPreviewURLs\(items: PlayImageData\[\]\)/)
  assert.match(pageVue, /@click="downloadUrl\(img\.url\)"/)
  assert.match(pageVue, /@click="downloadUrl\(activeResultImage\.url\)"/)
})
