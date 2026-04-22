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

const siteApi = await import('../api/site')
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

  test('home page only renders two capability cards', () => {
    render(<HomeView onStartGeneration={() => {}} />)

    expect(screen.getByText('文生图')).toBeInTheDocument()
    expect(screen.getByText('图生图')).toBeInTheDocument()
    expect(screen.queryByText('极致优化')).toBeNull()
    expect(screen.queryByText('灵感图鉴')).toBeNull()
    expect(screen.queryByText('更多作品')).toBeNull()
  })

  test('generate page removes extreme optimization action', async () => {
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
      imageModels: [{ id: 1, slug: 'gpt-image-1', type: 'image', description: 'img', image_price_per_call: 1500 }],
      selectedImageModel: 'gpt-image-1',
    })

    render(<GenerateView />)

    expect(screen.queryByText('极致优化')).toBeNull()
    expect(screen.getByText('每次生成消耗 0.15 积分')).toBeInTheDocument()
    expect(screen.getByText('开始创作')).toBeInTheDocument()
  })
})
