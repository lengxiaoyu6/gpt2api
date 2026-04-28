import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../api/announcement', () => ({
  listPublicAnnouncements: vi.fn(),
}))

const api = await import('../api/announcement')
const { default: AnnouncementCenter } = await import('./AnnouncementCenter')

describe('web announcement center', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
  })

  test('shows first unread announcement and caches read id', async () => {
    vi.mocked(api.listPublicAnnouncements).mockResolvedValue({
      items: [
        { id: 2, title: '更新公告', content: '新增能力', enabled: true, sort_order: 10, created_at: '2026-04-26T00:00:00Z', updated_at: '2026-04-26T00:00:00Z' },
      ],
      total: 1,
    })

    render(<AnnouncementCenter active />)

    expect(await screen.findByText('更新公告')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '知道了' }))
    await waitFor(() => expect(localStorage.getItem('gpt2api.announcement.read.ids')).toContain('2'))
  })

  test('centers popup dialog and uses polished mobile styling', async () => {
    vi.mocked(api.listPublicAnnouncements).mockResolvedValue({
      items: [
        { id: 3, title: '维护公告', content: '今晚维护', enabled: true, sort_order: 20, created_at: '2026-04-26T00:00:00Z', updated_at: '2026-04-26T00:00:00Z' },
      ],
      total: 1,
    })

    render(<AnnouncementCenter active />)

    const dialog = await screen.findByRole('dialog', { name: '维护公告' })
    expect(dialog).toHaveClass('min-h-[100dvh]', 'items-center', 'justify-center', 'px-5', 'py-8')
    const panel = dialog.firstElementChild
    expect(panel).toHaveClass('max-w-[min(92vw,42rem)]', 'text-center', 'shadow-[0_24px_80px_rgba(15,23,42,0.28)]')
    expect(screen.getByText('重要公告')).toBeInTheDocument()
  })

  test('renders popup outside fixed toolbar stacking context', async () => {
    vi.mocked(api.listPublicAnnouncements).mockResolvedValue({
      items: [
        { id: 4, title: '层级公告', content: '检查弹窗层级', enabled: true, sort_order: 30, created_at: '2026-04-26T00:00:00Z', updated_at: '2026-04-26T00:00:00Z' },
      ],
      total: 1,
    })

    render(
      <header data-testid="toolbar" className="fixed top-0 z-40 backdrop-blur-xl">
        <AnnouncementCenter active />
      </header>,
    )

    const toolbar = screen.getByTestId('toolbar')
    const dialog = await screen.findByRole('dialog', { name: '层级公告' })

    expect(toolbar).not.toContain(dialog)
    expect(dialog.parentElement).toBe(document.body)
  })

  test('keeps read announcement in list without auto popup', async () => {
    localStorage.setItem('gpt2api.announcement.read.ids', JSON.stringify([2]))
    vi.mocked(api.listPublicAnnouncements).mockResolvedValue({
      items: [
        { id: 2, title: '更新公告', content: '新增能力', enabled: true, sort_order: 10, created_at: '2026-04-26T00:00:00Z', updated_at: '2026-04-26T00:00:00Z' },
      ],
      total: 1,
    })

    render(<AnnouncementCenter active />)

    await waitFor(() => expect(api.listPublicAnnouncements).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('button', { name: '知道了' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '公告' }))
    expect(await screen.findByText('新增能力')).toBeInTheDocument()
  })

  test('keeps announcement request failure inside the component', async () => {
    vi.mocked(api.listPublicAnnouncements).mockRejectedValue(new Error('公告接口异常'))

    render(<AnnouncementCenter active />)

    await waitFor(() => expect(api.listPublicAnnouncements).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: '公告' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
