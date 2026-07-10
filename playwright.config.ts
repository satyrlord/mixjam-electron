import { defineConfig, devices } from '@playwright/test'
import { resolve } from 'node:path'

const PORT = 4173
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: 0,
  workers: 1,

  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list']
  ],

  webServer: {
    command: `node scripts/serve-static.mjs ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env['CI'],
    timeout: 15_000
  },

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },

  projects: [
    {
      name: 'browser-e2e',
      use: {
        ...devices['Desktop Chrome']
      },
      testMatch: 'e2e/**/*.spec.ts'
    },

    {
      name: 'electron-smoke',
      use: {
        ...devices['Desktop Chrome']
      },
      testMatch: 'electron/**/*.spec.ts'
    }
  ]
})
