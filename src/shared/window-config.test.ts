// Unit tests for the window sizing helpers.
//
// These live beside their subject rather than inside a renderer acceptance
// spec: `window-config` is a main-process module, and none of this needs React
// or a DOM. The app-shell spec still asserts the navigation behavior that
// *uses* these helpers.
import { describe, expect, it, vi } from 'vitest'
import {
  HOME_WINDOW_SIZE,
  PLAYER_WINDOW_SIZE,
  resizeWindowToHome,
  resizeWindowToPlayer
} from './window-config'

function windowControls(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    setResizable: vi.fn(),
    setMaximizable: vi.fn(),
    setSize: vi.fn(),
    setContentSize: vi.fn(),
    setMinimumSize: vi.fn(),
    getBounds: vi.fn(() => ({ width: 1920, height: 1080 })),
    getContentBounds: vi.fn(() => ({ width: 1920, height: 1080 })),
    center: vi.fn(),
    unmaximize: vi.fn(),
    isMaximized: vi.fn(() => false),
    once: vi.fn(),
    ...overrides
  }
}

describe('window sizes', () => {
  it('Home and Player both target 1920x1080', () => {
    expect(HOME_WINDOW_SIZE).toEqual({ width: 1920, height: 1080 })
    expect(PLAYER_WINDOW_SIZE).toEqual({ width: 1920, height: 1080 })
  })
})

describe('resizing an unmaximized window', () => {
  it('sizes and centers immediately', () => {
    const controls = windowControls()
    resizeWindowToHome(controls)
    expect(controls.center).toHaveBeenCalledTimes(1)
    expect(controls.setMinimumSize).toHaveBeenCalledTimes(1)
  })

  it('sizes for the Player without waiting on an unmaximize', () => {
    const controls = windowControls()
    resizeWindowToPlayer(controls)
    expect(controls.setContentSize).toHaveBeenCalled()
  })
})

describe('resizing a maximized window', () => {
  it('defers sizing until the asynchronous unmaximize lands', async () => {
    // Windows reports the pre-unmaximize bounds if we size immediately, so the
    // work has to wait for the event. Doing it eagerly puts the window at the
    // maximized size and off-centre.
    let unmaximizeListener: (() => void) | undefined
    const controls = windowControls({
      isMaximized: vi.fn(() => true),
      once: vi.fn((event: string, listener: () => void) => {
        expect(event).toBe('unmaximize')
        unmaximizeListener = listener
      })
    })

    resizeWindowToHome(controls)
    expect(controls.center).not.toHaveBeenCalled()
    expect(controls.setMinimumSize).not.toHaveBeenCalled()

    unmaximizeListener?.()
    await new Promise<void>((resolve) => queueMicrotask(resolve))
    expect(controls.center).toHaveBeenCalledTimes(1)
    expect(controls.setMinimumSize).toHaveBeenCalledTimes(1)
  })
})
