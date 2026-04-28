import MockAdapter from 'axios-mock-adapter'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

describe('http client', () => {
  let http: any
  let TOKEN_KEY: string
  let REFRESH_KEY: string
  let setUnauthorizedHandler: (handler: (() => void) | null) => void
  let authorizedFetch: (input: string, init?: RequestInit) => Promise<Response>
  let mock: MockAdapter
  let refreshMock: MockAdapter

  beforeEach(async () => {
    localStorage.clear()
    vi.resetModules()
    const mod = await import('./http')
    http = mod.http
    const refreshHTTP = mod.refreshHTTP
    TOKEN_KEY = mod.TOKEN_KEY
    REFRESH_KEY = mod.REFRESH_KEY
    setUnauthorizedHandler = mod.setUnauthorizedHandler
    authorizedFetch = mod.authorizedFetch
    mock = new MockAdapter(http)
    refreshMock = new MockAdapter(refreshHTTP)
  })

  afterEach(() => {
    setUnauthorizedHandler(null)
    mock.restore()
    refreshMock.restore()
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  test('request helper attaches bearer token and unwraps data payload', async () => {
    localStorage.setItem(TOKEN_KEY, 'token-1')
    mock.onGet('/api/me').reply((config) => {
      expect(config.headers?.Authorization).toBe('Bearer token-1')
      return [200, { code: 0, message: 'ok', data: { ok: true } }]
    })

    await expect(http.get('/api/me')).resolves.toEqual({ ok: true })
  })

  test('401 handler refreshes tokens and retries original request', async () => {
    localStorage.setItem(TOKEN_KEY, 'token-1')
    localStorage.setItem(REFRESH_KEY, 'refresh-1')
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)

    mock.onGet('/api/me').replyOnce(401, { message: 'expired' })
    refreshMock.onPost('/api/auth/refresh').reply((config) => {
      expect(JSON.parse(config.data)).toEqual({ refresh_token: 'refresh-1' })
      return [200, { code: 0, message: 'ok', data: { access_token: 'token-2', refresh_token: 'refresh-2' } }]
    })
    mock.onGet('/api/me').reply((config) => {
      expect(config.headers?.Authorization).toBe('Bearer token-2')
      return [200, { code: 0, message: 'ok', data: { ok: true } }]
    })

    await expect(http.get('/api/me')).resolves.toEqual({ ok: true })
    expect(localStorage.getItem(TOKEN_KEY)).toBe('token-2')
    expect(localStorage.getItem(REFRESH_KEY)).toBe('refresh-2')
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  test('business error on /api paths uses localized message', async () => {
    mock.onGet('/api/tasks/1').reply(200, {
      code: 404,
      message: 'task not found',
      data: null,
    })

    await expect(http.get('/api/tasks/1')).rejects.toMatchObject({
      message: '任务不存在',
      status: 200,
      code: 404,
    })
  })

  test('dynamic /api error message uses localized message', async () => {
    mock.onGet('/api/site/config').reply(400, {
      code: 400,
      message: 'site.name must be integer',
      data: null,
    })

    await expect(http.get('/api/site/config')).rejects.toMatchObject({
      message: 'site.name 必须为整数',
      status: 400,
      code: 400,
    })
  })

  test('/v1 paths keep original message text', async () => {
    mock.onPost('/v1/chat/completions').reply(400, {
      code: 400,
      message: 'unknown key: temperature',
      data: null,
    })

    await expect(http.post('/v1/chat/completions', { model: 'demo' })).rejects.toMatchObject({
      message: 'unknown key: temperature',
      status: 400,
      code: 400,
    })
  })

  test('401 handler clears tokens and returns localized refresh error when refresh fails', async () => {
    localStorage.setItem(TOKEN_KEY, 'token-1')
    localStorage.setItem(REFRESH_KEY, 'refresh-1')
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    mock.onGet('/api/me').reply(401, { message: 'expired' })
    refreshMock.onPost('/api/auth/refresh').reply(200, {
      code: 401,
      message: 'invalid token: refresh expired',
      data: null,
    })

    await expect(http.get('/api/me')).rejects.toThrow('登录状态已失效：refresh expired')
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull()
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  test('authorizedFetch refreshes tokens and retries protected fetch request', async () => {
    localStorage.setItem(TOKEN_KEY, 'token-1')
    localStorage.setItem(REFRESH_KEY, 'refresh-1')

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'expired' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }))
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      ok: true,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    refreshMock.onPost('/api/auth/refresh').reply(200, {
      code: 0,
      message: 'ok',
      data: { access_token: 'token-2', refresh_token: 'refresh-2' },
    })

    const resp = await authorizedFetch('/api/me/playground/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'cat' }),
    })
    const firstHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Headers
    const secondHeaders = fetchMock.mock.calls[1]?.[1]?.headers as Headers

    expect(resp.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(firstHeaders.get('Authorization')).toBe('Bearer token-1')
    expect(secondHeaders.get('Authorization')).toBe('Bearer token-2')
    expect(localStorage.getItem(TOKEN_KEY)).toBe('token-2')
    expect(localStorage.getItem(REFRESH_KEY)).toBe('refresh-2')
  })
})
