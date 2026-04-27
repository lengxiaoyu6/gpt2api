import axios, { AxiosError, AxiosHeaders, type AxiosInstance, type AxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'
import { localizeApiMessage } from '../utils/api-message'

/**
 * 统一响应结构,后端 `pkg/resp` 约定:
 * {
 *   code: 0,
 *   message: "ok",
 *   data: <T>
 * }
 * 非 0 code 认为是业务错误,会被拦截器统一抛出。
 */
export interface ApiEnvelope<T = any> {
  code: number
  message: string
  data: T
}

export class ApiError<T = any> extends Error {
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

export const http: AxiosInstance = axios.create({
  baseURL,
  timeout: 30_000,
})
export const refreshHTTP: AxiosInstance = axios.create({
  baseURL,
  timeout: 30_000,
})

/** access token 持久化 key(Pinia store 也复用) */
export const TOKEN_KEY = 'gpt2api.access'
export const REFRESH_KEY = 'gpt2api.refresh'
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

function buildApiURL(path: string) {
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

function redirectToLogin(message: string) {
  const friendly = message || '登录已失效'
  clearTokens()
  if (!window.location.pathname.startsWith('/login')) {
    ElMessage.warning(friendly)
    window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`
    return
  }
  ElMessage.error(friendly)
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
    // 下载类接口直接透传 blob
    const rawContentType = response.headers?.['content-type']
    const contentType = typeof rawContentType === 'string'
      ? rawContentType
      : Array.isArray(rawContentType)
        ? rawContentType[0] || ''
        : ''
    if (response.config.responseType === 'blob' || contentType.startsWith('application/gzip')) {
      return response
    }
    const payload = response.data as ApiEnvelope
    if (payload && typeof payload === 'object' && 'code' in payload) {
      if (payload.code === 0) {
        return payload.data as any
      }
      const reqUrl = (response.config.url || '') as string
      const msg = localizeApiMessage(payload.message || `请求失败 (code=${payload.code})`, reqUrl)
      ElMessage.error(msg)
      return Promise.reject(new ApiError(msg, { status: response.status, code: payload.code, data: payload.data }))
    }
    return response.data
  },
  (error: AxiosError<ApiEnvelope>) => {
    const status = error.response?.status
    const payload = error.response?.data
    const originalConfig = error.config as RetryAxiosRequestConfig | undefined
    const reqUrl = (originalConfig?.url || '') as string
    const msg = localizeApiMessage(payload?.message || error.message || '网络错误', reqUrl)
    const apiError = new ApiError(msg, {
      status,
      code: payload?.code,
      data: payload?.data,
    })
    if (status === 401) {
      const isLoginEndpoint =
        reqUrl.includes('/auth/login') || reqUrl.includes('/auth/register')
      if (isLoginEndpoint) {
        ElMessage.error(msg || '登录失败')
      } else {
        if (originalConfig && !originalConfig._retry && !originalConfig._skipAuthRefresh && !isAuthEndpoint(reqUrl) && readRefreshToken()) {
          originalConfig._retry = true
          return refreshAccessToken()
            .then((accessToken) => {
              const headers = ensureAxiosHeaders(originalConfig.headers)
              headers.set('Authorization', `Bearer ${accessToken}`)
              originalConfig.headers = headers
              return http(originalConfig)
            })
            .catch((refreshError) => {
              redirectToLogin(msg || '登录已失效')
              return Promise.reject(refreshError)
            })
        }
        redirectToLogin(msg || '登录已失效')
      }
    } else {
      ElMessage.error(msg)
    }
    return Promise.reject(apiError)
  },
)

/** 直接传入返回体的辅助类型工具 */
export function request<T = any>(cfg: AxiosRequestConfig): Promise<T> {
  return http.request(cfg) as unknown as Promise<T>
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
    redirectToLogin('登录已失效')
    return response
  }
}
