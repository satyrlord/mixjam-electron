import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ScanOverlay from './ScanOverlay'
import type { ScanProgress } from '../../../shared/backend-api'

const SCANNING: ScanProgress = {
  status: 'scanning',
  phase: 1,
  found: 10,
  processed: 5,
  total: 10
}

describe('ScanOverlay', () => {
  it('returns null when status is idle', () => {
    const { container } = render(
      <ScanOverlay progress={{ status: 'idle', phase: null, found: 0, processed: 0, total: 0 }} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('returns null when status is error', () => {
    const { container } = render(
      <ScanOverlay progress={{ status: 'error', phase: null, found: 0, processed: 0, total: 0 }} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders the overlay when scanning with total > 0', () => {
    const { container } = render(<ScanOverlay progress={SCANNING} />)
    const overlay = container.querySelector('.scan-overlay')
    expect(overlay).toBeTruthy()
    const bar = container.querySelector('.scan-overlay-bar')
    expect(bar).toBeTruthy()
    const fill = container.querySelector('.scan-overlay-bar-fill') as HTMLElement
    expect(fill.style.width).toBe('50%')
  })

  it('does not render the progress bar when total is 0', () => {
    const { container } = render(
      <ScanOverlay progress={{ status: 'scanning', phase: 2, found: 0, processed: 0, total: 0 }} />
    )
    expect(container.querySelector('.scan-overlay')).toBeTruthy()
    expect(container.querySelector('.scan-overlay-bar')).toBeNull()
  })

  it('defaults phase to 1 when phase is null', () => {
    const { container } = render(
      <ScanOverlay progress={{ status: 'scanning', phase: null, found: 0, processed: 0, total: 0 }} />
    )
    const phaseEl = container.querySelector('.scan-overlay-phase')
    expect(phaseEl?.textContent).toContain('Phase 1:')
  })
})
