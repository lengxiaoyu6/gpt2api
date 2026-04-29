import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../api/update-log', () => ({
  listPublicUpdateLogs: vi.fn(),
}))

const api = await import('../api/update-log')
const { default: UpdateLogsView } = await import('./views/UpdateLogs')

describe('web update log timeline page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('loads public update logs and renders them as a timeline page', async () => {
    vi.mocked(api.listPublicUpdateLogs).mockResolvedValue({
      items: [
        {
          id: 1,
          version: 'v1.2.0',
          title: '系统更新',
          content: '新增系统更新日志页面',
          enabled: true,
          sort_order: 10,
          published_at: '2026-04-29T08:00:00Z',
          created_at: '2026-04-29T08:00:00Z',
          updated_at: '2026-04-29T08:00:00Z',
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    })

    render(<UpdateLogsView />)

    expect(await screen.findByRole('heading', { name: '系统更新日志' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '系统更新日志时间线' })).toBeInTheDocument()
    const timeline = screen.getByRole('list', { name: '更新日志时间线' })
    const entries = within(timeline).getAllByRole('listitem')

    expect(entries).toHaveLength(1)
    expect(within(entries[0]).getByText('v1.2.0')).toBeInTheDocument()
    expect(within(entries[0]).queryByText('系统更新')).not.toBeInTheDocument()
    expect(within(entries[0]).getByText('新增系统更新日志页面')).toBeInTheDocument()
    expect(api.listPublicUpdateLogs).toHaveBeenCalledWith({ limit: 20, offset: 0 })
  })

  test('supports loading more timeline entries', async () => {
    vi.mocked(api.listPublicUpdateLogs)
      .mockResolvedValueOnce({
        items: [
          { id: 1, version: 'v1.0.0', title: '第一页', content: '第一条', enabled: true, sort_order: 1, published_at: null, created_at: '2026-04-29T08:00:00Z', updated_at: '2026-04-29T08:00:00Z' },
        ],
        total: 2,
        limit: 1,
        offset: 0,
      })
      .mockResolvedValueOnce({
        items: [
          { id: 2, version: 'v1.0.1', title: '第二页', content: '第二条', enabled: true, sort_order: 1, published_at: null, created_at: '2026-04-28T08:00:00Z', updated_at: '2026-04-28T08:00:00Z' },
        ],
        total: 2,
        limit: 1,
        offset: 1,
      })

    render(<UpdateLogsView pageSize={1} />)

    expect(await screen.findByText('第一条')).toBeInTheDocument()
    expect(screen.queryByText('第一页')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '加载更多更新日志' }))

    expect(await screen.findByText('第二条')).toBeInTheDocument()
    expect(screen.queryByText('第二页')).not.toBeInTheDocument()
    expect(api.listPublicUpdateLogs).toHaveBeenLastCalledWith({ limit: 1, offset: 1 })
  })

  test('renders empty state and keeps failure inside the page', async () => {
    vi.mocked(api.listPublicUpdateLogs).mockRejectedValue(new Error('接口异常'))

    render(<UpdateLogsView />)

    await waitFor(() => expect(api.listPublicUpdateLogs).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('暂无更新日志')).toBeInTheDocument()
  })

  test('calls back-home action from page header', () => {
    vi.mocked(api.listPublicUpdateLogs).mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 })
    const backHome = vi.fn()

    render(<UpdateLogsView onBackHome={backHome} />)
    fireEvent.click(screen.getByRole('button', { name: '返回首页' }))

    expect(backHome).toHaveBeenCalledTimes(1)
  })
})
