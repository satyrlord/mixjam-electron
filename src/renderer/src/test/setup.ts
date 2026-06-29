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

  bootstrapTheme()

  afterEach(() => {
    cleanup()
  })
}
