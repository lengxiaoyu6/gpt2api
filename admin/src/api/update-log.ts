import { http } from './http'

export interface UpdateLog {
  id: number
  version: string
  title: string
  content: string
  enabled: boolean
  sort_order: number
  published_at: string | null
  created_at: string
  updated_at: string
}

export interface UpdateLogPayload {
  version: string
  title: string
  content: string
  enabled: boolean
  sort_order: number
  published_at: string | null
}

export interface UpdateLogList {
  items: UpdateLog[]
  total: number
  limit: number
  offset: number
}

export interface UpdateLogListParams {
  limit?: number
  offset?: number
}

export function listPublicUpdateLogs(params: UpdateLogListParams = {}): Promise<UpdateLogList> {
  return http.get('/api/public/update-logs', { params })
}

export function adminListUpdateLogs(params: UpdateLogListParams = {}): Promise<UpdateLogList> {
  return http.get('/api/admin/update-logs', { params })
}

export function adminCreateUpdateLog(payload: UpdateLogPayload): Promise<UpdateLog> {
  return http.post('/api/admin/update-logs', payload)
}

export function adminUpdateUpdateLog(id: number, payload: UpdateLogPayload): Promise<UpdateLog> {
  return http.put(`/api/admin/update-logs/${id}`, payload)
}

export function adminDeleteUpdateLog(id: number) {
  return http.delete(`/api/admin/update-logs/${id}`)
}
