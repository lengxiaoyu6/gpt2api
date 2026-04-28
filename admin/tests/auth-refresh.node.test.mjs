import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

test('后台认证 API 声明刷新令牌方法', () => {
  const authTs = read('admin/src/api/auth.ts')
  assert.match(authTs, /export function refresh\(refreshToken: string\): Promise<TokenPair> \{/)
  assert.match(authTs, /http\.post\('\/api\/auth\/refresh', \{ refresh_token: refreshToken \}\)/)
})

test('后台 HTTP 层包含自动刷新与请求重试逻辑', () => {
  const httpTs = read('admin/src/api/http.ts')
  assert.match(httpTs, /let refreshPromise: Promise<string> \| null = null/)
  assert.match(httpTs, /\/api\/auth\/refresh/)
  assert.match(httpTs, /originalConfig\._retry = true/)
  assert.match(httpTs, /return http\(originalConfig\)/)
  assert.match(httpTs, /export async function authorizedFetch\(/)
})

test('后台 fetch 鉴权接口统一走 authorizedFetch', () => {
  const meTs = read('admin/src/api/me.ts')
  assert.match(meTs, /import \{[^}]*authorizedFetch[^}]*\} from '\.\/http'/)
  assert.match(meTs, /const resp = await authorizedFetch\('\/api\/me\/playground\/chat'/)
  assert.match(meTs, /const resp = await authorizedFetch\('\/api\/me\/playground\/image'/)
  assert.match(meTs, /const resp = await authorizedFetch\('\/api\/me\/playground\/image-edit'/)
})
