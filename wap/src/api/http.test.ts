import MockAdapter from 'axios-mock-adapter'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

describe('http client', () => {
  let http: any
  let TOKEN_KEY: string
  let REFRESH_KEY: string
  let setUnauthorizedHandler: (handler: (() => void) | null) => void
  let mock: MockAdapter

  beforeEach(async () => {
    localStorage.clear()
    vi.resetModules()
    const mod = await import('./http')
    http = mod.http
    TOKEN_KEY = mod.TOKEN_KEY
    REFRESH_KEY = mod.REFRESH_KEY
    setUnauthorizedHandler = mod.setUnauthorizedHandler
    mock = new MockAdapter(http)
  })

  afterEach(() => {
    setUnauthorizedHandler(null)
    mock.restore()
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

  test('401 handler clears tokens and notifies auth reset callback', async () => {
    localStorage.setItem(TOKEN_KEY, 'token-1')
    localStorage.setItem(REFRESH_KEY, 'token-2')
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    mock.onGet('/api/me').reply(401, { message: 'expired' })

    await expect(http.get('/api/me')).rejects.toThrow(/expired|Request failed/i)
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull()
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })
})
