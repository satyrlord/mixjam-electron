import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders home actions and fetches version through backendAPI', async () => {
    render(<App />)

    expect(screen.getByRole('button', { name: 'Start New MixJam' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Load MixJam' })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'v0.test.0' })).toBeInTheDocument()
    })

    expect(vi.mocked(window.backendAPI.getVersion)).toHaveBeenCalledTimes(1)
  })

  it('switches to the Player when Start New MixJam is clicked', async () => {
    render(<App />)

    await waitFor(() => expect(
      screen.getByRole('button', { name: 'Start New MixJam' })
    ).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Start New MixJam' }))

    await waitFor(() => {
      expect(screen.getByText('MixJam Browser')).toBeInTheDocument()
      expect(screen.getAllByText('Lane 1').length).toBeGreaterThan(0)
    })
    expect(vi.mocked(window.backendAPI.resizeToPlayer)).toHaveBeenCalledTimes(1)
  })

  it('renders MixJam files in the MixJam Browser and mirrors sample selection into the footer', async () => {
    render(<App />)

    await waitFor(() => expect(
      screen.getByRole('button', { name: 'Start New MixJam' })
    ).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Start New MixJam' }))

    await waitFor(() => {
      expect(screen.getByText('club-night')).toBeInTheDocument()
      expect(screen.getByText('sunrise')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('tab', { name: 'Samples' }))
    const kickRow = await screen.findByRole('button', { name: /kick_808/ })
    fireEvent.click(kickRow)

    // The full relpath only renders in the footer detail, so finding it proves
    // the selection was mirrored. Tag rendering is covered by Footer.test.tsx;
    // the shared mock's DB rows carry no tags.
    expect(screen.getByText('Drums/Kicks/kick_808.wav')).toBeInTheDocument()
  })

  it('applies the Emerald theme by default and switches to selected theme', () => {
    render(<App />)

    const select = screen.getByLabelText('Theme')
    expect(select).toHaveValue('emerald')
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#00674F')

    fireEvent.change(select, { target: { value: 'enterprise' } })

    expect(select).toHaveValue('enterprise')
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#2F81F7')
  })

  it('defaults UI Size to 40 and persists only the supported 30, 40, and 50 levels', async () => {
    localStorage.removeItem('mixjam:ui-size')

    try {
      const initial = render(<App />)
      await waitFor(() => expect(
        screen.getByRole('button', { name: 'Start New MixJam' })
      ).toBeEnabled())
      fireEvent.click(screen.getByRole('button', { name: 'Start New MixJam' }))
      fireEvent.click(await screen.findByRole('button', { name: 'Settings' }))
      const sizeGroup = screen.getByRole('group', { name: 'Zoom Level' })

      expect(within(sizeGroup).getAllByRole('button').map((button) => button.textContent)).toEqual(['75%', '100%', '125%'])
      expect(initial.container.querySelector('.app')).toHaveAttribute('data-ui-size', '40')
      expect(document.documentElement).toHaveAttribute('data-ui-size', '40')
      expect(document.documentElement.style.getPropertyValue('--ui-header-height')).toBe('64px')

      fireEvent.click(within(sizeGroup).getByRole('button', { name: '125%' }))
      expect(initial.container.querySelector('.app')).toHaveAttribute('data-ui-size', '50')
      expect(document.documentElement).toHaveAttribute('data-ui-size', '50')
      expect(document.documentElement.style.getPropertyValue('--ui-header-height')).toBe('80px')
      expect(localStorage.getItem('mixjam:ui-size')).toBe('50')

      initial.unmount()
      localStorage.setItem('mixjam:ui-size', '44')

      const withObsoletePreference = render(<App />)
      expect(withObsoletePreference.container.querySelector('.app')).toHaveAttribute('data-ui-size', '40')
    } finally {
      localStorage.removeItem('mixjam:ui-size')
    }
  })

  it('exposes Settings only in the Player footer', async () => {
    render(<App />)

    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument()
    await waitFor(() => expect(
      screen.getByRole('button', { name: 'Start New MixJam' })
    ).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Start New MixJam' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument())
  })

  it('opens an exclusive Player Settings modal without moving Clip Edge Fades back into Master', async () => {
    render(<App />)
    await waitFor(() => expect(
      screen.getByRole('button', { name: 'Start New MixJam' })
    ).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Start New MixJam' }))

    await waitFor(() => expect(screen.getAllByText('Lane 1').length).toBeGreaterThan(0))
    const trigger = screen.getByRole('button', { name: 'Settings' })
    fireEvent.click(trigger)

    expect(screen.getByRole('dialog', { name: 'Settings' })).toHaveAttribute('aria-modal', 'true')
    expect(document.querySelector('.player-view')).toBeInTheDocument()
    expect(document.body).toHaveAttribute('data-mixjam-modal-blocking', '1')
    const enabled = screen.getByRole('checkbox', {
      name: 'Enable automatic clip-edge fades'
    })
    expect(enabled).toBeEnabled()
    fireEvent.click(enabled)
    expect(screen.getByText('Off')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close Settings' }))
    expect(document.querySelector('.mbs-strip')).not.toBeNull()
    expect(screen.queryByText('Clip Edge Fades')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('creates a clip placement when a sample bubble is dragged onto a Tracker lane', async () => {
    render(<App />)

    await waitFor(() => expect(
      screen.getByRole('button', { name: 'Start New MixJam' })
    ).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Start New MixJam' }))

    await waitFor(() => {
      expect(screen.getAllByText('Lane 1').length).toBeGreaterThan(0)
    })

    const detail = JSON.stringify({
      name: 'kick_808.wav',
      relpath: 'Drums/Kicks/kick_808.wav',
      tags: [],
      duration: 0.5
    })

    const lane3Canvas = screen.getByRole('region', { name: 'Lane 3 placement area' })
    fireEvent.drop(lane3Canvas, {
      dataTransfer: { getData: () => detail, types: ['application/mixjam-sample'] }
    })

    // Placements are rendered on canvas; verify via data attributes on the canvas container.
    await waitFor(() => {
      const containers = document.querySelectorAll('[data-placement-sample-names*="kick_808.wav"]')
      expect(containers.length).toBeGreaterThanOrEqual(1)
    })

    fireEvent.drop(lane3Canvas, {
      dataTransfer: { getData: () => detail, types: ['application/mixjam-sample'] }
    })
    const lane3Container = lane3Canvas.querySelector('[data-placement-count]')
    expect(lane3Container?.getAttribute('data-placement-count')).toBe('2')

    const lane2Canvas = screen.getByRole('region', { name: 'Lane 2 placement area' })
    fireEvent.drop(lane2Canvas, {
      dataTransfer: { getData: () => detail, types: ['application/mixjam-sample'] }
    })
    const allContainers = document.querySelectorAll('[data-placement-sample-names*="kick_808.wav"]')
    expect(allContainers.length).toBe(2)
  })

  it('applies the Emerald theme by default and ignores unknown themes', () => {
    render(<App />)

    const select = screen.getByLabelText('Theme')
    expect(select).toHaveValue('emerald')

    fireEvent.change(select, { target: { value: 'nonexistent' } })
    expect(select).toHaveValue('emerald')
  })
})
