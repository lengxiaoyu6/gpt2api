import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import ts from 'typescript'

const root = resolve(process.cwd(), '..')

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

async function loadApiMessageModule() {
  const source = read('web/src/utils/api-message.ts')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const tempDir = mkdtempSync(join(tmpdir(), 'gpt2api-api-message-'))
  const modulePath = join(tempDir, 'api-message.mjs')
  writeFileSync(modulePath, output)
  return import(`file://${modulePath}`)
}

test('web http 请求层接入统一 message 本地化工具', () => {
  const httpTs = read('web/src/api/http.ts')
  assert.match(httpTs, /from '\.\.\/utils\/api-message'/)
  assert.match(httpTs, /localizeApiMessage\(/)
})

test('web message 本地化工具覆盖核心英文提示与 api 边界', () => {
  assert.equal(existsSync(resolve(root, 'web/src/utils/api-message.ts')), true)
  const utilTs = read('web/src/utils/api-message.ts')
  assert.match(utilTs, /invalid email or password/)
  assert.match(utilTs, /not logged in/)
  assert.match(utilTs, /insufficient permission/)
  assert.match(utilTs, /\/api\//)
  assert.match(utilTs, /\/v1\//)
})

test('web message 本地化工具处理 settings backup image 的英文返回', async () => {
  const { localizeApiMessage } = await loadApiMessageModule()

  assert.equal(
    localizeApiMessage('site.name must be integer', '/api/admin/settings'),
    'site.name 必须为整数',
  )
  assert.equal(
    localizeApiMessage('auth.mode option disabled: closed', '/api/admin/settings'),
    'auth.mode 当前不支持选项：closed',
  )
  assert.equal(
    localizeApiMessage('mail.driver must be one of the allowed options', '/api/admin/settings'),
    'mail.driver 必须为允许的选项之一',
  )
  assert.equal(
    localizeApiMessage('SMTP not configured: enable SMTP and fill mail settings in admin console', '/api/admin/settings/test-email'),
    'SMTP 未配置，请先在管理后台填写并启用邮件设置',
  )
  assert.equal(
    localizeApiMessage('send failed: dial tcp 127.0.0.1:25: connect refused', '/api/admin/settings/test-email'),
    '发送失败：dial tcp 127.0.0.1:25: connect refused',
  )
  assert.equal(
    localizeApiMessage('file exceeds 20 MB', '/api/admin/system/backup/upload'),
    '上传文件超过 20 MB 限制',
  )
  assert.equal(
    localizeApiMessage('X-Admin-Confirm header required for this destructive operation', '/api/admin/system/backup/upload'),
    '当前操作需要提供管理员确认密码',
  )
  assert.equal(
    localizeApiMessage('task id required', '/api/me/images/tasks/abc'),
    '缺少任务标识',
  )
  assert.equal(
    localizeApiMessage('task not found', '/api/me/images/tasks/abc'),
    '任务不存在',
  )
})

test('web message 本地化工具保留 /v1 接口原文', async () => {
  const { localizeApiMessage } = await loadApiMessageModule()

  assert.equal(
    localizeApiMessage('not logged in', '/v1/chat/completions'),
    'not logged in',
  )
})
