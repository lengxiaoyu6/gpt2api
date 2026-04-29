import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

test('Prompt 库后端路由、装配与后台菜单已声明', () => {
  const routerGo = read('internal/server/router.go')
  const menuGo = read('internal/rbac/menu.go')
  const mainGo = read('cmd/server/main.go')

  assert.match(routerGo, /authed\.Group\("\/me\/prompts",\s*middleware\.RequirePerm\(rbac\.PermSelfImage\)\)/)
  assert.match(routerGo, /GET\("",\s*d\.PromptH\.ListMe\)/)
  assert.match(routerGo, /GET\("\/categories",\s*d\.PromptH\.Categories\)/)
  assert.match(routerGo, /admin\.Group\("\/prompts",\s*middleware\.RequirePerm\(rbac\.PermSystemSetting\)\)/)
  assert.match(routerGo, /GET\("",\s*d\.PromptH\.ListAdmin\)/)
  assert.match(routerGo, /POST\("",\s*d\.PromptH\.Create\)/)
  assert.match(routerGo, /PUT\("\/:id",\s*d\.PromptH\.Update\)/)
  assert.match(routerGo, /DELETE\("\/:id",\s*d\.PromptH\.Delete\)/)
  assert.match(menuGo, /Key:\s*"admin\.prompts"/)
  assert.match(menuGo, /Title:\s*"Prompt库"/)
  assert.match(menuGo, /Path:\s*"\/admin\/prompts"/)
  assert.match(mainGo, /promptlib\.NewDAO/)
  assert.match(mainGo, /promptlib\.NewHandler/)
})

test('admin 端声明 Prompt 库维护接口、路由与页面', () => {
  const apiTs = read('admin/src/api/prompt.ts')
  const routerTs = read('admin/src/router/index.ts')
  const viewVue = read('admin/src/views/admin/Prompts.vue')

  assert.match(apiTs, /PromptLibraryItem/)
  assert.match(apiTs, /preview_image_url/)
  assert.match(apiTs, /adminListPrompts/)
  assert.match(apiTs, /\/api\/admin\/prompts/)
  assert.match(apiTs, /adminCreatePrompt/)
  assert.match(apiTs, /adminUpdatePrompt/)
  assert.match(apiTs, /adminDeletePrompt/)
  assert.match(routerTs, /path:\s*'prompts'/)
  assert.match(routerTs, /Prompts\.vue/)
  assert.match(routerTs, /perm:\s*'system:setting'/)
  assert.match(viewVue, /Prompt库/)
  assert.match(viewVue, /预览图/)
  assert.match(viewVue, /preview_image_url/)
  assert.match(viewVue, /标签/)
  assert.match(viewVue, /删除/)
  assert.match(viewVue, /ElMessageBox\.confirm/)
})

test('web 端声明 Prompt 库接口、入口、页面与生图带入能力', () => {
  const apiTs = read('web/src/api/prompt.ts')
  const storeTs = read('web/src/store/useStore.ts')
  const appTsx = read('web/src/App.tsx')
  const pageTsx = read('web/src/components/views/PromptLibrary.tsx')
  const generateTsx = read('web/src/components/views/Generate.tsx')

  assert.match(apiTs, /listMyPrompts/)
  assert.match(apiTs, /preview_image_url/)
  assert.match(apiTs, /\/api\/me\/prompts/)
  assert.match(apiTs, /listMyPromptCategories/)
  assert.match(storeTs, /pendingPrompt/)
  assert.match(storeTs, /setPendingPrompt/)
  assert.match(storeTs, /consumePendingPrompt/)
  assert.match(appTsx, /promptLibrary/)
  assert.match(appTsx, /PromptLibraryView/)
  assert.match(appTsx, /灵感库/)
  assert.match(pageTsx, /搜索/)
  assert.match(pageTsx, /preview_image_url/)
  assert.match(pageTsx, /loading="lazy"/)
  assert.match(pageTsx, /分类/)
  assert.match(pageTsx, /加载更多/)
  assert.match(pageTsx, /复制提示词/)
  assert.match(pageTsx, /带入生图页/)
  assert.match(generateTsx, /consumePendingPrompt/)
})
