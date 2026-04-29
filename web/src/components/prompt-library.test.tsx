import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../api/prompt', () => ({
  listMyPrompts: vi.fn(),
  listMyPromptCategories: vi.fn(),
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
    vi.mocked(api.listMyPrompts).mockResolvedValue({
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

  test('loads prompt cards, opens detail dialog and sends content into generate page', async () => {
    render(<PromptLibraryView />)

    expect(await screen.findByText('电影感城市夜景')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '电影感城市夜景预览图' })).toHaveAttribute('src', 'https://cdn.example.test/prompts/city.webp')
    expect(screen.getByRole('searchbox', { name: '搜索 Prompt' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '分类：摄影' })).toBeInTheDocument()
    expect(api.listMyPrompts).toHaveBeenCalledWith({ limit: 20, offset: 0 })

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

  test('supports keyword category query and loading next page', async () => {
    vi.mocked(api.listMyPrompts)
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
      expect(api.listMyPrompts).toHaveBeenLastCalledWith({ keyword: '人像', category: '通用', limit: 1, offset: 0 })
    })

    fireEvent.click(screen.getByRole('button', { name: '加载更多 Prompt' }))

    expect(await screen.findByText('第二页')).toBeInTheDocument()
    expect(api.listMyPrompts).toHaveBeenLastCalledWith({ keyword: '人像', category: '通用', limit: 1, offset: 1 })
  })
})
