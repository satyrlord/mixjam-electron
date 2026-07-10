import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import AnalysisProgressBar from './AnalysisProgressBar'

describe('AnalysisProgressBar', () => {
  it('returns null when status is idle', () => {
    const { container } = render(
      <AnalysisProgressBar progress={{ status: 'idle', analyzed: 0, total: 0 }} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows fallback message when error has no detail', () => {
    render(
      <AnalysisProgressBar progress={{ status: 'error', analyzed: 0, total: 0 }} />
    )
    expect(screen.getByLabelText('Analysis error: Unknown backend error'))
      .toHaveTextContent('Analysis error: Unknown backend error')
  })

  it('shows fatal analysis detail instead of reporting a scan error', () => {
    render(
      <AnalysisProgressBar progress={{
        status: 'error',
        analyzed: 12,
        total: 20,
        error: 'decoder initialization failed'
      }} />
    )
    expect(screen.getByLabelText('Analysis error: decoder initialization failed'))
      .toHaveTextContent('Analysis error: decoder initialization failed')
  })

  it('renders 100% when total is 0 (avoids division by zero)', () => {
    const { container } = render(
      <AnalysisProgressBar progress={{ status: 'analyzing', analyzed: 0, total: 0 }} />
    )
    expect(container.querySelector('.scan-progress')?.textContent).toBe('Analyze 100%')
  })

  it('renders progress percentage when analyzing', () => {
    const { container } = render(
      <AnalysisProgressBar progress={{ status: 'analyzing', analyzed: 5, total: 10 }} />
    )
    expect(container.querySelector('.scan-progress')?.textContent).toBe('Analyze 50%')
  })
})
