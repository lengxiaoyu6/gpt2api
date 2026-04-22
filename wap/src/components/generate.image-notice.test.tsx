import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const generateImage = vi.fn()
const editImage = vi.fn()

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

const storeModule = await import('../store/useStore')
const useStore = storeModule.useStore
const { default: GenerateView } = await import('./views/Generate')

function resetStore() {
  const initial = useStore.getInitialState()
  useStore.setState(initial, true)
  localStorage.clear()
}

describe('generate image notice', () => {
  beforeEach(() => {
    resetStore()
    vi.clearAllMocks()
  })

  afterEach(() => {
    resetStore()
  })

  test('generate page renders image notice from site info', () => {
    useStore.setState({
      siteInfo: {
        'site.name': 'GPT2API',
        'site.description': 'AI 创作平台',
        'site.logo_url': '',
        'site.footer': '',
        'auth.allow_register': 'true',
        'site.image_notice': '当前高峰期生成速度可能波动',
      },
      generateImage,
      editImage,
      imageModels: [
        { id: 1, slug: 'gpt-image-1', type: 'image', description: '标准模型', image_price_per_call: 1500 },
      ],
      selectedImageModel: 'gpt-image-1',
      setSelectedImageModel: (slug: string | null) => useStore.setState({ selectedImageModel: slug }),
    } as any)

    render(<GenerateView />)

    const notice = screen.getByText('当前高峰期生成速度可能波动')
    const title = screen.getByText('创意实验室')

    expect(notice).toBeInTheDocument()
    expect(screen.queryByText('生图公告')).toBeNull()
    expect(notice.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
