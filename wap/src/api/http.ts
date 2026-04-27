import axios, { AxiosError, AxiosHeaders, type AxiosInstance, type AxiosRequestConfig } from 'axios'
import { localizeApiMessage } from '../utils/api-message'

export interface ApiEnvelope<T = unknown> {
  code: number
  message: string
  data: T
}

export class ApiError<T = unknown> extends Error {
  status: number
  code: number
  data?: T

  constructor(message: string, options: { status?: number; code?: number; data?: T } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = options.status ?? 0
    this.code = options.code ?? 0
    this.data = options.data
  }
}

const baseURL = import.meta.env.VITE_API_BASE || ''

export const TOKEN_KEY = 'gpt2api.access'
export const REFRESH_KEY = 'gpt2api.refresh'

export const http: AxiosInstance = axios.create({
  baseURL,
  timeout: 30_000,
})
export const refreshHTTP: AxiosInstance = axios.create({
  baseURL,
  timeout: 30_000,
})

let unauthorizedHandler: (() => void) | null = null
let refreshPromise: Promise<string> | null = null

interface RetryAxiosRequestConfig extends AxiosRequestConfig {
  _retry?: boolean
  _skipAuthRefresh?: boolean
}

interface AuthorizedFetchInit extends RequestInit {
  _retry?: boolean
}

function ensureAxiosHeaders(headers?: AxiosRequestConfig['headers']) {
  if (headers instanceof AxiosHeaders) {
    return headers
  }
  return new AxiosHeaders(headers as any)
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler
}

export function buildApiURL(path: string) {
  if (!baseURL) return path
  if (/^https?:\/\//.test(path)) return path
  return `${baseURL.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
}

function readAccessToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

function readRefreshToken() {
  return localStorage.getItem(REFRESH_KEY) || ''
}

function persistTokens(token: { access_token: string; refresh_token: string }) {
  localStorage.setItem(TOKEN_KEY, token.access_token)
  localStorage.setItem(REFRESH_KEY, token.refresh_token)
}

function clearTokens() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

function isAuthEndpoint(url?: string) {
  const value = (url || '').toLowerCase()
  return value.includes('/api/auth/login')
    || value.includes('/api/auth/register')
    || value.includes('/api/auth/refresh')
}

function handleUnauthorized() {
  clearTokens()
  unauthorizedHandler?.()
}

async function refreshAccessToken() {
  const refreshToken = readRefreshToken()
  if (!refreshToken) {
    throw new Error(localizeApiMessage('missing refresh token', '/api/auth/refresh'))
  }
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const response = await refreshHTTP.post('/api/auth/refresh', {
        refresh_token: refreshToken,
      })
      const payload = response.data as ApiEnvelope<{ access_token: string; refresh_token: string }>
      const token = payload?.data
      if (!payload || payload.code !== 0 || !token?.access_token || !token?.refresh_token) {
        throw new Error(localizeApiMessage(payload?.message || 'refresh failed', '/api/auth/refresh'))
      }
      persistTokens(token)
      return token.access_token
    })().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

http.interceptors.request.use((config) => {
  const token = readAccessToken()
  if (token) {
    const headers = ensureAxiosHeaders(config.headers)
    headers.set('Authorization', `Bearer ${token}`)
    config.headers = headers
  }
  return config
})

http.interceptors.response.use(
  (response) => {
    const payload = response.data as ApiEnvelope
    if (payload && typeof payload === 'object' && 'code' in payload) {
      if (payload.code === 0) {
        return payload.data as unknown
      }
      const reqUrl = (response.config.url || '') as string
      const detail = localizeApiMessage(payload.message || `请求失败 code=${payload.code}`, reqUrl)
      return Promise.reject(new ApiError(detail, {
        status: response.status,
        code: payload.code,
        data: payload.data,
      }))
    }
    return response.data
  },
  (error: AxiosError<ApiEnvelope>) => {
    const status = error.response?.status
    const payload = error.response?.data
    const originalConfig = error.config as RetryAxiosRequestConfig | undefined
    const reqUrl = (originalConfig?.url || '') as string
    const detail = localizeApiMessage(payload?.message || error.message || '网络异常', reqUrl)
    const apiError = new ApiError(detail, {
      status,
      code: payload?.code,
      data: payload?.data,
    })
    if (status === 401) {
      if (originalConfig && !originalConfig._retry && !originalConfig._skipAuthRefresh && !isAuthEndpoint(originalConfig.url) && readRefreshToken()) {
        originalConfig._retry = true
        return refreshAccessToken()
          .then((accessToken) => {
            const headers = ensureAxiosHeaders(originalConfig.headers)
            headers.set('Authorization', `Bearer ${accessToken}`)
            originalConfig.headers = headers
            return http.request(originalConfig)
          })
          .catch((refreshError) => {
            handleUnauthorized()
            return Promise.reject(refreshError instanceof Error ? refreshError : apiError)
          })
      }
      handleUnauthorized()
    }
    return Promise.reject(apiError)
  },
)

export function request<T = unknown>(config: AxiosRequestConfig) {
  return http.request(config) as Promise<T>
}

export async function authorizedFetch(input: string, init: AuthorizedFetchInit = {}) {
  const requestURL = buildApiURL(input)
  const headers = new Headers(init.headers)
  const accessToken = readAccessToken()
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }
  const response = await fetch(requestURL, { ...init, headers })
  if (response.status !== 401 || init._retry || isAuthEndpoint(requestURL) || !readRefreshToken()) {
    return response
  }
  try {
    await refreshAccessToken()
    const retryHeaders = new Headers(init.headers)
    const nextToken = readAccessToken()
    if (nextToken) {
      retryHeaders.set('Authorization', `Bearer ${nextToken}`)
    }
    const retryInit: AuthorizedFetchInit = { ...init, _retry: true, headers: retryHeaders }
    return await fetch(requestURL, retryInit)
  } catch {
    handleUnauthorized()
    return response
  }
}
