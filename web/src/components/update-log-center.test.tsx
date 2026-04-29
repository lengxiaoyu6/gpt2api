import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../api/update-log', () => ({
  listPublicUpdateLogs: vi.fn(),
}))

const api = await import('../api/update-log')
const { default: UpdateLogCenter } = await import('./UpdateLogCenter')

describe('web update log entry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('opens the update log page instead of a dialog', () => {
    const openPage = vi.fn()

    render(<UpdateLogCenter onOpen={openPage} />)

    fireEvent.click(screen.getByRole('button', { name: '更新日志' }))

    expect(openPage).toHaveBeenCalledTimes(1)
    expect(api.listPublicUpdateLogs).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: '系统更新日志' })).toBeNull()
  })
})
