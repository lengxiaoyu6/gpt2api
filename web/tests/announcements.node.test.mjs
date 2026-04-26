import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')
function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

test('公告后端路由与后台菜单已声明', () => {
  const routerGo = read('internal/server/router.go')
  const menuGo = read('internal/rbac/menu.go')
  const mainGo = read('cmd/server/main.go')

  assert.match(routerGo, /pub\.GET\("\/announcements",\s*d\.AnnouncementH\.ListPublic\)/)
  assert.match(routerGo, /admin\.Group\("\/announcements",\s*middleware\.RequirePerm\(rbac\.PermSystemSetting\)\)/)
  assert.match(routerGo, /GET\("",\s*d\.AnnouncementH\.ListAdmin\)/)
  assert.match(routerGo, /POST\("",\s*d\.AnnouncementH\.Create\)/)
  assert.match(routerGo, /PUT\("\/:id",\s*d\.AnnouncementH\.Update\)/)
  assert.match(routerGo, /DELETE\("\/:id",\s*d\.AnnouncementH\.Delete\)/)
  assert.match(menuGo, /Key:\s*"admin\.announcements"/)
  assert.match(menuGo, /Title:\s*"公告管理"/)
  assert.match(menuGo, /Path:\s*"\/admin\/announcements"/)
  assert.match(mainGo, /announcement\.NewDAO/)
  assert.match(mainGo, /announcement\.NewHandler/)
})

test('Web 端声明公告 API、后台路由与个人中心弹窗挂载', () => {
  const apiTs = read('web/src/api/announcement.ts')
  const routerTs = read('web/src/router/index.ts')
  const layoutVue = read('web/src/layouts/BasicLayout.vue')
  const adminVue = read('web/src/views/admin/Announcements.vue')
  const centerVue = read('web/src/components/AnnouncementCenter.vue')

  assert.match(apiTs, /listPublicAnnouncements/)
  assert.match(apiTs, /\/api\/public\/announcements/)
  assert.match(apiTs, /adminCreateAnnouncement/)
  assert.match(routerTs, /path:\s*'announcements'/)
  assert.match(routerTs, /Announcements\.vue/)
  assert.match(layoutVue, /AnnouncementCenter/)
  assert.match(adminVue, /公告管理/)
  assert.match(centerVue, /gpt2api\.announcement\.read\.ids/)
  assert.match(centerVue, /公告列表/)
  assert.match(centerVue, /知道了/)
})

test('WAP 端声明公告 API、首页公告入口与已读缓存', () => {
  const apiTs = read('wap/src/api/announcement.ts')
  const appTsx = read('wap/src/App.tsx')
  const centerTsx = read('wap/src/components/AnnouncementCenter.tsx')

  assert.match(apiTs, /listPublicAnnouncements/)
  assert.match(apiTs, /\/api\/public\/announcements/)
  assert.match(appTsx, /AnnouncementCenter/)
  assert.match(appTsx, /activeTab === 'home'/)
  assert.match(centerTsx, /gpt2api\.announcement\.read\.ids/)
  assert.match(centerTsx, /公告列表/)
  assert.match(centerTsx, /知道了/)
})
