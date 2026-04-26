import { http } from './http'

export interface Announcement {
  id: number
  title: string
  content: string
  enabled: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface AnnouncementList {
  items: Announcement[]
  total: number
}

export function listPublicAnnouncements() {
  return http.get('/api/public/announcements') as Promise<AnnouncementList>
}
