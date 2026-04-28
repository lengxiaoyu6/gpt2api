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

export interface AnnouncementPayload {
  title: string
  content: string
  enabled: boolean
  sort_order: number
}

export interface AnnouncementList {
  items: Announcement[]
  total: number
}

export function listPublicAnnouncements(): Promise<AnnouncementList> {
  return http.get('/api/public/announcements')
}

export function adminListAnnouncements(): Promise<AnnouncementList> {
  return http.get('/api/admin/announcements')
}

export function adminCreateAnnouncement(payload: AnnouncementPayload): Promise<Announcement> {
  return http.post('/api/admin/announcements', payload)
}

export function adminUpdateAnnouncement(id: number, payload: AnnouncementPayload): Promise<Announcement> {
  return http.put(`/api/admin/announcements/${id}`, payload)
}

export function adminDeleteAnnouncement(id: number) {
  return http.delete(`/api/admin/announcements/${id}`)
}
