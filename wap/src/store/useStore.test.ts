import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../api/site', () => ({
  fetchSiteInfo: vi.fn(),
}))

vi.mock('../api/auth', () => ({
  login: vi.fn(),
  register: vi.fn(),
}))

vi.mock('../api/me', () => ({
  getMe: vi.fn(),
  getMyCheckinStatus: vi.fn(),
  checkinToday: vi.fn(),
  listMyModels: vi.fn(),
  listMyImageTasks: vi.fn(),
  playGenerateImage: vi.fn(),
  playEditImage: vi.fn(),
}))

vi.mock('../api/http', () => ({
  TOKEN_KEY: 'gpt2api.access',
  REFRESH_KEY: 'gpt2api.refresh',
  setUnauthorizedHandler: vi.fn(),
}))

const siteApi = await import('../api/site')
const authApi = await import('../api/auth')
const meApi = await import('../api/me')
const storeModule = await import('./useStore')
const useStore = storeModule.useStore

function resetStore() {
  const initial = useStore.getInitialState()
  useStore.setState(initial, true)
  localStorage.clear()
}

describe('useStore backend integration', () => {
  beforeEach(() => {
    resetStore()
    vi.clearAllMocks()
    vi.mocked(siteApi.fetchSiteInfo).mockResolvedValue({
      'site.name': 'GPT2API',
      'auth.allow_register': 'true',
    })
    vi.mocked(meApi.listMyModels).mockResolvedValue({
      items: [{ id: 1, slug: 'gpt-image-1', type: 'image', description: 'img', image_price_per_call: 5 }],
      total: 1,
    })
    vi.mocked(meApi.listMyImageTasks).mockResolvedValue({ items: [], limit: 20, offset: 0 })
    vi.mocked(meApi.getMyCheckinStatus).mockResolvedValue({
      enabled: true,
      today: '2026-04-22',
      checked_in: false,
      today_reward_credits: 5,
      checked_at: '',
      last_checked_at: '',
      balance_after: 0,
      awarded_credits: 0,
    })
    vi.mocked(meApi.getMe).mockResolvedValue({
      user: {
        id: 1,
        email: 'demo@example.com',
        nickname: 'Demo',
        role: 'user',
        status: 'active',
        group_id: 1,
        credit_balance: 88,
        credit_frozen: 0,
      },
      role: 'user',
      permissions: [],
    })
    vi.mocked(authApi.login).mockResolvedValue({
      user: {
        id: 1,
        email: 'demo@example.com',
        nickname: 'Demo',
        role: 'user',
        status: 'active',
        group_id: 1,
        credit_balance: 88,
        credit_frozen: 0,
      },
      token: {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
      },
    })
    vi.mocked(authApi.register).mockResolvedValue({
      id: 1,
      email: 'demo@example.com',
      nickname: 'Demo',
      role: 'user',
      status: 'active',
      group_id: 1,
      credit_balance: 88,
      credit_frozen: 0,
    })
    vi.mocked(meApi.playGenerateImage).mockResolvedValue({
      created: 1,
      task_id: 'task-1',
      data: [{ url: '/p/img/task-1/0' }],
      is_preview: false,
    })
    vi.mocked(meApi.playEditImage).mockResolvedValue({
      created: 1,
      task_id: 'task-2',
      data: [{ url: '/p/img/task-2/0' }],
      is_preview: false,
    })
  })

  afterEach(() => {
    resetStore()
  })

  test('bootstrap loads site info and keeps anonymous state without token', async () => {
    const state = useStore.getState() as any

    await state.bootstrapApp()

    expect(useStore.getState().siteInfo['site.name']).toBe('GPT2API')
    expect((useStore.getState() as any).user).toBeNull()
    expect((useStore.getState() as any).bootstrapStatus).toBe('ready')
    expect(meApi.getMe).not.toHaveBeenCalled()
  })

  test('openAuthForTab records pending protected tab and opens overlay', () => {
    const state = useStore.getState() as any

    state.openAuthForTab('history')

    expect((useStore.getState() as any).pendingTab).toBe('history')
    expect((useStore.getState() as any).authOverlayOpen).toBe(true)
  })

  test('login stores tokens, closes auth overlay and switches to pending tab', async () => {
    const state = useStore.getState() as any
    state.openAuthForTab('profile')

    await state.login({ email: 'demo@example.com', password: 'secret123' })

    expect(localStorage.getItem('gpt2api.access')).toBe('access-token')
    expect((useStore.getState() as any).activeTab).toBe('profile')
    expect((useStore.getState() as any).authOverlayOpen).toBe(false)
    expect((useStore.getState() as any).user?.credit_balance).toBe(88)
  })

  test('generateImage uses mapped size 1792x1024 for 16:9 and refreshes me plus history', async () => {
    localStorage.setItem('gpt2api.access', 'access-token')
    const state = useStore.getState() as any
    await state.fetchMe()
    await state.fetchImageModels()

    await state.generateImage({ prompt: 'night city', aspectRatio: '16:9' })

    expect(meApi.playGenerateImage).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-image-1', prompt: 'night city', size: '1792x1024', n: 1 }),
      undefined,
    )
    expect(meApi.getMe).toHaveBeenCalledTimes(2)
    expect(meApi.listMyImageTasks).toHaveBeenCalledTimes(1)
  })
})
