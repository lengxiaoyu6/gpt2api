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

export interface UpdateLogList {
  items: UpdateLog[]
  total: number
  limit: number
  offset: number
}

export interface ListPublicUpdateLogsParams {
  limit?: number
  offset?: number
}

export function listPublicUpdateLogs(params: ListPublicUpdateLogsParams = {}) {
  return http.get('/api/public/update-logs', { params }) as Promise<UpdateLogList>
}
