import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Header from './Header'

describe('Header', () => {
  it('shows only the brand in the home view', () => {
    render(<Header view="home" timer="00:00.0" onHome={vi.fn()} />)
    expect(screen.getByText('MixJam Electron')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Return to Main Menu/ })).not.toBeInTheDocument()
    expect(screen.queryByText('00:00.0')).not.toBeInTheDocument()
  })

  it('shows the home link and timer in the tracker view and fires onHome', () => {
    const onHome = vi.fn()
    render(<Header view="tracker" timer="01:23.4" onHome={onHome} />)

    expect(screen.getByText('01:23.4')).toBeInTheDocument()
    const homeLink = screen.getByRole('button', { name: /Return to Main Menu/ })
    fireEvent.click(homeLink)
    expect(onHome).toHaveBeenCalledTimes(1)
  })
})
