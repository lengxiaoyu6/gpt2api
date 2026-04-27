import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

test('个人中心菜单树包含历史任务入口', () => {
  const menuGo = read('internal/rbac/menu.go')
  assert.match(menuGo, /Key:\s*"personal\.history-tasks"/)
  assert.match(menuGo, /Title:\s*"历史任务"/)
  assert.match(menuGo, /Path:\s*"\/personal\/history-tasks"/)
  assert.match(menuGo, /Perms:\s*\[]Permission\{PermSelfImage\}/)
})

test('个人中心静态路由包含历史任务页面', () => {
  const routerTs = read('web/src/router/index.ts')
  assert.match(routerTs, /path:\s*'history-tasks'/)
  assert.match(routerTs, /HistoryTasks\.vue/)
  assert.match(routerTs, /title:\s*'历史任务'/)
  assert.match(routerTs, /perm:\s*'self:image'/)
})

test('历史任务页面复用图片任务列表能力', () => {
  const pageVue = read('web/src/views/personal/HistoryTasks.vue')
  assert.match(pageVue, /listMyImageTasks/)
  assert.match(pageVue, /<h2 class="page-title">历史任务<\/h2>/)
  assert.match(pageVue, /图片任务历史/)
  assert.match(pageVue, /imageLoadMore/)
})

test('历史任务页面承接图片任务查询筛选能力', () => {
  const pageVue = read('web/src/views/personal/HistoryTasks.vue')
  assert.match(pageVue, /const imageFilter = reactive\(\{/)
  assert.match(pageVue, /function imageFilterParams\(\)/)
  assert.match(pageVue, /\.\.\.imageFilterParams\(\)/)
  assert.match(pageVue, /v-model="imageFilter\.keyword"/)
  assert.match(pageVue, /v-model="imageFilter\.status"/)
  assert.match(pageVue, /v-model="imageFilter\.range"/)
  assert.match(pageVue, /function onImageFilterReset\(\)/)
})

test('历史任务页面支持点击缩略图全屏放大查看', () => {
  const pageVue = read('web/src/views/personal/HistoryTasks.vue')
  assert.match(pageVue, /const previewVisible = ref\(false\)/)
  assert.match(pageVue, /const previewList = ref<string\[\]>\(\[\]\)/)
  assert.match(pageVue, /const previewIndex = ref\(0\)/)
  assert.match(pageVue, /function openPreview\(urls: string\[\], idx = 0\)/)
  assert.match(pageVue, /<el-image-viewer/)
  assert.match(pageVue, /:url-list="previewList"/)
  assert.match(pageVue, /:initial-index="previewIndex"/)
})

test('历史任务页面按图片拆分多图任务展示', () => {
  const pageVue = read('web/src/views/personal/HistoryTasks.vue')
  assert.match(pageVue, /const flattenedImageTasks = computed(?:<FlattenedImageTask\[\]>)?\(\(\) =>/)
  assert.match(pageVue, /imageTasks\.value\.flatMap\(\(task\) =>/)
  assert.match(pageVue, /v-for="item in flattenedImageTasks"/)
  assert.match(pageVue, /@click="openPreview\(previewURLs\(item\.task\), item\.image_index\)"/)
  assert.match(pageVue, /第\{\{ item\.image_index \+ 1 \}\}张，共\{\{ item\.image_total \}\}张/)
})

test('历史任务页面放大使用缩略图且下载原图文件', () => {
  const pageVue = read('web/src/views/personal/HistoryTasks.vue')
  assert.match(pageVue, /original_image_url: task\.image_urls\?\.\[index\] \|\| ''/)
  assert.match(pageVue, /image_url: task\.thumb_urls\?\.\[index\] \|\| task\.image_urls\?\.\[index\] \|\| ''/)
  assert.match(pageVue, /function previewURLs\(task: ImageTask\)/)
  assert.match(pageVue, /return task\.thumb_urls\?\.length \? task\.thumb_urls : task\.image_urls/)
  assert.match(pageVue, /async function downloadOriginalImage\(item: FlattenedImageTask\)/)
  assert.match(pageVue, /await fetch\(item\.original_image_url, \{ credentials: 'include' \}\)/)
  assert.match(pageVue, /triggerOriginalDownload\(blob, `\$\{item\.task\.task_id\}-\$\{item\.image_index \+ 1\}\.\$\{ext\}`\)/)
  assert.match(pageVue, /@click="downloadOriginalImage\(item\)"/)
  assert.match(pageVue, /title="下载原图"/)
  assert.match(pageVue, /aria-label="下载原图"/)
  assert.match(pageVue, /\n\s*type="primary"\n\s*plain\n\s*title="下载原图"/)
  assert.match(pageVue, />\s*下载原图\s*<\/el-button>/)
  assert.doesNotMatch(pageVue, /downloadOriginalImage\(item\.image_url/)
})

test('历史任务页面将任务状态显示为中文', () => {
  const pageVue = read('web/src/views/personal/HistoryTasks.vue')
  assert.match(pageVue, /const statusMap: Record<string, \{ tag: 'success' \| 'warning' \| 'danger' \| 'info'; label: string \}> = \{/)
  assert.match(pageVue, /queued:\s*\{\s*tag:\s*'warning',\s*label:\s*'排队中'\s*\}/)
  assert.match(pageVue, /dispatched:\s*\{\s*tag:\s*'warning',\s*label:\s*'生成中'\s*\}/)
  assert.match(pageVue, /running:\s*\{\s*tag:\s*'warning',\s*label:\s*'生成中'\s*\}/)
  assert.match(pageVue, /success:\s*\{\s*tag:\s*'success',\s*label:\s*'成功'\s*\}/)
  assert.match(pageVue, /failed:\s*\{\s*tag:\s*'danger',\s*label:\s*'失败'\s*\}/)
  assert.match(pageVue, /function isGeneratingStatus\(s: string\)/)
  assert.match(pageVue, /return s === 'dispatched' \|\| s === 'running'/)
  assert.match(pageVue, /function statusLabel\(s: string\)/)
  assert.match(pageVue, /v-if="isGeneratingStatus\(item\.task\.status\)"/)
  assert.match(pageVue, /class="status-loading"/)
  assert.match(pageVue, /@keyframes spin/)
  assert.match(pageVue, /\{\{ statusLabel\(item\.task\.status\) \}\}/)
})

test('接口文档页不再内置图片任务历史', () => {
  const pageVue = read('web/src/views/personal/ApiDocs.vue')
  assert.doesNotMatch(pageVue, /图片任务历史/)
  assert.doesNotMatch(pageVue, /listMyImageTasks/)
  assert.doesNotMatch(pageVue, /type ImageTask/)
  assert.match(pageVue, /历史任务/)
})
