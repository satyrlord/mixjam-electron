import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders home actions and fetches version through electronAPI', async () => {
    render(<App />)

    expect(screen.getByRole('button', { name: 'Start New MixJam' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Load MixJam' })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'v0.test.0' })).toBeInTheDocument()
    })

    expect(vi.mocked(window.electronAPI.getVersion)).toHaveBeenCalledTimes(1)
  })

  it('switches to the tracker view when Start New MixJam is clicked', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Start New MixJam' }))

    await waitFor(() => {
      expect(screen.getByText('Timeline Area')).toBeInTheDocument()
    })
    expect(vi.mocked(window.electronAPI.resizeToTracker)).toHaveBeenCalledTimes(1)
  })

  it('applies the Emerald theme by default and resets non-Emerald selection back to Emerald', () => {
    render(<App />)

    const select = screen.getByLabelText('Theme')
    expect(select).toHaveValue('emerald')
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#00674F')

    fireEvent.change(select, { target: { value: 'studio' } })

    expect(select).toHaveValue('emerald')
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#00674F')
  })
})
