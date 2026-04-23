import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

test('公开路由组提供首页、案例页与定价页', () => {
  const routerTs = read('web/src/router/index.ts')
  assert.match(routerTs, /path:\s*''\s*,\s*component:\s*\(\)\s*=>\s*import\('\@\/views\/public\/Home\.vue'\)/)
  assert.match(routerTs, /path:\s*'showcase'\s*,\s*component:\s*\(\)\s*=>\s*import\('\@\/views\/public\/Showcase\.vue'\)/)
  assert.match(routerTs, /path:\s*'pricing'\s*,\s*component:\s*\(\)\s*=>\s*import\('\@\/views\/public\/Pricing\.vue'\)/)
  assert.doesNotMatch(routerTs, /path:\s*''\s*,\s*redirect:\s*'\/personal\/dashboard'/)
})

test('公开首页包含 Hero、能力卡片、案例预览与行动召唤', () => {
  const homeVue = read('web/src/views/public/Home.vue')
  assert.match(homeVue, /DALL-E 3 & GPT-4o 生图现已上线/)
  assert.match(homeVue, /释放您的/)
  assert.match(homeVue, /极速下发/)
  assert.match(homeVue, /前沿生图展示/)
  assert.match(homeVue, /准备好开始大规模生图了吗/)
})

test('公开首页 feature section 为每张能力卡片声明图标并渲染 el-icon', () => {
  const homeVue = read('web/src/views/public/Home.vue')
  assert.match(homeVue, /icon:\s*'Lightning'/)
  assert.match(homeVue, /icon:\s*'Lock'/)
  assert.match(homeVue, /icon:\s*'Connection'/)
  assert.match(homeVue, /<el-icon\s*:size="24">\s*<component\s*:is="item\.icon"\s*\/?>\s*<\/el-icon>/s)
})

test('案例页与定价页保留参考实现的主要内容区', () => {
  const showcaseVue = read('web/src/views/public/Showcase.vue')
  const pricingVue = read('web/src/views/public/Pricing.vue')
  assert.match(showcaseVue, /案例展示库/)
  assert.match(showcaseVue, /查看请求 Prompt/)
  assert.match(pricingVue, /按次计费，实时透明/)
  assert.match(pricingVue, /模型计费详情/)
  assert.match(pricingVue, /额度永久有效/)
})

