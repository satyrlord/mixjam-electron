export {}

if (typeof window !== 'undefined') {
  const { createBackendAPI } = await import('./backendApi')
  const { applyTrackerGeometry, bootstrapTheme } = await import('../theme/themes')
  const { cleanup } = await import('@testing-library/react')
  const { afterEach } = await import('vitest')
  const { MockAudioContext, MockAudioWorkletNode } = await import('./mockAudioContext')
  await import('@testing-library/jest-dom/vitest')

  Object.defineProperty(window, 'backendAPI', {
    configurable: true,
    value: createBackendAPI()
  })

  // jsdom has no Web Audio API; provide the engine's mock so PlaybackEngine can be
  // constructed in component/hook tests without a real AudioContext.
  Object.defineProperty(globalThis, 'AudioContext', {
    configurable: true,
    writable: true,
    value: MockAudioContext
  })
  Object.defineProperty(globalThis, 'AudioWorkletNode', {
    configurable: true,
    writable: true,
    value: MockAudioWorkletNode
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

  // jsdom does not implement pointer capture. Radix Slider uses it for drag
  // continuity; browsers provide these methods natively.
  if (typeof Element.prototype.setPointerCapture === 'undefined') {
    Element.prototype.setPointerCapture = () => undefined
    Element.prototype.releasePointerCapture = () => undefined
    Element.prototype.hasPointerCapture = () => false
  }
  if (typeof window.PointerEvent === 'undefined') {
    Object.defineProperty(window, 'PointerEvent', {
      configurable: true,
      writable: true,
      value: MouseEvent
    })
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

  applyTrackerGeometry()
  bootstrapTheme()

  afterEach(() => {
    cleanup()
  })
}
