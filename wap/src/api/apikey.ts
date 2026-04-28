import { http } from './http'

export type NullableDateTime = { Time: string; Valid: boolean } | string | null | undefined
export type NullableString = { String: string; Valid: boolean } | string | null | undefined

export interface ApiKey {
  id: number
  user_id: number
  name: string
  key_prefix: string
  quota_limit: number
  quota_used: number
  rpm: number
  tpm: number
  enabled: boolean
  last_used_at?: NullableDateTime
  last_used_ip?: string
  expires_at?: NullableDateTime
  created_at: string
  updated_at: string
  allowed_models?: NullableString
  allowed_ips?: NullableString
}

export interface CreatedKey {
  key: string
  record: ApiKey
}

export interface ListPage {
  list: ApiKey[]
  total: number
  page: number
  page_size: number
}

export function listKeys(page = 1, size = 20) {
  return http.get('/api/keys', { params: { page, page_size: size } }) as Promise<ListPage>
}

export function createKey(
  req: Partial<Pick<ApiKey, 'name' | 'quota_limit' | 'rpm' | 'tpm'>> & {
    expires_at?: string
    allowed_models?: string[]
    allowed_ips?: string[]
  },
) {
  return http.post('/api/keys', req) as Promise<CreatedKey>
}

export function updateKey(id: number, req: Record<string, unknown>) {
  return http.patch(`/api/keys/${id}`, req) as Promise<ApiKey>
}

export function deleteKey(id: number) {
  return http.delete(`/api/keys/${id}`) as Promise<{ deleted: number }>
}
