import { http } from './http'

export interface SettingOption {
  label: string
  value: string
  disabled?: boolean
}

// 系统设置 KV 条目(管理端用,带 schema)。
export interface SettingItem {
  key: string
  value: string
  type: 'string' | 'bool' | 'int' | 'float' | 'email' | 'url' | 'password' | 'select' | 'sanyue_img_hub' | string
  category: 'site' | 'auth' | 'defaults' | 'gateway' | 'billing' | 'mail' | 'storage' | string
  label: string
  desc: string
  options?: SettingOption[]
}

export function listSettings(): Promise<{ items: SettingItem[] }> {
  return http.get('/api/admin/settings')
}

export function updateSettings(items: Record<string, string>): Promise<{ updated: number }> {
  return http.put('/api/admin/settings', { items })
}

export function reloadSettings(): Promise<{ reloaded: boolean }> {
  return http.post('/api/admin/settings/reload')
}

export function sendTestEmail(to: string): Promise<{ sent: boolean; to: string }> {
  return http.post('/api/admin/settings/test-email', { to })
}

// 匿名公开接口:返回登录页需要的站点元信息(site.name 等)。
export function fetchSiteInfo(): Promise<Record<string, string>> {
  return http.get('/api/public/site-info')
}

export interface PublicModel {
  slug: string
  type: 'chat' | 'image' | string
  description: string
  price_per_call: number
}

export function fetchPublicModels(): Promise<{ items: PublicModel[]; total: number }> {
  return http.get('/api/public/models')
}
