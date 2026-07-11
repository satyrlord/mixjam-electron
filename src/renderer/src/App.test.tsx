import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

    const start = await screen.findByRole('button', { name: 'Start New MixJam' })
    await waitFor(() => expect(start).toBeEnabled())
    fireEvent.click(start)

    await waitFor(() => {
      expect(screen.getByText('MixJam Browser')).toBeInTheDocument()
      expect(screen.getByText('Lane 1')).toBeInTheDocument()
    })
    expect(vi.mocked(window.backendAPI.resizeToPlayer)).toHaveBeenCalledTimes(1)
  })

  it('renders MixJam files in the MixJam Browser and mirrors sample selection into the footer', async () => {
    render(<App />)

    const start = await screen.findByRole('button', { name: 'Start New MixJam' })
    await waitFor(() => expect(start).toBeEnabled())
    fireEvent.click(start)

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

  it('creates a clip placement when a sample bubble is dragged onto a Tracker lane', async () => {
    render(<App />)

    const start = await screen.findByRole('button', { name: 'Start New MixJam' })
    await waitFor(() => expect(start).toBeEnabled())
    fireEvent.click(start)

    await waitFor(() => {
      expect(screen.getByText('Lane 1')).toBeInTheDocument()
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
