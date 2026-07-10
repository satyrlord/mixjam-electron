import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MixJamBrowser from './MixJamBrowser'

describe('MixJamBrowser storage failures', () => {
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

    render(<MixJamBrowser mixJamFiles={[]} />)
    const toggle = screen.getByRole('button', { name: 'Collapse MixJam Browser' })
    fireEvent.click(toggle)

    expect(screen.getByRole('button', { name: 'Expand MixJam Browser' })).toBeInTheDocument()
  })
})
