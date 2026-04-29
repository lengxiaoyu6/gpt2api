import { http } from './http'

export interface PromptLibraryItem {
  id: number
  title: string
  content: string
  category: string
  preview_image_url: string
  tags: string[]
  enabled: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface PromptLibraryPayload {
  title: string
  content: string
  category: string
  preview_image_url: string
  tags: string[]
  enabled: boolean
  sort_order: number
}

export interface PromptLibraryList {
  items: PromptLibraryItem[]
  total: number
  limit: number
  offset: number
}

export interface PromptLibraryListParams {
  keyword?: string
  category?: string
  enabled?: boolean | ''
  limit?: number
  offset?: number
}

export function adminListPrompts(params: PromptLibraryListParams = {}): Promise<PromptLibraryList> {
  return http.get('/api/admin/prompts', { params })
}

export function adminCreatePrompt(payload: PromptLibraryPayload): Promise<PromptLibraryItem> {
  return http.post('/api/admin/prompts', payload)
}

export function adminUpdatePrompt(id: number, payload: PromptLibraryPayload): Promise<PromptLibraryItem> {
  return http.put(`/api/admin/prompts/${id}`, payload)
}

export function adminDeletePrompt(id: number) {
  return http.delete(`/api/admin/prompts/${id}`)
}
