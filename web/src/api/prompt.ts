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

export interface PromptLibraryList {
  items: PromptLibraryItem[]
  total: number
  limit: number
  offset: number
}

export interface ListMyPromptsParams {
  keyword?: string
  category?: string
  limit?: number
  offset?: number
}

export function listMyPrompts(params: ListMyPromptsParams = {}) {
  return http.get('/api/me/prompts', { params }) as Promise<PromptLibraryList>
}

export function listMyPromptCategories() {
  return http.get('/api/me/prompts/categories') as Promise<{ items: string[] }>
}

export interface ListPublicPromptsParams {
  keyword?: string
  category?: string
  limit?: number
  offset?: number
}

export function listPublicPrompts(params: ListPublicPromptsParams = {}) {
  return http.get('/api/public/prompts', { params }) as Promise<PromptLibraryList>
}

export function listPublicPromptCategories() {
  return http.get('/api/public/prompts/categories') as Promise<{ items: string[] }>
}
