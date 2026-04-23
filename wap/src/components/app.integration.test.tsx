import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

vi.mock('../api/recharge', () => ({
  redeemCode: vi.fn(),
}))

vi.mock('../api/credit', () => ({
  listMyCreditLogs: vi.fn(),
}))

const siteApi = await import('../api/site')
const meApi = await import('../api/me')
const rechargeApi = await import('../api/recharge')
const creditApi = await import('../api/credit')
const storeModule = await import('../store/useStore')
const useStore = storeModule.useStore
const { default: App } = await import('../App')
const { default: HomeView } = await import('./views/Home')
const { default: GenerateView } = await import('./views/Generate')

function resetStore() {
  const initial = useStore.getInitialState()
  useStore.setState(initial, true)
  localStorage.clear()
}

describe('wap integration', () => {
  beforeEach(() => {
    resetStore()
    vi.clearAllMocks()
    vi.mocked(siteApi.fetchSiteInfo).mockResolvedValue({
      'site.name': 'GPT2API',
      'auth.allow_register': 'true',
    })
    vi.mocked(meApi.listMyImageTasks).mockResolvedValue({
      items: [],
      limit: 20,
      offset: 0,
    })
    vi.mocked(creditApi.listMyCreditLogs).mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    })
  })

  afterEach(() => {
    resetStore()
  })

  test('anonymous navigation to history opens auth overlay and keeps current tab', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '记录' }))

    await waitFor(() => expect(screen.getByText('欢迎回来')).toBeInTheDocument())
    expect(useStore.getState().pendingTab).toBe('history')
    expect(useStore.getState().activeTab).toBe('home')
  })

  test('app header renders scaled credit balance', () => {
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
      bootstrapApp: vi.fn().mockResolvedValue(undefined),
    })

    render(<App />)

    expect(screen.getByText('8.99')).toBeInTheDocument()
  })

  test('home footer uses site name from site info', () => {
    useStore.setState({
      siteInfo: {
        'site.name': '星河图像',
        'site.description': 'AI 创作平台',
        'site.logo_url': '',
        'site.footer': '',
        'auth.allow_register': 'true',
      },
      bootstrapApp: vi.fn().mockResolvedValue(undefined),
    })

    render(<App />)

    expect(screen.getAllByText('星河图像')).toHaveLength(2)
    expect(screen.getByText('© 星河图像')).toBeInTheDocument()
    expect(screen.queryByText('GPT2API • Creative Studio')).toBeNull()
  })

  test('profile footer uses site name from site info', () => {
    useStore.setState({
      activeTab: 'profile',
      siteInfo: {
        'site.name': '星河图像',
        'site.description': 'AI 创作平台',
        'site.logo_url': '',
        'site.footer': '',
        'auth.allow_register': 'true',
      },
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
      checkin: {
        enabled: true,
        today: '2026-04-22',
        checked_in: false,
        today_reward_credits: 0,
        checked_at: '',
        last_checked_at: '',
        balance_after: 0,
        awarded_credits: 0,
      },
      bootstrapApp: vi.fn().mockResolvedValue(undefined),
    })

    render(<App />)

    expect(screen.getAllByText('星河图像').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('© 星河图像')).toBeInTheDocument()
    expect(screen.queryByText('Creative Intelligent Systems')).toBeNull()
  })

  test('profile recharge entry opens redeem dialog and submits redeem code', async () => {
    vi.mocked(rechargeApi.redeemCode).mockResolvedValue({
      code: 'ABC123',
      credits: 310000,
      balance_after: 120000,
    })

    const fetchMe = vi.fn().mockImplementation(async () => {
      useStore.setState((state) => ({
        user: state.user
          ? { ...state.user, credit_balance: 120000 }
          : state.user,
      }))
      return useStore.getState().user
    })

    useStore.setState({
      activeTab: 'profile',
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
      checkin: {
        enabled: true,
        today: '2026-04-22',
        checked_in: false,
        today_reward_credits: 0,
        checked_at: '',
        last_checked_at: '',
        balance_after: 0,
        awarded_credits: 0,
      },
      fetchMe,
      bootstrapApp: vi.fn().mockResolvedValue(undefined),
    } as any)

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /充值积分/ }))

    await waitFor(() => {
      expect(screen.getByPlaceholderText('请输入兑换码')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText('请输入兑换码'), {
      target: { value: 'ABC123' },
    })
    fireEvent.click(screen.getByRole('button', { name: '立即充值' }))

    await waitFor(() => {
      expect(rechargeApi.redeemCode).toHaveBeenCalledWith('ABC123')
    })
    await waitFor(() => {
      expect(fetchMe).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('请输入兑换码')).toBeNull()
    })
    expect(screen.getAllByText('12.00').length).toBeGreaterThan(0)
  })

  test('profile available credits card opens credit log detail and can navigate back', async () => {
    vi.mocked(creditApi.listMyCreditLogs).mockResolvedValue({
      items: [
        {
          id: 1,
          user_id: 1,
          key_id: 0,
          type: 'consume',
          amount: -120000,
          balance_after: 89900,
          ref_id: 'img_task_1',
          remark: '图片生成消费',
          created_at: '2026-04-23 10:00:00',
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    })

    useStore.setState({
      activeTab: 'profile',
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
      checkin: {
        enabled: true,
        today: '2026-04-22',
        checked_in: false,
        today_reward_credits: 0,
        checked_at: '',
        last_checked_at: '',
        balance_after: 0,
        awarded_credits: 0,
      },
      bootstrapApp: vi.fn().mockResolvedValue(undefined),
    } as any)

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '查看可用积分使用记录' }))

    await waitFor(() => {
      expect(screen.getByText('积分使用记录')).toBeInTheDocument()
    })
    expect(creditApi.listMyCreditLogs).toHaveBeenCalledWith({ limit: 20, offset: 0 })
    expect(screen.getByText('图片生成消费')).toBeInTheDocument()
    expect(screen.getByText('-12.00')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '返回个人中心' }))

    await waitFor(() => {
      expect(screen.getByText('个人中心')).toBeInTheDocument()
    })
  })

  test('home page only renders two capability cards', () => {
    render(<HomeView onStartGeneration={() => {}} />)

    expect(screen.getByText('文生图')).toBeInTheDocument()
    expect(screen.getByText('图生图')).toBeInTheDocument()
    expect(screen.queryByText('极致优化')).toBeNull()
    expect(screen.queryByText('灵感图鉴')).toBeNull()
    expect(screen.queryByText('更多作品')).toBeNull()
  })

  test('generate page supports model selection, count pricing copy and multi-image results', async () => {
    const generateImage = vi.fn().mockResolvedValue({
      created: 1,
      task_id: 'task-1',
      data: [
        { url: '/p/img/task-1/0' },
        { url: '/p/img/task-1/1' },
        { url: '/p/img/task-1/2' },
        { url: '/p/img/task-1/3' },
      ],
      is_preview: false,
    })

    useStore.setState({
      user: {
        id: 1,
        email: 'demo@example.com',
        nickname: 'Demo',
        role: 'user',
        status: 'active',
        group_id: 1,
        credit_balance: 2300,
        credit_frozen: 0,
      },
      generateImage,
      imageModels: [
        { id: 1, slug: 'gpt-image-1', type: 'image', description: '标准模型', image_price_per_call: 1500 },
        { id: 2, slug: 'gpt-image-pro', type: 'image', description: '高质量模型', image_price_per_call: 3000 },
      ],
      selectedImageModel: 'gpt-image-1',
      setSelectedImageModel: (slug: string | null) => useStore.setState({ selectedImageModel: slug }),
    } as any)

    render(<GenerateView />)

    expect(screen.queryByText('极致优化')).toBeNull()
    expect(screen.getByText('单张基准价格：0.15 积分 / 张')).toBeInTheDocument()
    expect(screen.getByText('多张生成会按张数累计扣费')).toBeInTheDocument()
    expect(screen.getByText('当前 1 张，预计消耗 0.15 积分')).toBeInTheDocument()

    const modelTrigger = screen.getByRole('button', { name: /图片模型.*标准模型/ })
    expect(modelTrigger).toBeInTheDocument()
    expect(screen.queryByRole('listbox', { name: '图片模型列表' })).toBeNull()

    fireEvent.click(modelTrigger)

    const modelList = screen.getByRole('listbox', { name: '图片模型列表' })
    expect(modelList).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /高质量模型/ }))

    await waitFor(() => {
      expect(screen.queryByRole('listbox', { name: '图片模型列表' })).toBeNull()
    })

    expect(screen.getByText('单张基准价格：0.30 积分 / 张')).toBeInTheDocument()

    const createButton = screen.getByRole('button', { name: '开始创作' })
    expect(createButton).toBeInTheDocument()
    expect(createButton.className).not.toContain('text-white')

    const ratioDesc = screen.getByText('社交媒体')
    expect(ratioDesc.className).not.toContain('text-white')

    fireEvent.click(screen.getByRole('button', { name: '4 张' }))
    expect(screen.getByText('当前 4 张，预计消耗 1.20 积分')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('描述想看到的画面...'), {
      target: { value: '未来城市夜景' },
    })
    fireEvent.click(createButton)

    await waitFor(() => {
      expect(generateImage).toHaveBeenCalledWith({
        prompt: '未来城市夜景',
        aspectRatio: '1:1',
        count: 4,
      })
    })

    await waitFor(() => {
      expect(screen.getAllByAltText(/Result /)).toHaveLength(4)
    })
  })
})
