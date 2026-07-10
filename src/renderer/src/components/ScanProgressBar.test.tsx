import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ScanProgressBar from './ScanProgressBar'

describe('ScanProgressBar', () => {
  it('returns null when status is idle', () => {
    const { container } = render(
      <ScanProgressBar progress={{ status: 'idle', phase: null, found: 0, processed: 0, total: 0 }} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders error message when status is error', () => {
    const { container } = render(
      <ScanProgressBar progress={{ status: 'error', phase: 1, found: 4, processed: 2, total: 4, error: 'disk write failed' }} />
    )
    const err = container.querySelector('.scan-err')
    expect(err).toBeTruthy()
    expect(err?.textContent).toBe('Scan error: disk write failed')
    expect(err).toHaveAttribute('title', 'disk write failed')
  })

  it('renders progress percentage when scanning with total > 0', () => {
    const { container } = render(
      <ScanProgressBar progress={{ status: 'scanning', phase: 1, found: 10, processed: 5, total: 10 }} />
    )
    const bar = container.querySelector('.scan-progress') as HTMLElement
    expect(bar).toBeTruthy()
    expect(bar.textContent).toContain('50%')
  })

  it('renders 0% when total is 0', () => {
    const { container } = render(
      <ScanProgressBar progress={{ status: 'scanning', phase: 2, found: 0, processed: 0, total: 0 }} />
    )
    const bar = container.querySelector('.scan-progress') as HTMLElement
    expect(bar).toBeTruthy()
    expect(bar.textContent).toContain('0%')
  })
})
