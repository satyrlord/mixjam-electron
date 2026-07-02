export {}

if (typeof window !== 'undefined') {
  const { createElectronAPI } = await import('./electronApi')
  const { bootstrapTheme } = await import('../theme/themes')
  const { cleanup } = await import('@testing-library/react')
  const { afterEach } = await import('vitest')
  const { MockAudioContext } = await import('./mockAudioContext')
  await import('@testing-library/jest-dom/vitest')

  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: createElectronAPI()
  })

  // jsdom has no Web Audio API; provide the engine's mock so the Player can be
  // constructed in component/hook tests without a real AudioContext.
  Object.defineProperty(globalThis, 'AudioContext', {
    configurable: true,
    writable: true,
    value: MockAudioContext
  })

  // jsdom lacks ResizeObserver; provide a no-op stub so canvas-based components
  // can mount without throwing.
  if (typeof globalThis.ResizeObserver === 'undefined') {
    (globalThis as unknown as Record<string, unknown>).ResizeObserver = class {
      observe() { /* no-op */ }
      unobserve() { /* no-op */ }
      disconnect() { /* no-op */ }
    }
  }

  // jsdom's canvas getContext logs a loud "Not implemented" error and returns
  // null. Give canvas components a silent no-op 2D context instead: property
  // writes are stored, any other read yields a no-op function. Tests that need
  // to observe drawing install their own mock over this.
  HTMLCanvasElement.prototype.getContext = function getContextStub() {
    const target: Record<string | symbol, unknown> = {}
    return new Proxy(target, {
      get: (obj, prop) => {
        if (!(prop in obj)) obj[prop] = () => undefined
        return obj[prop]
      }
    }) as unknown as CanvasRenderingContext2D
  } as unknown as typeof HTMLCanvasElement.prototype.getContext

  bootstrapTheme()

  afterEach(() => {
    cleanup()
  })
}
