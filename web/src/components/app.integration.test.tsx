import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

vi.mock('../api/announcement', () => ({
  listPublicAnnouncements: vi.fn(),
}))

vi.mock('../api/apikey', () => ({
  listKeys: vi.fn(),
  createKey: vi.fn(),
  updateKey: vi.fn(),
  deleteKey: vi.fn(),
}))

const siteApi = await import('../api/site')
const meApi = await import('../api/me')
const rechargeApi = await import('../api/recharge')
const creditApi = await import('../api/credit')
const announcementApi = await import('../api/announcement')
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

function hasTextContent(text: string, tagName?: string) {
  return (_: string, node: Element | null) => {
    if (!node?.textContent?.includes(text)) {
      return false
    }
    if (!tagName) {
      return true
    }
    return node.tagName === tagName.toUpperCase()
  }
}

function compactText(text: string | null | undefined) {
  return text?.replace(/\s+/g, '') ?? ''
}

describe('web integration', () => {
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
    vi.mocked(announcementApi.listPublicAnnouncements).mockResolvedValue({
      items: [],
      total: 0,
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

  test('app exposes named desktop and mobile navigation containers', () => {
    render(<App />)

    expect(screen.getByRole('navigation', { name: '桌面侧边导航' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '移动底部导航' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '桌面信息栏' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '生图' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '生成' })).toBeNull()
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

    expect(screen.getAllByText('星河图像')).toHaveLength(2)
    expect(screen.getByText('© 星河图像')).toBeInTheDocument()
    expect(screen.queryByText('Creative Intelligent Systems')).toBeNull()
  })

  test('profile layout keeps bottom spacing compact when content is short', () => {
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

    const main = screen.getByRole('main')
    expect(main.className).toContain('flex-1')
    expect(main.className).toContain('flex')
    expect(main.className).toContain('flex-col')

    const profileFooter = screen.getByText('© 星河图像').parentElement
    expect(profileFooter).not.toBeNull()
    expect(profileFooter?.className).toContain('mt-auto')
    expect(profileFooter?.className).toContain('pb-6')
    expect(profileFooter?.className).not.toContain('pb-12')

    const profileContentColumn = profileFooter?.parentElement
    expect(profileContentColumn).not.toBeNull()
    expect(profileContentColumn?.className).toContain('flex')
    expect(profileContentColumn?.className).toContain('flex-1')
    expect(profileContentColumn?.className).toContain('flex-col')
  })

  test('profile menu does not render help entry', () => {
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
    })

    render(<App />)

    expect(screen.getByText('我的会员')).toBeInTheDocument()
    expect(screen.getByText('API Keys')).toBeInTheDocument()
    expect(screen.getByText('充值积分')).toBeInTheDocument()
    expect(screen.getByText('安全中心')).toBeInTheDocument()
    expect(screen.queryByText('帮助与反馈')).toBeNull()
  })

  test('profile header does not render settings icon button', () => {
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
    })

    const { container } = render(<App />)

    expect(screen.getByText('个人中心')).toBeInTheDocument()
    expect(container.querySelector('.lucide-settings')).toBeNull()
  })

  test('profile does not render account status card', () => {
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
    })

    render(<App />)

    expect(screen.queryByText('账号状态')).toBeNull()
    expect(screen.queryByText('创作数量')).toBeNull()
  })

  test('desktop sidebar places logout action under user summary', () => {
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
    })

    render(<App />)

    const desktopSidebar = screen.getByRole('navigation', { name: '桌面侧边导航' }).closest('aside')

    expect(desktopSidebar).not.toBeNull()
    expect(within(desktopSidebar as HTMLElement).getByRole('button', { name: '退出登录' })).toBeInTheDocument()
    expect(
      screen
        .getAllByRole('button', { name: '退出登录' })
        .some((button) => button.className.includes('lg:hidden')),
    ).toBe(true)
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
    expect(await screen.findByText('图片生成消费')).toBeInTheDocument()
    expect(await screen.findByText('-12.00')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '返回个人中心' }))

    await waitFor(() => {
      expect(screen.getByText('个人中心')).toBeInTheDocument()
    })
  })

  test('home page renders video capability card and reserved entry dialog copy', async () => {
    render(<HomeView onStartGeneration={() => {}} />)

    const heroSection = screen.getByAltText('Hero').closest('section')
    const featureGrid = screen.getByRole('region', { name: '核心功能列表' })

    expect(screen.getByText('文生图')).toBeInTheDocument()
    expect(screen.getByText('图生图')).toBeInTheDocument()
    expect(screen.getByText('生成视频')).toBeInTheDocument()
    expect(screen.getByText('视频生成功能正在蓄力中，很快就能把你的想法变成动态画面啦✨')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.queryByText('极致优化')).toBeNull()
    expect(screen.queryByText('灵感图鉴')).toBeNull()
    expect(screen.queryByText('更多作品')).toBeNull()
    expect(heroSection?.className).toContain('h-[320px]')
    expect(heroSection?.className).toContain('lg:min-h-[460px]')
    expect(featureGrid.className).toContain('lg:grid-cols-3')

    fireEvent.click(screen.getByText('生成视频'))

    await waitFor(() => {
      expect(screen.getAllByText('视频生成功能正在蓄力中，很快就能把你的想法变成动态画面啦✨')).toHaveLength(2)
    })
  })

  test('home capability card triggers generation when clicking card content', () => {
    const onStartGeneration = vi.fn()

    render(<HomeView onStartGeneration={onStartGeneration} />)

    fireEvent.click(screen.getByText('文生图'))

    expect(onStartGeneration).toHaveBeenCalledTimes(1)
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
        { id: 2, slug: 'gpt-image-2', type: 'image', description: '高质量模型', image_price_per_call: 3000 },
      ],
      selectedImageModel: 'gpt-image-1',
      setSelectedImageModel: (slug: string | null) => useStore.setState({ selectedImageModel: slug }),
    } as any)

    render(<GenerateView />)

    expect(screen.queryByText('极致优化')).toBeNull()
    expect(screen.getByText(hasTextContent('当前质量价格：0.15 积分 / 张', 'p'))).toBeInTheDocument()
    expect(screen.getByText('多张生成会按张数累计扣费')).toBeInTheDocument()
    expect(screen.getByText(hasTextContent('当前 1 张，预计消耗 0.15 积分', 'p'))).toBeInTheDocument()

    const modelTrigger = screen.getByRole('button', { name: /图片模型.*gpt-image-1/ })
    expect(modelTrigger).toBeInTheDocument()
    expect(compactText(modelTrigger.textContent)).toBe('gpt-image-1标准模型')
    expect(screen.queryByRole('listbox', { name: '图片模型列表' })).toBeNull()

    fireEvent.click(modelTrigger)

    const modelList = screen.getByRole('listbox', { name: '图片模型列表' })
    expect(modelList).toBeInTheDocument()
    expect(modelTrigger.className).toContain('ring-2')
    expect(modelTrigger.className).toContain('border-primary/80')
    expect(modelTrigger.className).toContain('bg-card')

    const modelPickerPanel = document.querySelector('[data-model-picker-panel="true"]')
    expect(modelPickerPanel).toBeInTheDocument()
    expect(modelPickerPanel?.className).toContain('ring-primary/20')
    expect(modelPickerPanel?.className).toContain('bg-popover')
    expect(modelPickerPanel?.className).toContain('shadow-[0_24px_70px_-28px_rgba(0,0,0,0.85)]')

    const highQualityOption = screen.getByRole('button', { name: /gpt-image-2.*高质量模型/ })
    expect(compactText(highQualityOption.textContent)).toBe('gpt-image-2高质量模型')

    fireEvent.click(highQualityOption)

    await waitFor(() => {
      expect(screen.queryByRole('listbox', { name: '图片模型列表' })).toBeNull()
    })

    expect(screen.getByText(hasTextContent('当前质量价格：0.30 积分 / 张', 'p'))).toBeInTheDocument()
    expect(compactText(modelTrigger.textContent)).toBe('gpt-image-2高质量模型')

    const createButton = screen.getByRole('button', { name: '开始创作' })
    expect(createButton).toBeInTheDocument()
    expect(createButton.className).not.toContain('text-white')

    const ratioDesc = screen.getByText('社交媒体')
    expect(ratioDesc.className).not.toContain('text-white')
    expect(screen.getByRole('button', { name: '16:9 宽屏' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2:3 竖版' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1K' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2K' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '4K' })).toBeInTheDocument()
    expect(screen.queryByText('Catmull-Rom 插值')).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: '图生图' }))
    expect(screen.queryByText('Catmull-Rom 插值')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: '文生图' }))

    fireEvent.click(screen.getByRole('button', { name: '16:9 宽屏' }))
    fireEvent.click(screen.getByRole('button', { name: '4K' }))
    fireEvent.click(screen.getByRole('button', { name: '4 张' }))
    expect(screen.getByText(hasTextContent('当前 4 张，预计消耗 1.20 积分', 'p'))).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('描述想看到的画面...'), {
      target: { value: '未来城市夜景' },
    })
    fireEvent.click(createButton)

    await waitFor(() => {
      expect(generateImage).toHaveBeenCalledWith({
        prompt: '未来城市夜景',
        aspectRatio: '16:9',
        quality: '4K',
        count: 4,
      })
    })

    await waitFor(() => {
      expect(screen.getAllByAltText(/Result /)).toHaveLength(4)
    })
  })
})
