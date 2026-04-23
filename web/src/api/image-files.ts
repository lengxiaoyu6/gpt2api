import { http } from './http'

export interface ImageFileItem {
  name: string
  task_id: string
  idx: number
  size_bytes: number
  modified_at: string
  path?: string
}

export interface ImageFileListResp {
  items: ImageFileItem[]
  total: number
  limit: number
  offset: number
}

export interface ImageFileStats {
  total_bytes: number
  used_bytes: number
  free_bytes: number
  used_percent: number
  original_bytes: number
  thumb_bytes: number
  original_file_count: number
  thumb_file_count: number
}

export function getImageFileStats(): Promise<ImageFileStats> {
  return http.get('/api/admin/system/image-files/stats')
}

export function listOriginalImageFiles(limit = 50, offset = 0): Promise<ImageFileListResp> {
  return http.get('/api/admin/system/image-files/original', { params: { limit, offset } })
}

export function listThumbImageFiles(limit = 50, offset = 0): Promise<ImageFileListResp> {
  return http.get('/api/admin/system/image-files/thumb', { params: { limit, offset } })
}

export function deleteOriginalImageFiles(names: string[]): Promise<{ deleted: number; resource: string }> {
  return http.post('/api/admin/system/image-files/original/delete', { names })
}

export function deleteThumbImageFiles(names: string[]): Promise<{ deleted: number; resource: string }> {
  return http.post('/api/admin/system/image-files/thumb/delete', { names })
}
