import { http } from './http'

export interface CreditLogItem {
  id: number
  user_id: number
  key_id: number
  type: string
  amount: number
  balance_after: number
  ref_id: string
  remark: string
  created_at: string
}

export interface CreditLogListResp {
  items: CreditLogItem[]
  total: number
  limit: number
  offset: number
}

export function listMyCreditLogs(params: { limit?: number; offset?: number } = {}) {
  return http.get('/api/me/credit-logs', { params }) as Promise<CreditLogListResp>
}