test('定价页通过匿名公开接口读取启用模型计费信息', () => {
  const pricingVue = read('web/src/views/public/Pricing.vue')
  const settingsTs = read('web/src/api/settings.ts')

  assert.match(settingsTs, /export interface PublicModel\s*\{/)
  assert.match(settingsTs, /return http\.get\('\/api\/public\/models'\)/)
  assert.match(pricingVue, /import\s+\{\s*fetchPublicModels\s*\}\s+from\s+'@\/api\/settings'/)
  assert.match(pricingVue, /const rows = ref<PublicModel\[]>\(\[\]\)/)
  assert.match(pricingVue, /const loading = ref\(false\)/)
  assert.match(pricingVue, /async function load\(\)/)
  assert.match(pricingVue, /const d = await fetchPublicModels\(\)/)
  assert.match(pricingVue, /rows\.value = d\.items/)
  assert.match(pricingVue, /onMounted\(load\)/)
})

test('定价页仅展示按次收费信息', () => {
  const pricingVue = read('web/src/views/public/Pricing.vue')

  assert.match(pricingVue, /支持模型/)
  assert.match(pricingVue, /模型类型/)
  assert.match(pricingVue, /按次价格/)
  assert.match(pricingVue, /仅针对单次成功调用计费/)
  assert.match(pricingVue, /row\.type === 'image' \? '生图' : '对话'/)
  assert.match(pricingVue, /formatPerCall\(row\.price_per_call\)/)
  assert.doesNotMatch(pricingVue, /输入价格/)
  assert.doesNotMatch(pricingVue, /输出价格/)
  assert.doesNotMatch(pricingVue, /缓存读价格/)
  assert.doesNotMatch(pricingVue, /单张价格/)
  assert.doesNotMatch(pricingVue, /const rows = \[\s*\{ name: 'gpt-image-2'/)
})

test('定价页在文字模型入口关闭时仅展示 image 模型', () => {
  const pricingVue = read('web/src/views/public/Pricing.vue')
  const featureTs = read('web/src/config/feature.ts')

  assert.match(featureTs, /export const ENABLE_CHAT_MODEL = false/)
  assert.match(pricingVue, /import\s+\{\s*ENABLE_CHAT_MODEL\s*\}\s+from\s+'@\/config\/feature'/)
  assert.match(pricingVue, /const visibleRows = computed\(\(\)\s*=>\s*ENABLE_CHAT_MODEL\s*\?\s*rows\.value\s*:\s*rows\.value\.filter\(\(row\)\s*=>\s*row\.type === 'image'\)\s*\)/)
  assert.match(pricingVue, /v-else-if=\"visibleRows\.length === 0\"/)
  assert.match(pricingVue, /v-for=\"row in visibleRows\"/)
})

test('公开布局导航仅保留定价入口，并按登录态切换操作按钮', () => {
  const layoutVue = read('web/src/layouts/PublicLayout.vue')
  assert.match(layoutVue, /const navItems = \[\s*\{ label: '定价方案', href: '\/pricing' \},\s*\]/)
  assert.match(layoutVue, /<router-link v-if="!user\.isLoggedIn" to="\/login" class="public-action public-action--ghost">/)
  assert.match(layoutVue, /v-if="!user\.isLoggedIn && allowRegister"/)
  assert.match(layoutVue, /<router-link v-if="user\.isLoggedIn" :to="dashboardHref" class="public-action public-action--primary">/)
})

test('站点名称同步到公开布局与文档标题', () => {
  const layoutVue = read('web/src/layouts/PublicLayout.vue')
  const siteStoreTs = read('web/src/stores/site.ts')
  assert.match(layoutVue, /const siteName = computed\(\(\) => site\.get\('site\.name', 'GPT2API'\)\)/)
  assert.match(siteStoreTs, /document\.title = n/)
  assert.doesNotMatch(siteStoreTs, /控制台/)
})

test('首页 terminal 仅保留请求示例，不再展示 response 行', () => {
  const homeVue = read('web/src/views/public/Home.vue')
  assert.match(homeVue, /<small>\{\{ siteName \}\} · request\.sh<\/small>/)
  assert.doesNotMatch(homeVue, /hero-terminal__result/)
  assert.doesNotMatch(homeVue, /response:/)
})

test('公开首页 Showcase 从后端公开配置读取图片 URL 列表', () => {
  const homeVue = read('web/src/views/public/Home.vue')
  const siteStoreTs = read('web/src/stores/site.ts')

  assert.match(siteStoreTs, /'site\.showcase_urls':\s*''/)
  assert.match(homeVue, /site\.get\('site\.showcase_urls', ''\)/)
  assert.match(homeVue, /const raw = site\.get\('site\.showcase_urls', ''\)/)
  assert.match(homeVue, /const seen = new Set<string>\(\)/)
  assert.match(homeVue, /split\(\/\\r\?\\n\/\)/)
  assert.match(homeVue, /test\(url\)/)
  assert.doesNotMatch(homeVue, /return \[url\]/)
})


test('公开布局使用纵向容器让页脚在短页面贴住底部', () => {
  const layoutVue = read('web/src/layouts/PublicLayout.vue')
  assert.match(layoutVue, /\.public-layout\s*\{[\s\S]*display:\s*flex;/)
  assert.match(layoutVue, /\.public-layout\s*\{[\s\S]*flex-direction:\s*column;/)
  assert.match(layoutVue, /\.public-main\s*\{[\s\S]*flex:\s*1;/)
})
