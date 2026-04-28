import { http } from './http'

export function fetchSiteInfo() {
  return http.get('/api/public/site-info') as Promise<Record<string, string>>
}
