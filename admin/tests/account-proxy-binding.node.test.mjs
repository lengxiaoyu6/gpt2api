import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

function between(text, start, end) {
  const from = text.indexOf(start)
  assert.notEqual(from, -1, `missing start marker: ${start}`)
  const begin = from + start.length
  if (!end) return text.slice(begin)
  const to = text.indexOf(end, begin)
  assert.notEqual(to, -1, `missing end marker: ${end}`)
  return text.slice(begin, to)
}

test('后端已移除账号级手动绑定代理入口', () => {
  const serviceGo = read('internal/account/service.go')
  const handlerGo = read('internal/account/handler.go')
  const routerGo = read('internal/server/router.go')

  assert.doesNotMatch(serviceGo, /ProxyID\s+uint64\s+`json:"proxy_id"`/)
  assert.doesNotMatch(serviceGo, /func \(s \*Service\) BindProxy\(/)
  assert.doesNotMatch(serviceGo, /func \(s \*Service\) UnbindProxy\(/)

  assert.doesNotMatch(handlerGo, /func \(h \*Handler\) BindProxy\(/)
  assert.doesNotMatch(handlerGo, /func \(h \*Handler\) UnbindProxy\(/)

  assert.doesNotMatch(routerGo, /bind-proxy/)
})

test('批量导入链路已移除持久代理绑定，仅 token 导入保留请求代理', () => {
  const importerGo = read('internal/account/importer.go')
  const importerTokensGo = read('internal/account/importer_tokens.go')
  const handlerGo = read('internal/account/handler.go')

  assert.doesNotMatch(importerGo, /DefaultProxyID/)
  assert.doesNotMatch(importerGo, /SetBinding\(ctx, id, opt\.DefaultProxyID\)/)

  assert.doesNotMatch(importerTokensGo, /DefaultProxyID/)
  assert.match(importerTokensGo, /ProxyURL\s+string/)

  const importSection = between(
    handlerGo,
    'func (h *Handler) Import(c *gin.Context) {',
    '// POST /api/admin/accounts/import-tokens',
  )
  assert.doesNotMatch(importSection, /default_proxy_id/)

  const importTokensSection = between(
    handlerGo,
    'func (h *Handler) ImportTokens(c *gin.Context) {',
    '// splitLines 把多行文本切成 trim 后的非空行数组。',
  )
  assert.match(importTokensSection, /default_proxy_id/)
  assert.match(importTokensSection, /ProxyURL:\s+proxyURL/)
  assert.doesNotMatch(importTokensSection, /DefaultProxyID:\s+req\.DefaultProxyID/)
})

test('前端批量导入已移除默认代理绑定语义，RT ST 导入仅保留请求代理', () => {
  const apiTs = read('admin/src/api/accounts.ts')
  const pageVue = read('admin/src/views/admin/Accounts.vue')

  const importJSONSection = between(apiTs, 'export function importAccountsJSON(body: {', 'export interface ImportTokensBody {')
  assert.doesNotMatch(importJSONSection, /default_proxy_id\?:\s*number/)

  const importTokensSection = between(apiTs, 'export interface ImportTokensBody {', 'export function importAccountsTokens(body: ImportTokensBody) {')
  assert.match(importTokensSection, /default_proxy_id\?:\s*number/)

  const importFilesSection = between(apiTs, 'export function importAccountsFiles(', '// ---------- 刷新 / 探测 ----------')
  assert.doesNotMatch(importFilesSection, /default_proxy_id/)
  assert.doesNotMatch(importFilesSection, /fd\.append\('default_proxy_id'/)

  const tokenSubmitSection = between(
    pageVue,
    "  if (importMode.value !== 'json') {",
    '  // 情况一:纯文本导入(JSON 模式)',
  )
  assert.match(tokenSubmitSection, /default_proxy_id:\s*importForm\.default_proxy_id\s*\|\|\s*undefined/)

  const jsonSubmitSection = between(
    pageVue,
    '  if (importForm.files.length === 0) {',
    '  // 情况二:多文件分批',
  )
  assert.doesNotMatch(jsonSubmitSection, /default_proxy_id/)

  const fileSubmitSection = between(
    pageVue,
    '    for (let i = 0; i < batches.length; i++) {',
    '    importResult.value = cloneAgg()',
  )
  assert.doesNotMatch(fileSubmitSection, /default_proxy_id/)

  assert.doesNotMatch(pageVue, /默认代理/)
  assert.doesNotMatch(pageVue, /不绑定/)
  assert.match(pageVue, /请求代理/)
  assert.match(pageVue, /label="直连"/)
})

test('代理表 schema 已包含 last_used_at 迁移', () => {
  const initSchema = read('sql/migrations/20260417000001_init_schema.sql')
  const migration = read('sql/migrations/20260428000001_proxy_last_used_at.sql')

  assert.match(initSchema, /`last_used_at`\s+DATETIME\s+NULL/)
  assert.match(migration, /ALTER TABLE `proxies`/)
  assert.match(migration, /ADD COLUMN `last_used_at` DATETIME NULL/)
  assert.match(migration, /DROP COLUMN `last_used_at`/)
})
