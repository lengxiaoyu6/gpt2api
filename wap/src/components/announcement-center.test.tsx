import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../api/announcement', () => ({
  listPublicAnnouncements: vi.fn(),
}))

const api = await import('../api/announcement')
const { default: AnnouncementCenter } = await import('./AnnouncementCenter')

describe('wap announcement center', () => {
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
})
