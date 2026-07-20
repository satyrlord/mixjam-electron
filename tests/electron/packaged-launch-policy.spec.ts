import { expect, test } from '@playwright/test'
import {
  NO_SANDBOX_ENV,
  electronSandboxPolicy
} from './packaged-launch'

const USER_DATA_DIR = 'C:\\tmp\\mixjam-electron-test'
const PACKAGED_EXECUTABLE = 'C:\\MixJam\\MixJam.exe'

test.describe('Electron sandbox launch policy', () => {
  test('keeps local built-entry launches sandboxed', () => {
    const policy = electronSandboxPolicy(undefined, USER_DATA_DIR, {})

    expect(policy).toEqual({
      chromiumSandbox: true,
      launchArguments: [
        expect.stringMatching(/[\\/]out[\\/]main[\\/]index\.js$/),
        `--user-data-dir=${USER_DATA_DIR}`
      ]
    })
  })

  test('bypasses the sandbox for ambient-CI built-entry launches', () => {
    const policy = electronSandboxPolicy(undefined, USER_DATA_DIR, { CI: 'true' })

    expect(policy.chromiumSandbox).toBe(false)
    expect(policy.launchArguments).toEqual([
      expect.stringMatching(/[\\/]out[\\/]main[\\/]index\.js$/),
      `--user-data-dir=${USER_DATA_DIR}`,
      '--no-sandbox'
    ])
  })

  test('allows only an explicit built-entry bypass', () => {
    const policy = electronSandboxPolicy(undefined, USER_DATA_DIR, {
      CI: 'true',
      [NO_SANDBOX_ENV]: 'true'
    })

    expect(policy.chromiumSandbox).toBe(false)
    expect(policy.launchArguments).toContain('--no-sandbox')
  })

  test('keeps native packaged launches sandboxed in ambient CI', () => {
    const policy = electronSandboxPolicy(PACKAGED_EXECUTABLE, USER_DATA_DIR, { CI: 'true' })

    expect(policy).toEqual({
      chromiumSandbox: true,
      launchArguments: [`--user-data-dir=${USER_DATA_DIR}`]
    })
    expect(policy.launchArguments).not.toContain('--no-sandbox')
  })

  test('rejects an explicit sandbox bypass for a native packaged launch', () => {
    expect(() => electronSandboxPolicy(PACKAGED_EXECUTABLE, USER_DATA_DIR, {
      [NO_SANDBOX_ENV]: 'true'
    })).toThrow('Packaged release proof must run with the Chromium sandbox enabled.')
  })
})
