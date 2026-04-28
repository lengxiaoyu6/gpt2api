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

test('路由收口为登录页与后台区，并把旧入口统一改回登录页', () => {
  const routerTs = read('admin/src/router/index.ts')

  assert.match(routerTs, /import BlankLayout from '@\/layouts\/BlankLayout\.vue'/)
  assert.doesNotMatch(routerTs, /PublicLayout/)
  assert.match(routerTs, /path: '\/',\s*redirect: '\/login'/)
  assert.match(routerTs, /path: '\/login',\s*component: BlankLayout,[\s\S]*component: \(\) => import\('@\/views\/auth\/Login\.vue'\)/)
  assert.match(routerTs, /path: '\/register',\s*redirect: '\/login'/)
  assert.match(routerTs, /path: '\/pricing',\s*redirect: '\/login'/)
  assert.match(routerTs, /path: '\/showcase',\s*redirect: '\/login'/)
  assert.match(routerTs, /path: '\/personal\/:pathMatch\(\.\*\)\*',\s*redirect: '\/login'/)
  assert.match(routerTs, /redirect: '\/admin\/dashboard'/)
  assert.match(routerTs, /path: 'dashboard', component: \(\) => import\('@\/views\/admin\/Dashboard\.vue'\)/)
  assert.doesNotMatch(routerTs, /views\/personal/)
  assert.doesNotMatch(routerTs, /views\/public/)
})

test('前置守卫会在进入后台前完成管理员会话校验', () => {
  const routerTs = read('admin/src/router/index.ts')

  assert.match(routerTs, /if \(to\.path === '\/login' && store\.isLoggedIn\)/)
  assert.match(routerTs, /await store\.fetchMe\(\)/)
  assert.match(routerTs, /await store\.assertAdminAccess\(\)/)
  assert.match(routerTs, /return \{ path: '\/login', query: \{ redirect: to\.fullPath \} \}/)
})

test('后台布局只消费管理员菜单，并将顶栏入口改为后台语义', () => {
  const layoutVue = read('admin/src/layouts/BasicLayout.vue')

  assert.match(layoutVue, /const \{ adminMenu, user, role \} = storeToRefs\(store\)/)
  assert.match(layoutVue, /<template v-for="group in adminMenu"/)
  assert.match(layoutVue, /AnnouncementCenter :active="route\.path\.startsWith\('\/admin'\)"/)
  assert.match(layoutVue, /<el-dropdown-item command="\/admin\/dashboard">/)
  assert.match(layoutVue, /<el-dropdown-item command="\/admin\/settings">/)
  assert.doesNotMatch(layoutVue, /\/personal\/dashboard/)
  assert.doesNotMatch(layoutVue, /\/personal\/billing/)
})

test('错误页与缺省返回入口改成后台首页', () => {
  const error403 = read('admin/src/views/Error403.vue')
  const error404 = read('admin/src/views/Error404.vue')

  assert.match(error403, /当前账号没有访问后台页面的权限/)
  assert.match(error403, /router\.replace\('\/admin\/dashboard'\)/)
  assert.match(error404, /返回后台首页/)
  assert.match(error404, /router\.replace\('\/admin\/dashboard'\)/)
})

test('后台首页复用现有接口拼装数据概览与最近任务', () => {
  const dashboardVue = read('admin/src/views/admin/Dashboard.vue')
  const adminApi = read('admin/src/api/admin.ts')

  assert.match(dashboardVue, /listUsers\(\{ limit: 1, offset: 0 \}\)/)
  assert.match(dashboardVue, /listUsers\(\{ role: 'admin', limit: 1, offset: 0 \}\)/)
  assert.match(dashboardVue, /creditsSummary\(\)/)
  assert.match(dashboardVue, /getUsageStats\(\{ days: 7, since, until, top_n: 5 \}\)/)
  assert.match(dashboardVue, /adminListOrders\(\{ status: 'pending', limit: 1, offset: 0 \}\)/)
  assert.match(dashboardVue, /listImageTasks\(\{ page: 1, page_size: 5 \}\)/)
  assert.match(dashboardVue, /后台概览/)
  assert.match(dashboardVue, /近 7 天请求趋势/)
  assert.match(dashboardVue, /最近图片任务/)
  assert.match(dashboardVue, /快捷入口/)
  assert.match(adminApi, /export interface AdminImageTask/)
  assert.match(adminApi, /export function listImageTasks\(params: \{ page\?: number; page_size\?: number; keyword\?: string; status\?: string; start_at\?: string; end_at\?: string \} = \{\}\)/)
  assert.match(adminApi, /return http\.get\('\/api\/admin\/image-tasks', \{ params \}\)/)
})

test('个人中心页面源码已经从 web 端裁剪', () => {
  assert.equal(exists('admin/src/views/personal/Dashboard.vue'), false)
  assert.equal(exists('admin/src/views/personal/Security.vue'), false)
  assert.equal(exists('admin/src/views/personal/ApiKeys.vue'), false)
  assert.equal(exists('admin/src/views/personal/Billing.vue'), false)
  assert.equal(exists('admin/src/views/personal/Usage.vue'), false)
  assert.equal(exists('admin/src/views/personal/OnlinePlay.vue'), false)
  assert.equal(exists('admin/src/views/personal/ApiDocs.vue'), false)
  assert.equal(exists('admin/src/views/personal/HistoryTasks.vue'), false)
})
