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

    const kickRow = await screen.findByRole('button', { name: /kick_808\.wav/i })
    fireEvent.click(kickRow)

    expect(screen.getByText('Drums/Kicks/kick_808.wav')).toBeInTheDocument()
    expect(screen.getByText(/44\.1 kHz/)).toBeInTheDocument()
    expect(screen.getByText('Drums, Kick, 808')).toBeInTheDocument()
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

  it('places a clip on the tracker lane when a selected sample lane is clicked', async () => {
    render(<App />)

    const start = await screen.findByRole('button', { name: 'Start New MixJam' })
    await waitFor(() => expect(start).toBeEnabled())
    fireEvent.click(start)

    await waitFor(() => {
      expect(screen.getByText('Lane 1')).toBeInTheDocument()
    })

    const kickRow = await screen.findByRole('button', { name: /kick_808\.wav/i })
    fireEvent.click(kickRow)

    const laneCanvas = screen.getByRole('button', { name: 'Place sample on Lane 3' })
    fireEvent.click(laneCanvas)

    await waitFor(() => {
      expect(screen.getByTitle('kick_808.wav')).toBeInTheDocument()
    })

    // Second click on the same lane at the same position replaces the prior clip (monophonic)
    fireEvent.click(laneCanvas)
    expect(screen.getAllByTitle('kick_808.wav')).toHaveLength(1)

    // Click on a different lane preserves the first clip and adds a second
    const lane2Canvas = screen.getByRole('button', { name: 'Place sample on Lane 2' })
    fireEvent.click(lane2Canvas)
    expect(screen.getAllByTitle('kick_808.wav')).toHaveLength(2)
  })
})
