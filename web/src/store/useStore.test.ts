import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../api/site', () => ({
  fetchSiteInfo: vi.fn(),
}))

vi.mock('../api/auth', () => ({
  login: vi.fn(),
  register: vi.fn(),
  sendRegisterEmailCode: vi.fn(),
}))

vi.mock('../api/me', () => ({
  getMe: vi.fn(),
  getMyCheckinStatus: vi.fn(),
  checkinToday: vi.fn(),
  listMyModels: vi.fn(),
  listMyImageTasks: vi.fn(),
  deleteMyImageTask: vi.fn(),
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
  sessionStorage.clear()
}

function mockImageTask(id: number) {
  return {
    id,
    task_id: `task-${id}`,
    user_id: 1,
    model_id: 1,
    account_id: 1,
    prompt: `Cloud city ${id}`,
    n: 1,
    size: '1024x1024',
    status: 'succeeded',
    credit_cost: 5,
    image_urls: [`/p/img/task-${id}/0`],
    thumb_urls: [`/p/thumb/task-${id}/0`],
    created_at: `2026-04-22T10:${String(id).padStart(2, '0')}:00Z`,
  }
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
    vi.mocked(meApi.deleteMyImageTask).mockResolvedValue({ deleted: 'task-1' })
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
    expect(useStore.getState().siteInfo['auth.require_email_verify']).toBe('false')
    expect((useStore.getState() as any).user).toBeNull()
    expect((useStore.getState() as any).bootstrapStatus).toBe('ready')
    expect(meApi.getMe).not.toHaveBeenCalled()
  })

  test('store default site info exposes auth.require_email_verify for anonymous ui', () => {
    expect(useStore.getState().siteInfo['auth.require_email_verify']).toBe('false')
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

  test('forceRelogin clears session state and reopens auth overlay for target tab', () => {
    localStorage.setItem('gpt2api.access', 'access-token')
    localStorage.setItem('gpt2api.refresh', 'refresh-token')
    useStore.setState({
      bootstrapStatus: 'loading',
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
      permissions: ['self:profile'],
      checkin: {
        enabled: true,
        today: '2026-04-22',
        checked_in: true,
        today_reward_credits: 5,
        checked_at: '2026-04-22T09:00:00Z',
        last_checked_at: '2026-04-22T09:00:00Z',
        balance_after: 88,
        awarded_credits: 5,
      },
      imageModels: [{ id: 1, slug: 'gpt-image-1', type: 'image', description: 'img', image_price_per_call: 5 }],
      selectedImageModel: 'gpt-image-1',
      history: [
        {
          id: 1,
          task_id: 'task-1',
          user_id: 1,
          model_id: 1,
          account_id: 1,
          prompt: 'Cloud city',
          n: 1,
          size: '1024x1024',
          status: 'succeeded',
          credit_cost: 5,
          image_urls: ['/p/img/task-1/0'],
          created_at: '2026-04-22T10:00:00Z',
        },
      ],
      historyLoaded: true,
      historyLoading: true,
      activeTab: 'profile',
      pendingTab: 'history',
      authOverlayOpen: false,
    } as any)

    const state = useStore.getState() as any
    state.forceRelogin('profile')

    const next = useStore.getState() as any
    expect(localStorage.getItem('gpt2api.access')).toBeNull()
    expect(localStorage.getItem('gpt2api.refresh')).toBeNull()
    expect(next.user).toBeNull()
    expect(next.role).toBe('')
    expect(next.permissions).toEqual([])
    expect(next.checkin).toBeNull()
    expect(next.imageModels).toEqual([])
    expect(next.selectedImageModel).toBeNull()
    expect(next.history).toEqual([])
    expect(next.historyLoaded).toBe(false)
    expect(next.historyLoading).toBe(false)
    expect(next.activeTab).toBe('home')
    expect(next.pendingTab).toBe('profile')
    expect(next.authOverlayOpen).toBe(true)
    expect(next.bootstrapStatus).toBe('ready')
  })

  test('generateImage keeps raw prompt when model supports output size, converts selected quality to actual size and refreshes me plus history', async () => {
    localStorage.setItem('gpt2api.access', 'access-token')
    const state = useStore.getState() as any
    await state.fetchMe()
    await state.fetchImageModels()

    await state.generateImage({
      prompt: 'future skyline',
      aspectRatio: '16:9',
      quality: '4K',
      count: 4,
    })

    expect(meApi.playGenerateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-image-1',
        prompt: 'future skyline',
        size: '3840x2160',
        n: 4,
      }),
      undefined,
    )
    expect(meApi.getMe).toHaveBeenCalledTimes(2)
    expect(meApi.listMyImageTasks).toHaveBeenCalledTimes(1)
  })

  test('fetchImageModels prefers image model with upstream channel when current selection is empty', async () => {
    vi.mocked(meApi.listMyModels).mockResolvedValue({
      items: [
        {
          id: 1,
          slug: 'gpt-image-2',
          type: 'image',
          description: 'local',
          image_price_per_call: 5,
          has_image_channel: false,
        },
        {
          id: 2,
          slug: 'gpt-image-2-api',
          type: 'image',
          description: 'upstream',
          image_price_per_call: 5,
          has_image_channel: true,
        },
      ],
      total: 2,
    })

    const state = useStore.getState() as any
    const models = await state.fetchImageModels()

    expect(models.map((item: any) => item.slug)).toEqual(['gpt-image-2', 'gpt-image-2-api'])
    expect(useStore.getState().selectedImageModel).toBe('gpt-image-2-api')
  })

  test('deleteHistoryRecord calls image task delete API and removes record locally', async () => {
    useStore.setState({
      history: [
        {
          id: 1,
          task_id: 'task-1',
          user_id: 1,
          model_id: 1,
          account_id: 1,
          prompt: 'Cloud city',
          n: 1,
          size: '1024x1024',
          status: 'succeeded',
          credit_cost: 5,
          image_urls: ['/p/img/task-1/0'],
          created_at: '2026-04-22T10:00:00Z',
        },
        {
          id: 2,
          task_id: 'task-2',
          user_id: 1,
          model_id: 1,
          account_id: 1,
          prompt: 'Forest city',
          n: 1,
          size: '1024x1024',
          status: 'succeeded',
          credit_cost: 5,
          image_urls: ['/p/img/task-2/0'],
          created_at: '2026-04-22T11:00:00Z',
        },
      ],
      historyLoaded: true,
    } as any)

    const state = useStore.getState() as any

    await state.deleteHistoryRecord('task-1')

    expect(meApi.deleteMyImageTask).toHaveBeenCalledWith('task-1')
    expect((useStore.getState() as any).history.map((item: any) => item.task_id)).toEqual(['task-2'])
    expect((useStore.getState() as any).historyLoaded).toBe(true)
  })

  test('fetchHistory appends next image task page with offset', async () => {
    const firstPage = Array.from({ length: 20 }, (_, index) => mockImageTask(index + 1))
    const secondPage = [mockImageTask(21)]

    vi.mocked(meApi.listMyImageTasks)
      .mockResolvedValueOnce({
        items: firstPage,
        total: 21,
        limit: 20,
        offset: 0,
      } as any)
      .mockResolvedValueOnce({
        items: secondPage,
        total: 21,
        limit: 20,
        offset: 20,
      } as any)

    const state = useStore.getState() as any

    await state.fetchHistory(true)
    await (useStore.getState() as any).fetchHistory(false, true)

    expect(meApi.listMyImageTasks).toHaveBeenNthCalledWith(1, { limit: 20, offset: 0 })
    expect(meApi.listMyImageTasks).toHaveBeenNthCalledWith(2, { limit: 20, offset: 20 })
    expect((useStore.getState() as any).history.map((item: any) => item.task_id)).toEqual([
      ...firstPage.map((item) => item.task_id),
      'task-21',
    ])
    expect((useStore.getState() as any).historyHasMore).toBe(false)
    expect((useStore.getState() as any).historyOffset).toBe(21)
  })

  test('generateImage lazily prefers image model with upstream channel when no selection exists', async () => {
    localStorage.setItem('gpt2api.access', 'access-token')
    vi.mocked(meApi.listMyModels).mockResolvedValue({
      items: [
        {
          id: 1,
          slug: 'gpt-image-2',
          type: 'image',
          description: 'local',
          image_price_per_call: 5,
          has_image_channel: false,
        },
        {
          id: 2,
          slug: 'gpt-image-2-api',
          type: 'image',
          description: 'upstream',
          image_price_per_call: 5,
          has_image_channel: true,
        },
      ],
      total: 2,
    })

    const state = useStore.getState() as any
    await state.fetchMe()

    await state.generateImage({
      prompt: '换个风格',
      aspectRatio: '1:1',
      quality: '1K',
      count: 1,
    })

    expect(meApi.playGenerateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-image-2-api',
      }),
      undefined,
    )
  })

  test('generateImage keeps raw prompt and still sends 1K size for local pool when model disables output size', async () => {
    vi.mocked(meApi.listMyModels).mockResolvedValue({
      items: [{
        id: 2,
        slug: 'single-default-size',
        type: 'image',
        description: 'single',
        image_price_per_call: 5,
        supports_multi_image: false,
        supports_output_size: false,
      }],
      total: 1,
    })
    const state = useStore.getState() as any
    await state.fetchImageModels()

    await state.generateImage({
      prompt: 'future skyline',
      aspectRatio: '16:9',
      quality: '4K',
      count: 4,
    })

    const [req] = vi.mocked(meApi.playGenerateImage).mock.calls.at(-1) || []
    expect(req).toMatchObject({
      model: 'single-default-size',
      prompt: 'future skyline',
      n: 1,
      size: '1280x720',
    })
  })

  test('generateImage keeps omitting size for upstream channel when model disables output size', async () => {
    vi.mocked(meApi.listMyModels).mockResolvedValue({
      items: [{
        id: 2,
        slug: 'upstream-default-size',
        type: 'image',
        description: 'upstream',
        image_price_per_call: 5,
        has_image_channel: true,
        supports_output_size: false,
      }],
      total: 1,
    })
    const state = useStore.getState() as any
    await state.fetchImageModels()

    await state.generateImage({
      prompt: 'future skyline',
      aspectRatio: '16:9',
      quality: '4K',
      count: 4,
    })

    const [req] = vi.mocked(meApi.playGenerateImage).mock.calls.at(-1) || []
    expect(req).toMatchObject({
      model: 'upstream-default-size',
      prompt: 'future skyline',
      n: 4,
    })
    expect(req).not.toHaveProperty('size')
  })

  test('generateImage refreshes history after API task failure', async () => {
    localStorage.setItem('gpt2api.access', 'access-token')
    const state = useStore.getState() as any
    await state.fetchMe()
    await state.fetchImageModels()
    vi.mocked(meApi.playGenerateImage).mockRejectedValue(new Error('内容审核未通过'))
    vi.mocked(meApi.listMyImageTasks).mockResolvedValue({
      items: [
        {
          id: 1,
          task_id: 'task-failed',
          user_id: 1,
          model_id: 1,
          account_id: 1,
          prompt: 'future skyline',
          n: 1,
          size: '1024x1024',
          status: 'failed',
          error: '内容审核未通过',
          credit_cost: 0,
          image_urls: [],
          thumb_urls: [],
          created_at: '2026-04-22T10:00:00Z',
          started_at: '2026-04-22T10:00:05Z',
          finished_at: '2026-04-22T10:00:12Z',
        },
      ],
      limit: 20,
      offset: 0,
    })

    await expect(
      state.generateImage({
        prompt: 'future skyline',
        aspectRatio: '1:1',
      }),
    ).rejects.toThrow('内容审核未通过')

    expect(meApi.getMe).toHaveBeenCalledTimes(2)
    expect(meApi.listMyImageTasks).toHaveBeenCalledTimes(1)
    expect((useStore.getState() as any).history[0].status).toBe('failed')
  })

  test('editImage keeps raw prompt when model supports output size, converts selected quality to actual size with multiple files and refreshes me plus history', async () => {
    localStorage.setItem('gpt2api.access', 'access-token')
    const state = useStore.getState() as any
    await state.fetchMe()
    await state.fetchImageModels()
    const files = [
      new File(['demo-1'], 'demo-1.png', { type: 'image/png' }),
      new File(['demo-2'], 'demo-2.png', { type: 'image/png' }),
    ]

    await state.editImage({
      prompt: 'portrait relight',
      aspectRatio: '2:3',
      quality: '2K',
      files,
      count: 3,
    })

    expect(meApi.playEditImage).toHaveBeenCalledWith(
      'gpt-image-1',
      'portrait relight',
      files,
      expect.objectContaining({ size: '1344x2016', n: 3 }),
    )
    expect(meApi.getMe).toHaveBeenCalledTimes(2)
    expect(meApi.listMyImageTasks).toHaveBeenCalledTimes(1)
  })

  test('editImage keeps raw prompt and still sends 1K size for local pool when model disables output size', async () => {
    vi.mocked(meApi.listMyModels).mockResolvedValue({
      items: [{
        id: 2,
        slug: 'single-default-size',
        type: 'image',
        description: 'single',
        image_price_per_call: 5,
        supports_multi_image: false,
        supports_output_size: false,
      }],
      total: 1,
    })
    const state = useStore.getState() as any
    await state.fetchImageModels()
    const files = [new File(['demo'], 'demo.png', { type: 'image/png' })]

    await state.editImage({
      prompt: 'portrait relight',
      aspectRatio: '2:3',
      quality: '4K',
      files,
      count: 3,
    })

    expect(meApi.playEditImage).toHaveBeenCalledWith(
      'single-default-size',
      'portrait relight',
      files,
      expect.objectContaining({ size: '672x1008', n: 1 }),
    )
  })

  test('editImage keeps omitting size for upstream channel when model disables output size', async () => {
    vi.mocked(meApi.listMyModels).mockResolvedValue({
      items: [{
        id: 2,
        slug: 'upstream-default-size',
        type: 'image',
        description: 'upstream',
        image_price_per_call: 5,
        has_image_channel: true,
        supports_output_size: false,
      }],
      total: 1,
    })
    const state = useStore.getState() as any
    await state.fetchImageModels()
    const files = [new File(['demo'], 'demo.png', { type: 'image/png' })]

    await state.editImage({
      prompt: 'portrait relight',
      aspectRatio: '2:3',
      quality: '4K',
      files,
      count: 3,
    })

    expect(meApi.playEditImage).toHaveBeenCalledWith(
      'upstream-default-size',
      'portrait relight',
      files,
      expect.objectContaining({ n: 3 }),
    )
    const opts = vi.mocked(meApi.playEditImage).mock.calls.at(-1)?.[3]
    expect(opts).not.toHaveProperty('size')
  })

  test('editImage refreshes history after API task failure', async () => {
    localStorage.setItem('gpt2api.access', 'access-token')
    const state = useStore.getState() as any
    await state.fetchMe()
    await state.fetchImageModels()
    vi.mocked(meApi.playEditImage).mockRejectedValue(new Error('上游未返回图片结果'))
    vi.mocked(meApi.listMyImageTasks).mockResolvedValue({
      items: [
        {
          id: 2,
          task_id: 'task-edit-failed',
          user_id: 1,
          model_id: 1,
          account_id: 1,
          prompt: 'portrait relight',
          n: 1,
          size: '1024x1792',
          status: 'failed',
          error: '上游未返回图片结果',
          credit_cost: 0,
          image_urls: [],
          thumb_urls: [],
          created_at: '2026-04-22T11:00:00Z',
          started_at: '2026-04-22T11:00:05Z',
          finished_at: '2026-04-22T11:00:12Z',
        },
      ],
      limit: 20,
      offset: 0,
    })

    await expect(
      state.editImage({
        prompt: 'portrait relight',
        aspectRatio: '2:3',
        files: [new File(['demo'], 'demo.png', { type: 'image/png' })],
      }),
    ).rejects.toThrow('上游未返回图片结果')

    expect(meApi.getMe).toHaveBeenCalledTimes(2)
    expect(meApi.listMyImageTasks).toHaveBeenCalledTimes(1)
    expect((useStore.getState() as any).history[0].status).toBe('failed')
  })
})
