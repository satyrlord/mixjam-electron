import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SongProgressBar from './SongProgressBar'

function createScrollport(clientWidth: number, scrollWidth: number) {
  const scrollport = document.createElement('div')
  scrollport.id = 'tracker-song-scrollport'
  let scrollLeft = 0
  Object.defineProperties(scrollport, {
    clientWidth: { configurable: true, get: () => clientWidth },
    scrollWidth: { configurable: true, get: () => scrollWidth },
    scrollLeft: {
      configurable: true,
      get: () => scrollLeft,
      set: (value: number) => { scrollLeft = value }
    }
  })
  return scrollport
}

describe('SongProgressBar', () => {
  it('mirrors scroll state and supports keyboard navigation without seeking', () => {
    const scrollport = createScrollport(1000, 2500)
    const scrollportRef = { current: scrollport }

    render(<SongProgressBar scrollportRef={scrollportRef} scrollportId={scrollport.id} />)

    const control = screen.getByRole('scrollbar', { name: 'Song Progress Bar' })
    expect(control).toHaveAttribute('aria-valuemin', '0')
    expect(control).toHaveAttribute('aria-controls', scrollport.id)
    expect(control).toHaveAttribute('aria-valuemax', '1500')
    expect(control).toHaveAttribute('aria-valuenow', '0')
    expect(control).toHaveAttribute('aria-disabled', 'false')
    expect(control).toHaveAttribute('tabindex', '0')
    expect(document.querySelector('.song-progress-thumb')).toHaveStyle({ width: '40%' })

    fireEvent.keyDown(control, { key: 'ArrowRight' })
    expect(scrollport.scrollLeft).toBe(100)
    expect(control).toHaveAttribute('aria-valuenow', '100')
    fireEvent.keyDown(control, { key: 'ArrowLeft' })
    expect(scrollport.scrollLeft).toBe(0)

    fireEvent.keyDown(control, { key: 'PageDown' })
    expect(scrollport.scrollLeft).toBe(900)
    fireEvent.keyDown(control, { key: 'PageUp' })
    expect(scrollport.scrollLeft).toBe(0)

    fireEvent.keyDown(control, { key: 'End' })
    expect(scrollport.scrollLeft).toBe(1500)
    fireEvent.keyDown(control, { key: 'Home' })
    expect(scrollport.scrollLeft).toBe(0)

    scrollport.scrollLeft = 375
    fireEvent.scroll(scrollport)
    expect(control).toHaveAttribute('aria-valuenow', '375')
  })

  it('supports pointer track navigation and dragging', () => {
    const scrollport = createScrollport(500, 2000)
    const scrollportRef = { current: scrollport }
    render(<SongProgressBar scrollportRef={scrollportRef} scrollportId={scrollport.id} />)

    const control = screen.getByRole('scrollbar', { name: 'Song Progress Bar' })
    const track = document.querySelector('.song-progress-track')!
    const releasePointerCapture = vi.fn()
    Object.defineProperties(control, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: vi.fn(() => true) },
      releasePointerCapture: { configurable: true, value: releasePointerCapture }
    })
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 16,
      width: 200, height: 16, toJSON: () => ({})
    })

    fireEvent.pointerDown(control, { clientX: 100, pointerId: 1, button: 0 })
    expect(scrollport.scrollLeft).toBe(750)
    fireEvent.pointerMove(control, { clientX: 150, pointerId: 1 })
    expect(scrollport.scrollLeft).toBe(1250)
    fireEvent.pointerUp(control, { pointerId: 1 })

    const thumb = document.querySelector('.song-progress-thumb')!
    fireEvent.pointerDown(thumb, { clientX: 150, pointerId: 2, button: 0 })
    fireEvent.pointerMove(control, { clientX: 75, pointerId: 2 })
    expect(scrollport.scrollLeft).toBe(500)
    fireEvent.pointerCancel(control, { pointerId: 2 })
    expect(releasePointerCapture).toHaveBeenCalledTimes(2)
  })

  it('stays rendered but disabled when the song fits the viewport', () => {
    const scrollport = createScrollport(1000, 1000)
    const scrollportRef = { current: scrollport }
    render(<SongProgressBar scrollportRef={scrollportRef} scrollportId={scrollport.id} />)

    const control = screen.getByRole('scrollbar', { name: 'Song Progress Bar' })
    expect(control).toHaveAttribute('aria-disabled', 'true')
    expect(control).toHaveAttribute('aria-valuemax', '0')
    expect(control).toHaveAttribute('tabindex', '-1')
    expect(document.querySelector('.song-progress-thumb')).toHaveStyle({ width: '100%' })

    fireEvent.keyDown(control, { key: 'ArrowRight' })
    fireEvent.pointerDown(control, { clientX: 10, pointerId: 1, button: 0 })
    expect(scrollport.scrollLeft).toBe(0)
  })

  it('does nothing before a scrollport is attached', () => {
    const scrollportRef = { current: null as HTMLDivElement | null }

    render(<SongProgressBar scrollportRef={scrollportRef} scrollportId="later-scrollport" />)

    expect(screen.getByRole('scrollbar', { name: 'Song Progress Bar' }))
      .toHaveAttribute('aria-controls', 'later-scrollport')
  })
})
