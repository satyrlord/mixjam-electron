import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RecentProjectsRail from './RecentProjectsRail'

describe('RecentProjectsRail storage failures', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps collapse state usable when browser storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })

    render(<RecentProjectsRail recentProjects={[]} />)
    const toggle = screen.getByRole('button', { name: 'Collapse recent projects' })
    fireEvent.click(toggle)

    expect(screen.getByRole('button', { name: 'Expand recent projects' })).toBeInTheDocument()
  })
})
