import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('motion/react', async () => {
  const React = await import('react')

  const motion = new Proxy(
    {},
    {
      get: (_, tag: string) =>
        React.forwardRef(({ children, ...props }: any, ref) => React.createElement(tag, { ref, ...props }, children)),
    },
  )

  return {
    motion,
    AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
  }
})

vi.mock('../api/me', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/me')>()
  return {
    ...actual,
    changeMyPassword: vi.fn(),
  }
})

vi.mock('../api/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/auth')>()
  return {
    ...actual,
    sendRegisterEmailCode: vi.fn(),
  }
})

const meApi = await import('../api/me')
const authApi = await import('../api/auth')
const httpModule = await import('../api/http')
const storeModule = await import('../store/useStore')
const useStore = storeModule.useStore
const { default: AuthOverlay } = await import('./AuthOverlay')
const { default: HistoryView } = await import('./views/History')
const { default: ProfileView } = await import('./views/Profile')

function resetStore() {
  const initial = useStore.getInitialState()
  useStore.setState(initial, true)
  localStorage.clear()
  sessionStorage.clear()
}

async function switchToRegisterMode() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '立即注册' }))
  })
}

describe('wap backend bindings', () => {
  beforeEach(() => {
    resetStore()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  afterEach(() => {
    resetStore()
    vi.useRealTimers()
  })

  test('auth overlay uses email and password login fields and hides register entry when register is disabled', () => {
    useStore.setState({
      siteInfo: {
        ...useStore.getState().siteInfo,
        'auth.allow_register': 'false',
      },
      login: vi.fn().mockResolvedValue(undefined),
      register: vi.fn().mockResolvedValue(undefined),
      closeAuth: vi.fn(),
    })

    render(<AuthOverlay onClose={vi.fn()} />)

    expect(screen.queryByPlaceholderText('用户名')).toBeNull()
    expect(screen.getByPlaceholderText('电子邮箱')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('密码')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '立即注册' })).toBeNull()
  })

  test('auth overlay shows email code controls when email verification is required', async () => {
    useStore.setState({
      siteInfo: {
        ...useStore.getState().siteInfo,
        'auth.allow_register': 'true',
        'auth.require_email_verify': 'true',
      },
      login: vi.fn().mockResolvedValue(undefined),
      register: vi.fn().mockResolvedValue(undefined),
      closeAuth: vi.fn(),
    })

    render(<AuthOverlay onClose={vi.fn()} />)
    await switchToRegisterMode()

    expect(screen.getByPlaceholderText('邮箱验证码')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '发送验证码' })).toBeInTheDocument()
  })

  test('auth overlay hides email code controls when email verification is disabled', async () => {
    useStore.setState({
      siteInfo: {
        ...useStore.getState().siteInfo,
        'auth.allow_register': 'true',
        'auth.require_email_verify': 'false',
      },
      login: vi.fn().mockResolvedValue(undefined),
      register: vi.fn().mockResolvedValue(undefined),
      closeAuth: vi.fn(),
    })

    render(<AuthOverlay onClose={vi.fn()} />)
    await switchToRegisterMode()

    expect(screen.queryByPlaceholderText('邮箱验证码')).toBeNull()
    expect(screen.queryByRole('button', { name: '发送验证码' })).toBeNull()
  })

  test('auth overlay submits email_code during register', async () => {
    const register = vi.fn().mockResolvedValue(undefined)

    useStore.setState({
      siteInfo: {
        ...useStore.getState().siteInfo,
        'auth.allow_register': 'true',
        'auth.require_email_verify': 'true',
      },
      login: vi.fn().mockResolvedValue(undefined),
      register,
      closeAuth: vi.fn(),
    })

    render(<AuthOverlay onClose={vi.fn()} />)
    await switchToRegisterMode()

    fireEvent.change(screen.getByPlaceholderText('昵称'), { target: { value: 'Demo' } })
    fireEvent.change(screen.getByPlaceholderText('电子邮箱'), { target: { value: 'demo@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('密码'), { target: { value: 'secret123' } })
    fireEvent.change(screen.getByPlaceholderText('邮箱验证码'), { target: { value: '123456' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '立即注册' }))
    })

    expect(register).toHaveBeenCalledWith({
      nickname: 'Demo',
      email: 'demo@example.com',
      password: 'secret123',
      email_code: '123456',
    })
  })

  test('auth overlay clears email code when email changes', async () => {
    useStore.setState({
      siteInfo: {
        ...useStore.getState().siteInfo,
        'auth.allow_register': 'true',
        'auth.require_email_verify': 'true',
      },
      login: vi.fn().mockResolvedValue(undefined),
      register: vi.fn().mockResolvedValue(undefined),
      closeAuth: vi.fn(),
    })

    render(<AuthOverlay onClose={vi.fn()} />)
    await switchToRegisterMode()

    fireEvent.change(screen.getByPlaceholderText('电子邮箱'), { target: { value: 'first@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('邮箱验证码'), { target: { value: '123456' } })
    fireEvent.change(screen.getByPlaceholderText('电子邮箱'), { target: { value: 'second@example.com' } })

    expect(screen.getByPlaceholderText('邮箱验证码')).toHaveValue('')
  })

  test('auth overlay starts and restores email code countdown', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-27T08:00:00.000Z'))
    vi.mocked(authApi.sendRegisterEmailCode).mockResolvedValue({
      sent: true,
      expire_sec: 600,
      retry_after_sec: 60,
    })

    useStore.setState({
      siteInfo: {
        ...useStore.getState().siteInfo,
        'auth.allow_register': 'true',
        'auth.require_email_verify': 'true',
      },
      login: vi.fn().mockResolvedValue(undefined),
      register: vi.fn().mockResolvedValue(undefined),
      closeAuth: vi.fn(),
    })

    const { unmount } = render(<AuthOverlay onClose={vi.fn()} />)
    await switchToRegisterMode()

    fireEvent.change(screen.getByPlaceholderText('电子邮箱'), { target: { value: 'demo@example.com' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '发送验证码' }))
      await Promise.resolve()
    })

    expect(authApi.sendRegisterEmailCode).toHaveBeenCalledWith({ email: 'demo@example.com' })
    expect(screen.getByRole('button', { name: '60s 后重发' })).toBeInTheDocument()

    unmount()

    render(<AuthOverlay onClose={vi.fn()} />)
    await switchToRegisterMode()

    expect(screen.getByPlaceholderText('电子邮箱')).toHaveValue('demo@example.com')
    expect(screen.getByRole('button', { name: '60s 后重发' })).toBeInTheDocument()
  })

  test('auth overlay resets countdown from retry_after_sec on rate limit', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-27T08:00:00.000Z'))
    const ApiErrorCtor = ((httpModule as any).ApiError as typeof Error | undefined) ?? Error

    vi.mocked(authApi.sendRegisterEmailCode).mockRejectedValue(
      new (ApiErrorCtor as any)('email code requested too frequently', {
        status: 429,
        code: 42900,
        data: { retry_after_sec: 18 },
      }),
    )

    useStore.setState({
      siteInfo: {
        ...useStore.getState().siteInfo,
        'auth.allow_register': 'true',
        'auth.require_email_verify': 'true',
      },
      login: vi.fn().mockResolvedValue(undefined),
      register: vi.fn().mockResolvedValue(undefined),
      closeAuth: vi.fn(),
    })

    render(<AuthOverlay onClose={vi.fn()} />)
    await switchToRegisterMode()

    fireEvent.change(screen.getByPlaceholderText('电子邮箱'), { target: { value: 'demo@example.com' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '发送验证码' }))
      await Promise.resolve()
    })

    expect(authApi.sendRegisterEmailCode).toHaveBeenCalledWith({ email: 'demo@example.com' })
    expect(screen.getByRole('button', { name: '18s 后重发' })).toBeInTheDocument()
  })

  test('history view loads server records and renders preview from thumb_urls', async () => {
    const fetchHistory = vi.fn().mockResolvedValue([])
    useStore.setState({
      user: {
        id: 1,
        email: 'demo@example.com',
        nickname: 'Demo',
        role: 'user',
        status: 'active',
        group_id: 1,
        credit_balance: 89900,
        credit_frozen: 0,
      },
      historyLoaded: false,
      fetchHistory,
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
          thumb_urls: ['/p/thumb/task-1/0'],
          created_at: '2026-04-22T10:00:00Z',
        },
      ],
    })

    render(<HistoryView />)

    await waitFor(() => expect(fetchHistory).toHaveBeenCalledTimes(1))
    expect(screen.getByAltText('Cloud city')).toHaveAttribute('src', '/p/thumb/task-1/0')
  })

  test('history view refresh button forces server reload', async () => {
    const fetchHistory = vi.fn().mockResolvedValue([])
    useStore.setState({
      user: {
        id: 1,
        email: 'demo@example.com',
        nickname: 'Demo',
        role: 'user',
        status: 'active',
        group_id: 1,
        credit_balance: 89900,
        credit_frozen: 0,
      },
      historyLoaded: true,
      historyLoading: false,
      fetchHistory,
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
          thumb_urls: ['/p/thumb/task-1/0'],
          created_at: '2026-04-22T10:00:00Z',
        },
      ],
    })

    render(<HistoryView />)

    await waitFor(() => expect(fetchHistory).toHaveBeenCalledTimes(1))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '刷新记录' }))
    })

    expect(fetchHistory).toHaveBeenCalledTimes(2)
    expect(fetchHistory).toHaveBeenLastCalledWith(true)
  })

  test('profile view loads history count when opened before history tab', async () => {
    const fetchHistory = vi.fn().mockImplementation(async () => {
      useStore.setState({
        historyLoaded: true,
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
      })
      return useStore.getState().history
    })

    useStore.setState({
      user: {
        id: 1,
        email: 'demo@example.com',
        nickname: 'Demo',
        role: 'user',
        status: 'active',
        group_id: 1,
        credit_balance: 89900,
        credit_frozen: 0,
      },
      history: [],
      historyLoaded: false,
      fetchHistory,
      checkin: {
        enabled: true,
        today: '2026-04-22',
        checked_in: false,
        today_reward_credits: 5,
        checked_at: '',
        last_checked_at: '',
        balance_after: 0,
        awarded_credits: 0,
      },
      submitCheckin: vi.fn().mockResolvedValue({
        enabled: true,
        today: '2026-04-22',
        checked_in: false,
        today_reward_credits: 5,
        checked_at: '',
        last_checked_at: '',
        balance_after: 0,
        awarded_credits: 0,
      }),
      fetchMe: vi.fn().mockResolvedValue(null),
      logout: vi.fn(),
    } as any)

    render(<ProfileView />)

    await waitFor(() => expect(fetchHistory).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('button', { name: /我的创作 2/ })).toBeInTheDocument()
  })

  test('history view renders processing and failed task states', async () => {
    const fetchHistory = vi.fn().mockResolvedValue([])
    useStore.setState({
      user: {
        id: 1,
        email: 'demo@example.com',
        nickname: 'Demo',
        role: 'user',
        status: 'active',
        group_id: 1,
        credit_balance: 89900,
        credit_frozen: 0,
      },
      historyLoaded: false,
      fetchHistory,
      history: [
        {
          id: 1,
          task_id: 'task-processing',
          user_id: 1,
          model_id: 1,
          account_id: 1,
          prompt: 'Processing city',
          n: 1,
          size: '1024x1024',
          status: 'processing',
          credit_cost: 5,
          image_urls: [],
          created_at: '2026-04-22T10:00:00Z',
          started_at: '2026-04-22T10:00:05Z',
          finished_at: null,
        },
        {
          id: 2,
          task_id: 'task-failed',
          user_id: 1,
          model_id: 2,
          account_id: 1,
          prompt: 'Failed city',
          n: 1,
          size: '1024x1024',
          status: 'failed',
          error: '内容审核未通过',
          credit_cost: 5,
          image_urls: [],
          created_at: '2026-04-22T11:00:00Z',
          started_at: '2026-04-22T11:00:05Z',
          finished_at: '2026-04-22T11:00:12Z',
        },
      ],
    })

    render(<HistoryView />)

    await waitFor(() => expect(fetchHistory).toHaveBeenCalledTimes(1))
    expect(screen.getAllByText('生成中').length).toBeGreaterThan(0)
    expect(screen.getAllByText('生成失败').length).toBeGreaterThan(0)

    await act(async () => {
      fireEvent.click(screen.getByText('Processing city'))
    })
    expect(await screen.findByText('任务状态')).toBeInTheDocument()
    expect(screen.getAllByText('处理中').length).toBeGreaterThan(0)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '关闭详情' }))
    })
    await waitFor(() => expect(screen.queryByText('任务状态')).toBeNull())

    await act(async () => {
      fireEvent.click(screen.getByText('Failed city'))
    })
    await waitFor(() => expect(screen.getAllByText('任务失败').length).toBeGreaterThan(0))
    expect(screen.getByText('失败原因')).toBeInTheDocument()
    expect(screen.getAllByText('内容审核未通过').length).toBeGreaterThan(0)
  })

  test('history view removes share action and downloads original image', async () => {
    const fetchHistory = vi.fn().mockResolvedValue([])
    const blob = new Blob(['image-binary'], { type: 'image/png' })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(blob),
      headers: {
        get: vi.fn((name: string) => (name.toLowerCase() === 'content-type' ? 'image/png' : null)),
      },
    })
    const createObjectURL = vi.fn().mockReturnValue('blob:task-1')
    const revokeObjectURL = vi.fn()
    const clickedDownloads: string[] = []
    const clickedHrefs: string[] = []
    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL
    const originalAnchorClick = HTMLAnchorElement.prototype.click

    useStore.setState({
      user: {
        id: 1,
        email: 'demo@example.com',
        nickname: 'Demo',
        role: 'user',
        status: 'active',
        group_id: 1,
        credit_balance: 89900,
        credit_frozen: 0,
      },
      historyLoaded: false,
      fetchHistory,
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
          thumb_urls: ['/p/thumb/task-1/0'],
          created_at: '2026-04-22T10:00:00Z',
        },
      ],
    })

    vi.stubGlobal('fetch', fetchMock)
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = revokeObjectURL
    HTMLAnchorElement.prototype.click = vi.fn(function (this: HTMLAnchorElement) {
      clickedDownloads.push(this.download)
      clickedHrefs.push(this.href)
    }) as unknown as typeof HTMLAnchorElement.prototype.click

    try {
      render(<HistoryView />)

      await waitFor(() => expect(fetchHistory).toHaveBeenCalledTimes(1))

      await act(async () => {
        fireEvent.click(screen.getByText('Cloud city'))
      })

      expect(await screen.findByText('任务状态')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '分享链接' })).toBeNull()
      expect(screen.getByAltText('Detail')).toHaveAttribute('src', '/p/thumb/task-1/0')

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '下载原图' }))
      })

      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/p/img/task-1/0'))
      expect(createObjectURL).toHaveBeenCalledWith(blob)
      expect(clickedHrefs).toEqual(['blob:task-1'])
      expect(clickedDownloads[0]).toContain('task-1')
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:task-1')
    } finally {
      HTMLAnchorElement.prototype.click = originalAnchorClick
      URL.createObjectURL = originalCreateObjectURL
      URL.revokeObjectURL = originalRevokeObjectURL
      vi.unstubAllGlobals()
    }
  })

  test('history view supports swiping multi-image preview', async () => {
    const fetchHistory = vi.fn().mockResolvedValue([])
    const blob = new Blob(['image-binary'], { type: 'image/png' })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(blob),
      headers: {
        get: vi.fn((name: string) => (name.toLowerCase() === 'content-type' ? 'image/png' : null)),
      },
    })
    const createObjectURL = vi.fn().mockReturnValue('blob:task-2')
    const revokeObjectURL = vi.fn()
    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL
    const originalAnchorClick = HTMLAnchorElement.prototype.click

    useStore.setState({
      user: {
        id: 1,
        email: 'demo@example.com',
        nickname: 'Demo',
        role: 'user',
        status: 'active',
        group_id: 1,
        credit_balance: 89900,
        credit_frozen: 0,
      },
      historyLoaded: false,
      fetchHistory,
      history: [
        {
          id: 2,
          task_id: 'task-2',
          user_id: 1,
          model_id: 1,
          account_id: 1,
          prompt: 'Multi city',
          n: 2,
          size: '1024x1024',
          status: 'succeeded',
          credit_cost: 10,
          image_urls: ['/p/img/task-2/0', '/p/img/task-2/1'],
          thumb_urls: ['/p/thumb/task-2/0', '/p/thumb/task-2/1'],
          created_at: '2026-04-22T12:00:00Z',
        },
      ],
    })

    vi.stubGlobal('fetch', fetchMock)
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = revokeObjectURL
    HTMLAnchorElement.prototype.click = vi.fn() as unknown as typeof HTMLAnchorElement.prototype.click

    try {
      render(<HistoryView />)

      await waitFor(() => expect(fetchHistory).toHaveBeenCalledTimes(1))

      await act(async () => {
        fireEvent.click(screen.getByText('Multi city'))
      })

      expect(await screen.findByText('任务状态')).toBeInTheDocument()
      expect(screen.getByAltText('Detail')).toHaveAttribute('src', '/p/thumb/task-2/0')
      expect(screen.getByText('1 / 2')).toBeInTheDocument()

      await act(async () => {
        fireEvent.touchStart(screen.getByAltText('Detail'), {
          touches: [{ clientX: 240 }],
          changedTouches: [{ clientX: 240 }],
        })
        fireEvent.touchEnd(screen.getByAltText('Detail'), {
          changedTouches: [{ clientX: 40 }],
        })
      })

      await waitFor(() => expect(screen.getByAltText('Detail')).toHaveAttribute('src', '/p/thumb/task-2/1'))
      expect(screen.getByText('2 / 2')).toBeInTheDocument()

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '下载原图' }))
      })

      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/p/img/task-2/1'))
      expect(createObjectURL).toHaveBeenCalledWith(blob)
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:task-2')
    } finally {
      HTMLAnchorElement.prototype.click = originalAnchorClick
      URL.createObjectURL = originalCreateObjectURL
      URL.revokeObjectURL = originalRevokeObjectURL
      vi.unstubAllGlobals()
    }
  })

  test('history view constrains long prompt inside detail panel', async () => {
    const fetchHistory = vi.fn().mockResolvedValue([])
    const longPrompt = 'ultra-detailed-cinematic-neon-city-'.repeat(24)

    useStore.setState({
      user: {
        id: 1,
        email: 'demo@example.com',
        nickname: 'Demo',
        role: 'user',
        status: 'active',
        group_id: 1,
        credit_balance: 89900,
        credit_frozen: 0,
      },
      historyLoaded: false,
      fetchHistory,
      history: [
        {
          id: 3,
          task_id: 'task-3',
          user_id: 1,
          model_id: 1,
          account_id: 1,
          prompt: longPrompt,
          n: 1,
          size: '1024x1024',
          status: 'succeeded',
          credit_cost: 5,
          image_urls: ['/p/img/task-3/0'],
          thumb_urls: ['/p/thumb/task-3/0'],
          created_at: '2026-04-22T13:00:00Z',
        },
      ],
    })

    render(<HistoryView />)

    await waitFor(() => expect(fetchHistory).toHaveBeenCalledTimes(1))

    await act(async () => {
      fireEvent.click(screen.getByAltText(longPrompt))
    })

    expect(await screen.findByText('任务状态')).toBeInTheDocument()

    const promptHeading = screen.getByRole('heading', { name: longPrompt })
    expect(promptHeading.className).toContain('max-h-32')
    expect(promptHeading.className).toContain('overflow-y-auto')
    expect(promptHeading.className).toContain('break-words')
    expect(promptHeading.className).toContain('whitespace-pre-wrap')
  })

  test('profile view renders scaled credit values and submits checkin', async () => {
    const submitCheckin = vi.fn().mockResolvedValue({
      enabled: true,
      today: '2026-04-22',
      checked_in: true,
      today_reward_credits: 500,
      checked_at: '2026-04-22T09:00:00Z',
      last_checked_at: '2026-04-22T09:00:00Z',
      balance_after: 90400,
      awarded_credits: 500,
    })

    useStore.setState({
      user: {
        id: 1,
        email: 'demo@example.com',
        nickname: 'Demo',
        role: 'user',
        status: 'active',
        group_id: 1,
        credit_balance: 89900,
        credit_frozen: 0,
      },
      checkin: {
        enabled: true,
        today: '2026-04-22',
        checked_in: false,
        today_reward_credits: 500,
        checked_at: '',
        last_checked_at: '',
        balance_after: 89900,
        awarded_credits: 0,
      },
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
      fetchHistory: vi.fn().mockResolvedValue([
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
      ]),
      submitCheckin,
      logout: vi.fn(),
    })

    render(<ProfileView />)

    expect(screen.getByText('Demo')).toBeInTheDocument()
    expect(screen.getByText('8.99 积分')).toBeInTheDocument()
    expect(screen.queryByText('USER')).toBeNull()

    const avatar = screen.getByRole('img', { name: '用户头像' })
    expect(avatar.querySelector('svg')).not.toBeNull()
    expect(within(avatar).queryByText('D')).toBeNull()

    const rewardCard = screen.getByText('今日奖励').closest('div')
    expect(rewardCard).not.toBeNull()
    expect(within(rewardCard as HTMLElement).getByText('0.05')).toBeInTheDocument()

    expect(screen.getAllByText(/我的创作/)).toHaveLength(1)
    expect(screen.queryByText('作品数量')).toBeNull()

    const balanceCard = screen.getByText('可用积分').closest('div')
    expect(balanceCard).not.toBeNull()
    expect(within(balanceCard as HTMLElement).getByText('8.99')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '每日签到' }))

    await waitFor(() => expect(submitCheckin).toHaveBeenCalledTimes(1))
  })

  test('profile membership entry opens coming soon dialog', async () => {
    useStore.setState({
      user: {
        id: 1,
        email: 'demo@example.com',
        nickname: 'Demo',
        role: 'user',
        status: 'active',
        group_id: 1,
        credit_balance: 89900,
        credit_frozen: 0,
      },
      checkin: {
        enabled: true,
        today: '2026-04-22',
        checked_in: false,
        today_reward_credits: 500,
        checked_at: '',
        last_checked_at: '',
        balance_after: 89900,
        awarded_credits: 0,
      },
      history: [],
      historyLoaded: true,
      fetchHistory: vi.fn().mockResolvedValue([]),
      logout: vi.fn(),
    })

    render(<ProfileView />)

    expect(screen.queryByText('敬请期待')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '我的会员 超值特惠' }))

    expect(await screen.findByText('敬请期待')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '知道了' })).toBeInTheDocument()
  })

  test('profile security center submits password change and forces relogin', async () => {
    const forceRelogin = vi.fn()
    ;(meApi as any).changeMyPassword.mockResolvedValue({ updated: true })

    useStore.setState({
      user: {
        id: 1,
        email: 'demo@example.com',
        nickname: 'Demo',
        role: 'user',
        status: 'active',
        group_id: 1,
        credit_balance: 89900,
        credit_frozen: 0,
      },
      checkin: {
        enabled: true,
        today: '2026-04-22',
        checked_in: false,
        today_reward_credits: 500,
        checked_at: '',
        last_checked_at: '',
        balance_after: 89900,
        awarded_credits: 0,
      },
      history: [],
      historyLoaded: true,
      fetchHistory: vi.fn().mockResolvedValue([]),
      submitCheckin: vi.fn().mockResolvedValue({
        enabled: true,
        today: '2026-04-22',
        checked_in: false,
        today_reward_credits: 500,
        checked_at: '',
        last_checked_at: '',
        balance_after: 89900,
        awarded_credits: 0,
      }),
      logout: vi.fn(),
      forceRelogin,
    } as any)

    render(<ProfileView />)

    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '安全中心' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('修改密码')).toBeInTheDocument()

    fireEvent.change(within(dialog).getByPlaceholderText('请输入原密码'), {
      target: { value: 'old-password' },
    })
    fireEvent.change(within(dialog).getByPlaceholderText('请输入新密码'), {
      target: { value: 'new-password-123' },
    })
    fireEvent.change(within(dialog).getByPlaceholderText('请再次输入新密码'), {
      target: { value: 'new-password-123' },
    })

    fireEvent.click(within(dialog).getByRole('button', { name: '确认修改' }))

    await waitFor(() =>
      expect((meApi as any).changeMyPassword).toHaveBeenCalledWith({
        old_password: 'old-password',
        new_password: 'new-password-123',
      }),
    )
    await waitFor(() => expect(forceRelogin).toHaveBeenCalledWith('profile'))
  })
})
