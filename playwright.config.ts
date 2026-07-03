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

  // Auto-start a static file server for the production renderer bundle.
  // The server stops automatically when Playwright exits.
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
    // ------------------------------------------------------------------
    // Browser e2e: Chromium against the production bundle served by the
    // static server. The app runs with an injected mock BackendAPI so we
    // can exercise the full UI without real folder access.
    // ------------------------------------------------------------------
    {
      name: 'browser-e2e',
      use: {
        ...devices['Desktop Chrome']
      },
      testMatch: 'e2e/**/*.spec.ts'
    },

    // ------------------------------------------------------------------
    // Electron smoke test: launches the packaged Electron app and
    // verifies it boots. Requires a production build (npm run build).
    // Skipped automatically when the build is missing.
    // ------------------------------------------------------------------
    {
      name: 'electron-smoke',
      use: {
        // Electron uses its own Chromium; browser-level options don't apply.
        ...devices['Desktop Chrome']
      },
      testMatch: 'electron/**/*.spec.ts'
    }
  ]
})
