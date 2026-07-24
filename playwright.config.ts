import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/global-setup.ts',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: 0,
  workers: 1,

  reporter: [
    ['line']
  ],

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },

  projects: [
    {
      name: 'electron-e2e',
      testMatch: 'e2e/**/*.spec.ts'
    },

    {
      name: 'electron-smoke',
      testMatch: 'electron/**/*.spec.ts'
    }
  ]
})
