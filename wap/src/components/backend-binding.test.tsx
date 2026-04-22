import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const storeModule = await import('../store/useStore')
const useStore = storeModule.useStore
const { default: AuthOverlay } = await import('./AuthOverlay')
const { default: HistoryView } = await import('./views/History')
const { default: ProfileView } = await import('./views/Profile')

function resetStore() {
  const initial = useStore.getInitialState()
  useStore.setState(initial, true)
  localStorage.clear()
}

describe('wap backend bindings', () => {
  beforeEach(() => {
    resetStore()
    vi.clearAllMocks()
  })

  afterEach(() => {
    resetStore()
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

  test('history view loads server records and renders preview from image_urls', async () => {
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
          created_at: '2026-04-22T10:00:00Z',
        },
      ],
    })

    render(<HistoryView />)

    await waitFor(() => expect(fetchHistory).toHaveBeenCalledTimes(1))
    expect(screen.getByAltText('Cloud city')).toHaveAttribute('src', '/p/img/task-1/0')
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
      submitCheckin,
      logout: vi.fn(),
    })

    render(<ProfileView />)

    expect(screen.getByText('Demo')).toBeInTheDocument()
    expect(screen.getByText('8.99 积分')).toBeInTheDocument()

    const rewardCard = screen.getByText('今日奖励').closest('div')
    expect(rewardCard).not.toBeNull()
    expect(within(rewardCard as HTMLElement).getByText('0.05')).toBeInTheDocument()

    const balanceCard = screen.getByText('可用积分').closest('div')
    expect(balanceCard).not.toBeNull()
    expect(within(balanceCard as HTMLElement).getByText('8.99')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '每日签到' }))

    await waitFor(() => expect(submitCheckin).toHaveBeenCalledTimes(1))
  })
})
