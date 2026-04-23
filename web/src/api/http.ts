import axios, { AxiosError, AxiosHeaders, type AxiosInstance, type AxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'

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
  clearTokens()
  if (!window.location.pathname.startsWith('/login')) {
    ElMessage.warning('登录已失效,请重新登录')
    window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`
    return
  }
  ElMessage.error(message || '登录已失效')
}

async function refreshAccessToken() {
  const refreshToken = readRefreshToken()
  if (!refreshToken) {
    throw new Error('missing refresh token')
  }
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const response = await refreshHTTP.post('/api/auth/refresh', {
        refresh_token: refreshToken,
      })
      const payload = response.data as ApiEnvelope<{ access_token: string; refresh_token: string }>
      const token = payload?.data
      if (!payload || payload.code !== 0 || !token?.access_token || !token?.refresh_token) {
        throw new Error(payload?.message || 'refresh failed')
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
      const msg = payload.message || `请求失败 (code=${payload.code})`
      ElMessage.error(msg)
      return Promise.reject(new Error(msg))
    }
    return response.data
  },
  (error: AxiosError<ApiEnvelope>) => {
    const status = error.response?.status
    const msg = error.response?.data?.message || error.message || '网络错误'
    if (status === 401) {
      // 登录接口 401 = 账号密码错误,不要清 token 也不要跳转,直接给明确提示。
      // 后端返回的是英文 "invalid email or password",这里本地化为中文。
      const originalConfig = error.config as RetryAxiosRequestConfig | undefined
      const reqUrl = (originalConfig?.url || '') as string
      const isLoginEndpoint =
        reqUrl.includes('/auth/login') || reqUrl.includes('/auth/register')
      if (isLoginEndpoint) {
        const friendly =
          /invalid email or password/i.test(msg) ? '邮箱或密码错误' : msg || '登录失败'
        ElMessage.error(friendly)
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
    } else if (status === 403) {
      ElMessage.error(`无权限:${msg}`)
    } else {
      ElMessage.error(msg)
    }
    return Promise.reject(error)
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
