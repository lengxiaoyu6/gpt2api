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

test('案例页与定价页保留参考实现的主要内容区', () => {
  const showcaseVue = read('web/src/views/public/Showcase.vue')
  const pricingVue = read('web/src/views/public/Pricing.vue')
  assert.match(showcaseVue, /案例展示库/)
  assert.match(showcaseVue, /查看请求 Prompt/)
  assert.match(pricingVue, /按次计费，实时透明/)
  assert.match(pricingVue, /模型计费详情/)
  assert.match(pricingVue, /额度永久有效/)
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

