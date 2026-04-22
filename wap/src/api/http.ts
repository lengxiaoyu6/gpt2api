import axios, { AxiosError, AxiosHeaders, type AxiosInstance, type AxiosRequestConfig } from 'axios'

export interface ApiEnvelope<T = unknown> {
  code: number
  message: string
  data: T
}

const baseURL = import.meta.env.VITE_API_BASE || ''

export const TOKEN_KEY = 'gpt2api.access'
export const REFRESH_KEY = 'gpt2api.refresh'

export const http: AxiosInstance = axios.create({
  baseURL,
  timeout: 30_000,
})

let unauthorizedHandler: (() => void) | null = null

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler
}

export function buildApiURL(path: string) {
  if (!baseURL) return path
  if (/^https?:\/\//.test(path)) return path
  return `${baseURL.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
}

http.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    const headers = AxiosHeaders.from(config.headers)
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
      return Promise.reject(new Error(payload.message || `请求失败 code=${payload.code}`))
    }
    return response.data
  },
  (error: AxiosError<ApiEnvelope>) => {
    const status = error.response?.status
    const detail = error.response?.data?.message || error.message || '网络异常'
    if (status === 401) {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(REFRESH_KEY)
      unauthorizedHandler?.()
    }
    return Promise.reject(new Error(detail))
  },
)

export function request<T = unknown>(config: AxiosRequestConfig) {
  return http.request(config) as Promise<T>
}
