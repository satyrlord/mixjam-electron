import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMediaSessionControls } from './useMediaSessionControls'

afterEach(() => {
  Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: undefined })
})

describe('useMediaSessionControls', () => {
  it('does nothing when the browser has no Media Session API', () => {
    const { unmount } = renderHook(() => useMediaSessionControls({
      transportPlay: vi.fn(), transportPause: vi.fn(),
      transportSkipBack: vi.fn(), transportJumpToEnd: vi.fn()
    }))
    unmount()
  })

  it('registers, routes, and clears every supported media action', () => {
    const callbacks = {
      transportPlay: vi.fn(), transportPause: vi.fn(),
      transportSkipBack: vi.fn(), transportJumpToEnd: vi.fn()
    }
    const handlers = new Map<string, MediaSessionActionHandler | null>()
    const setActionHandler = vi.fn((action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      handlers.set(action, handler)
    })
    Object.defineProperty(navigator, 'mediaSession', {
      configurable: true,
      value: { setActionHandler }
    })
    const { unmount } = renderHook(() => useMediaSessionControls(callbacks))

    act(() => {
      handlers.get('play')?.({ action: 'play' } as MediaSessionActionDetails)
      handlers.get('pause')?.({ action: 'pause' } as MediaSessionActionDetails)
      handlers.get('previoustrack')?.({ action: 'previoustrack' } as MediaSessionActionDetails)
      handlers.get('nexttrack')?.({ action: 'nexttrack' } as MediaSessionActionDetails)
    })
    expect(callbacks.transportPlay).toHaveBeenCalledOnce()
    expect(callbacks.transportPause).toHaveBeenCalledOnce()
    expect(callbacks.transportSkipBack).toHaveBeenCalledOnce()
    expect(callbacks.transportJumpToEnd).toHaveBeenCalledOnce()

    unmount()
    expect(handlers.get('play')).toBeNull()
    expect(handlers.get('nexttrack')).toBeNull()
  })

  it('ignores unsupported media actions during registration and cleanup', () => {
    const setActionHandler = vi.fn(() => { throw new Error('unsupported') })
    Object.defineProperty(navigator, 'mediaSession', {
      configurable: true,
      value: { setActionHandler }
    })
    const { unmount } = renderHook(() => useMediaSessionControls({
      transportPlay: vi.fn(), transportPause: vi.fn(),
      transportSkipBack: vi.fn(), transportJumpToEnd: vi.fn()
    }))
    expect(() => unmount()).not.toThrow()
  })
})
