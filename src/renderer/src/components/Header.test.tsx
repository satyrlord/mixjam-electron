import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Header from './Header'

describe('Header', () => {
  it('shows only the brand in the home view', () => {
    render(
      <Header
        view="home"
        timer="00:00.0"
        theme="emerald"
        onHome={vi.fn()}
        onThemeChange={vi.fn()}
      />
    )
    expect(screen.getByText('MixJam Electron')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Return to Main Menu/ })).not.toBeInTheDocument()
    expect(screen.queryByText('00:00.0')).not.toBeInTheDocument()
  })

  it('shows the home link and timer in the Player and fires onHome', () => {
    const onHome = vi.fn()
    render(
      <Header
        view="player"
        timer="01:23.4"
        theme="emerald"
        onHome={onHome}
        onThemeChange={vi.fn()}
      />
    )

    expect(screen.getByText('01:23.4')).toBeInTheDocument()
    const homeLink = screen.getByRole('button', { name: /Return to Main Menu/ })
    fireEvent.click(homeLink)
    expect(onHome).toHaveBeenCalledTimes(1)
  })

  it('lists the available themes and reports selection changes', () => {
    const onThemeChange = vi.fn()
    render(
      <Header
        view="home"
        timer="00:00.0"
        theme="emerald"
        onHome={vi.fn()}
        onThemeChange={onThemeChange}
      />
    )

    const select = screen.getByLabelText('Theme')
    expect(select).toHaveValue('emerald')

    const optionNames = Array.from(screen.getAllByRole('option')).map((option) => option.textContent)
    expect(optionNames).toEqual([
      'Emerald',
      'Enterprise',
      'Neon Rave',
      'Warm Analog',
      'IDE',
      'Rust Industrial',
      'Club PA',
      'Beton Brut',
      'Mono',
      'Cosmic',
      'Neon',
      'Vintage',
      'Rack',
      'Soft',
      'Riso',
      'Arcade'
    ])

    fireEvent.change(select, { target: { value: 'enterprise' } })
    expect(onThemeChange).toHaveBeenCalledWith('enterprise')
    // The select value stays on 'emerald' because the theme prop is controlled
    // and this test never updates it.
    expect(select).toHaveValue('emerald')
  })
})
