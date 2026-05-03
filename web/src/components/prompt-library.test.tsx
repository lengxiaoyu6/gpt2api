import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../api/prompt', () => ({
  listMyPrompts: vi.fn(),
  listMyPromptCategories: vi.fn(),
  listPublicPrompts: vi.fn(),
  listPublicPromptCategories: vi.fn(),
}))

const api = await import('../api/prompt')
const storeModule = await import('../store/useStore')
const useStore = storeModule.useStore
const { default: PromptLibraryView } = await import('./views/PromptLibrary')

function resetStore() {
  const initial = useStore.getInitialState()
  useStore.setState(initial, true)
  localStorage.clear()
}

describe('web prompt library page', () => {
  beforeEach(() => {
    resetStore()
    vi.clearAllMocks()
    vi.mocked(api.listMyPromptCategories).mockResolvedValue({ items: ['通用', '摄影'] })
    vi.mocked(api.listPublicPromptCategories).mockResolvedValue({ items: ['通用', '摄影'] })
    vi.mocked(api.listMyPrompts).mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    })
    vi.mocked(api.listPublicPrompts).mockResolvedValue({
      items: [
        {
          id: 1,
          title: '电影感城市夜景',
          content: '赛博朋克城市，雨夜霓虹，高细节',
          category: '摄影',
          preview_image_url: 'https://cdn.example.test/prompts/city.webp',
          tags: ['城市', '夜景'],
          enabled: true,
          sort_order: 20,
          created_at: '2026-04-29T08:00:00Z',
          updated_at: '2026-04-29T08:00:00Z',
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    })
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  afterEach(() => {
    resetStore()
  })

  test('loads public prompt cards, opens detail dialog and sends content into generate page for logged-in users', async () => {
    useStore.setState({
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
    } as any)

    render(<PromptLibraryView />)

    expect(await screen.findByText('电影感城市夜景')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '电影感城市夜景预览图' })).toHaveAttribute('src', 'https://cdn.example.test/prompts/city.webp')
    expect(screen.getByRole('searchbox', { name: '搜索 Prompt' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '分类：摄影' })).toBeInTheDocument()
    expect(api.listPublicPrompts).toHaveBeenCalledWith({ limit: 20, offset: 0 })
    expect(api.listPublicPromptCategories).toHaveBeenCalledTimes(1)
    expect(api.listMyPrompts).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '查看 Prompt：电影感城市夜景' }))

    const dialog = await screen.findByRole('dialog', { name: '电影感城市夜景' })
    expect(within(dialog).getByText('赛博朋克城市，雨夜霓虹，高细节')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: '复制提示词' }))
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('赛博朋克城市，雨夜霓虹，高细节')
    })

    fireEvent.click(within(dialog).getByRole('button', { name: '带入生图页' }))

    expect(useStore.getState().activeTab).toBe('generate')
    expect(useStore.getState().consumePendingPrompt()).toBe('赛博朋克城市，雨夜霓虹，高细节')
    expect(useStore.getState().consumePendingPrompt()).toBe('')
  })

  test('anonymous visitors can browse public prompts and jump into auth flow with pending prompt', async () => {
    render(<PromptLibraryView />)

    expect(await screen.findByText('电影感城市夜景')).toBeInTheDocument()
    expect(api.listPublicPrompts).toHaveBeenCalledWith({ limit: 20, offset: 0 })
    expect(api.listPublicPromptCategories).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '查看 Prompt：电影感城市夜景' }))

    const dialog = await screen.findByRole('dialog', { name: '电影感城市夜景' })
    fireEvent.click(within(dialog).getByRole('button', { name: '带入生图页' }))

    expect(useStore.getState().activeTab).toBe('home')
    expect(useStore.getState().pendingTab).toBe('generate')
    expect(useStore.getState().authOverlayOpen).toBe(true)
    expect(useStore.getState().consumePendingPrompt()).toBe('赛博朋克城市，雨夜霓虹，高细节')
  })

  test('shows preview image size and opens zoom viewer from prompt detail dialog', async () => {
    render(<PromptLibraryView />)

    expect(await screen.findByText('电影感城市夜景')).toBeInTheDocument()
    const listPreviewImage = screen.getByRole('img', { name: '电影感城市夜景预览图' })
    Object.defineProperty(listPreviewImage, 'naturalWidth', { configurable: true, value: 2048 })
    Object.defineProperty(listPreviewImage, 'naturalHeight', { configurable: true, value: 1536 })
    fireEvent.load(listPreviewImage)

    fireEvent.click(screen.getByRole('button', { name: '查看 Prompt：电影感城市夜景' }))

    const dialog = await screen.findByRole('dialog', { name: '电影感城市夜景' })
    const previewButton = within(dialog).getByRole('button', { name: '放大查看预览图：电影感城市夜景' })
    const previewImage = within(previewButton).getByRole('img', { name: '电影感城市夜景预览图' })

    expect(within(dialog).getByText('完整尺寸')).toBeInTheDocument()
    expect(within(dialog).getByText('2048 × 1536 px')).toBeInTheDocument()
    expect(previewImage.className).toContain('max-h-[240px]')
    expect(previewImage).toHaveAttribute('loading', 'eager')

    fireEvent.click(previewButton)

    const zoomDialog = await screen.findByRole('dialog', { name: '电影感城市夜景预览图放大查看' })
    const zoomedImage = within(zoomDialog).getByRole('img', { name: '电影感城市夜景预览图放大查看' })
    expect(zoomedImage).toHaveAttribute('src', 'https://cdn.example.test/prompts/city.webp')
    expect(within(zoomDialog).getByText('2048 × 1536 px')).toBeInTheDocument()
    expect(zoomedImage).toHaveAttribute('loading', 'eager')
    expect(zoomDialog.className).toContain('h-[100dvh]')
    expect(zoomDialog.className).toContain('w-screen')
    expect(zoomDialog.className).toContain('rounded-none')
    expect(zoomedImage.className).toContain('max-h-full')
    expect(zoomedImage.parentElement?.className).toContain('overflow-auto')
  })

  test('renders inspiration preview image from compatible preview url fields', async () => {
    vi.mocked(api.listPublicPrompts).mockResolvedValueOnce({
      items: [
        {
          id: 9,
          title: '水彩花园灵感图',
          content: '水彩花园，柔和光线',
          category: '插画',
          preview_url: 'https://cdn.example.test/prompts/garden.webp',
          tags: ['水彩'],
          enabled: true,
          sort_order: 9,
          created_at: '2026-04-29T09:00:00Z',
          updated_at: '2026-04-29T09:00:00Z',
        } as any,
      ],
      total: 1,
      limit: 20,
      offset: 0,
    })

    render(<PromptLibraryView />)

    expect(await screen.findByText('水彩花园灵感图')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '水彩花园灵感图预览图' })).toHaveAttribute('src', 'https://cdn.example.test/prompts/garden.webp')

    fireEvent.click(screen.getByRole('button', { name: '查看 Prompt：水彩花园灵感图' }))

    const dialog = await screen.findByRole('dialog', { name: '水彩花园灵感图' })
    expect(within(dialog).getByRole('img', { name: '水彩花园灵感图预览图' })).toHaveAttribute('src', 'https://cdn.example.test/prompts/garden.webp')
  })



  test('renders prompt summary as single-line ellipsis text on cards', async () => {
    render(<PromptLibraryView />)

    const summary = await screen.findByText('赛博朋克城市，雨夜霓虹，高细节')
    expect(summary.className).toContain('truncate')
    expect(summary.className).toContain('whitespace-nowrap')
    expect(summary.className).toContain('overflow-hidden')
  })

  test('uses two-column compact cards on mobile inspiration list', async () => {
    render(<PromptLibraryView />)

    expect(await screen.findByText('电影感城市夜景')).toBeInTheDocument()

    const list = screen.getByLabelText('Prompt 卡片列表')
    expect(list.className).toContain('grid-cols-2')
    expect(list.className).toContain('gap-3')
    expect(list.className).toContain('sm:gap-4')

    const card = screen.getByRole('button', { name: '查看 Prompt：电影感城市夜景' })
    expect(card.className).toContain('p-3')
    expect(card.className).toContain('sm:p-5')
    expect(card.className).toContain('sm:min-h-64')
  })

  test('supports keyword category query and loading next page', async () => {
    vi.mocked(api.listPublicPrompts)
      .mockResolvedValueOnce({
        items: [
          { id: 1, title: '第一页', content: '第一条', category: '通用', preview_image_url: '', tags: [], enabled: true, sort_order: 1, created_at: '2026-04-29T08:00:00Z', updated_at: '2026-04-29T08:00:00Z' },
        ],
        total: 2,
        limit: 1,
        offset: 0,
      })
      .mockResolvedValueOnce({
        items: [
          { id: 2, title: '第二页', content: '第二条', category: '通用', preview_image_url: '', tags: [], enabled: true, sort_order: 1, created_at: '2026-04-29T08:01:00Z', updated_at: '2026-04-29T08:01:00Z' },
        ],
        total: 2,
        limit: 1,
        offset: 1,
      })

    render(<PromptLibraryView pageSize={1} />)

    expect(await screen.findByText('第一页')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: '搜索 Prompt' }), {
      target: { value: '人像' },
    })
    fireEvent.click(screen.getByRole('button', { name: '分类：通用' }))
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))

    await waitFor(() => {
      expect(api.listPublicPrompts).toHaveBeenLastCalledWith({ keyword: '人像', category: '通用', limit: 1, offset: 0 })
    })

    fireEvent.click(screen.getByRole('button', { name: '加载更多 Prompt' }))

    expect(await screen.findByText('第二页')).toBeInTheDocument()
    expect(api.listPublicPrompts).toHaveBeenLastCalledWith({ keyword: '人像', category: '通用', limit: 1, offset: 1 })
  })
})
