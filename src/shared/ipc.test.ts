import { describe, expect, it } from 'vitest'
import { SHELL_IPC_CHANNELS } from './ipc'

describe('Electron shell IPC contract', () => {
  it('keeps the preload and main process on the same narrow channel set', () => {
    expect(SHELL_IPC_CHANNELS).toEqual({
      appGetVersion: 'app:get-version',
      windowResizePlayer: 'window:resize-player',
      windowResizeHome: 'window:resize-home',
      shellOpenUrl: 'shell:open-url'
    })
  })
})
