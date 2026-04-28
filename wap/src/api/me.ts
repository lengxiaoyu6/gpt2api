import { authorizedFetch, http } from './http'
import type { UserInfo } from './auth'

export interface MeResp {
  user: UserInfo
  role: string
  permissions: string[]
}

export interface CheckinStatus {
  enabled: boolean
  today: string
  checked_in: boolean
  today_reward_credits: number
  checked_at: string
  last_checked_at: string
  balance_after: number
  awarded_credits: number
}

export interface ImageModel {
  id: number
  slug: string
  type: 'chat' | 'image' | string
  description: string
  image_price_per_call: number
  image_price_per_call_2k?: number
  image_price_per_call_4k?: number
  has_image_channel?: boolean
  supports_multi_image?: boolean
  supports_output_size?: boolean
}

export interface ImageTask {
  id: number
  task_id: string
  user_id: number
  model_id: number
  account_id: number
  prompt: string
  n: number
  size: string
  status: string
  conversation_id?: string
  error?: string
  credit_cost: number
  image_urls: string[]
  thumb_urls?: string[]
  reference_urls?: string[]
  reference_thumb_urls?: string[]
  file_ids?: string[]
  created_at: string
  started_at?: string | null
  finished_at?: string | null
}

export interface PlayImageRequest {
  model: string
  prompt: string
  n?: number
  size?: string
  reference_images?: string[]
}

export interface PlayImageData {
  url: string
  thumb_url?: string
  file_id?: string
  revised_prompt?: string
}

export interface PlayImageResponse {
  created: number
  task_id?: string
  data: PlayImageData[]
  is_preview?: boolean
}

export function getMe() {
  return http.get('/api/me') as Promise<MeResp>
}

export function getMyCheckinStatus() {
  return http.get('/api/me/checkin') as Promise<CheckinStatus>
}

export function checkinToday() {
  return http.post('/api/me/checkin') as Promise<CheckinStatus>
}

export function changeMyPassword(req: { old_password: string; new_password: string }) {
  return http.post('/api/me/change-password', req) as Promise<{ updated: boolean }>
}

export function listMyModels() {
  return http.get('/api/me/models') as Promise<{ items: ImageModel[]; total: number }>
}

export function listMyImageTasks(params: { limit?: number; offset?: number } = {}) {
  return http.get('/api/me/images/tasks', { params }) as Promise<{ items: ImageTask[]; limit: number; offset: number }>
}

export function getMyImageTask(taskID: string) {
  return http.get(`/api/me/images/tasks/${taskID}`) as Promise<ImageTask>
}

export function deleteMyImageTask(taskID: string) {
  return http.delete(`/api/me/images/tasks/${taskID}`) as Promise<{ deleted: string }>
}

async function parseError(resp: Response, fallback: string) {
  try {
    const body = await resp.json()
    return body?.error?.message || body?.message || fallback
  } catch {
    return fallback
  }
}

export async function playGenerateImage(req: PlayImageRequest, signal?: AbortSignal) {
  const resp = await authorizedFetch('/api/me/playground/image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(req),
    signal,
  })
  if (!resp.ok) {
    throw new Error(await parseError(resp, `image ${resp.status}: ${resp.statusText}`))
  }
  return resp.json() as Promise<PlayImageResponse>
}

export async function playEditImage(
  model: string,
  prompt: string,
  files: File[],
  opts?: { n?: number; size?: string; signal?: AbortSignal },
) {
  if (!files.length) {
    throw new Error('至少需要选择一张参考图')
  }

  const fd = new FormData()
  fd.append('model', model)
  fd.append('prompt', prompt)
  if (opts?.size) fd.append('size', opts.size)
  if (opts?.n) fd.append('n', String(opts.n))
  files.forEach((file, index) => {
    fd.append(index === 0 ? 'image' : 'image[]', file, file.name)
  })

  const resp = await authorizedFetch('/api/me/playground/image-edit', {
    method: 'POST',
    body: fd,
    signal: opts?.signal,
  })

  if (!resp.ok) {
    throw new Error(await parseError(resp, `image-edit ${resp.status}: ${resp.statusText}`))
  }
  return resp.json() as Promise<PlayImageResponse>
}
