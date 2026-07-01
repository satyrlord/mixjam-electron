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

    const start = await screen.findByRole('button', { name: 'Start New MixJam' })
    await waitFor(() => expect(start).toBeEnabled())
    fireEvent.click(start)

    await waitFor(() => {
      expect(screen.getByText('Recent Projects')).toBeInTheDocument()
      expect(screen.getByText('Lane 1')).toBeInTheDocument()
    })
    expect(vi.mocked(window.electronAPI.resizeToTracker)).toHaveBeenCalledTimes(1)
  })

  it('renders recent projects in the tracker rail and mirrors sample selection into the footer', async () => {
    render(<App />)

    const start = await screen.findByRole('button', { name: 'Start New MixJam' })
    await waitFor(() => expect(start).toBeEnabled())
    fireEvent.click(start)

    await waitFor(() => {
      expect(screen.getByText('club-night')).toBeInTheDocument()
      expect(screen.getByText('sunrise')).toBeInTheDocument()
    })

    const kickRow = await screen.findByRole('button', { name: /kick_808/ })
    fireEvent.click(kickRow)

    expect(screen.getByText('C:\\Samples\\Drums\\Kicks\\kick_808.wav')).toBeInTheDocument()
    expect(screen.getByText('Drums, WAV')).toBeInTheDocument()
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

  it('places a clip on the tracker lane when a sample tile is dragged onto a lane', async () => {
    render(<App />)

    const start = await screen.findByRole('button', { name: 'Start New MixJam' })
    await waitFor(() => expect(start).toBeEnabled())
    fireEvent.click(start)

    await waitFor(() => {
      expect(screen.getByText('Lane 1')).toBeInTheDocument()
    })

    const detail = JSON.stringify({
      name: 'kick_808.wav',
      path: 'Drums/Kicks/kick_808.wav',
      metadata: [],
      tags: [],
      duration: 0.5
    })

    const lane3Canvas = screen.getByRole('region', { name: 'Lane 3 track area' })
    fireEvent.drop(lane3Canvas, {
      dataTransfer: { getData: () => detail, types: ['application/mixjam-sample'] }
    })

    await waitFor(() => {
      expect(screen.getByTitle('kick_808.wav')).toBeInTheDocument()
    })

    // Dropping again on the same lane adds a second overlapping clip (visual overlap, monophonic playback)
    fireEvent.drop(lane3Canvas, {
      dataTransfer: { getData: () => detail, types: ['application/mixjam-sample'] }
    })
    expect(screen.getAllByTitle('kick_808.wav')).toHaveLength(2)

    // Dropping on a different lane adds a third clip
    const lane2Canvas = screen.getByRole('region', { name: 'Lane 2 track area' })
    fireEvent.drop(lane2Canvas, {
      dataTransfer: { getData: () => detail, types: ['application/mixjam-sample'] }
    })
    expect(screen.getAllByTitle('kick_808.wav')).toHaveLength(3)
  })

  it('applies the Emerald theme by default and ignores unknown themes', () => {
    render(<App />)

    const select = screen.getByLabelText('Theme')
    expect(select).toHaveValue('emerald')

    // Unknown theme falls back to emerald
    fireEvent.change(select, { target: { value: 'nonexistent' } })
    expect(select).toHaveValue('emerald')
  })
})
