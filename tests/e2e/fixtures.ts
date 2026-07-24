/**
 * Shared Playwright fixtures for e2e tests.
 *
 * The mock BackendAPI is defined in mock-backend.js (a plain ES5-compatible
 * .js file so it can be read and inlined into the renderer context at test
 * time). Functions cannot survive structured-clone serialization, so the
 * entire mock must execute as a string. main.tsx's guard
 * (`if (!window.backendAPI)`) leaves the injected mock in place.
 *
 * To edit the mock data, edit tests/e2e/mock-backend.js directly.
 */
import { test as base, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { electronSandboxPolicy } from '../electron/packaged-launch'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Playwright transpiles TS to CJS at runtime, so import.meta is unavailable.
// Tests are always started from the repo root by the npm scripts.
const RAW_COVERAGE_DIR = resolve(process.cwd(), 'coverage-e2e', 'raw')
const MOCK_BACKEND_PATH = resolve(process.cwd(), 'tests', 'e2e', 'mock-backend.js')

interface E2EFixtures {
  seededPage: Page
}

export const test = base.extend<E2EFixtures>({
  // Playwright requires fixture functions to use an object-destructuring parameter.
  // eslint-disable-next-line no-empty-pattern
  page: async ({}, use, testInfo) => {
    const env = { ...process.env } as Record<string, string>
    delete env.ELECTRON_RUN_AS_NODE
    const userDataDir = mkdtempSync(join(tmpdir(), 'mixjam-e2e-'))
    const sandboxPolicy = electronSandboxPolicy(undefined, userDataDir)
    const electronApp = await electron.launch({
      args: sandboxPolicy.launchArguments,
      chromiumSandbox: sandboxPolicy.chromiumSandbox,
      env
    })
    const page = await electronApp.firstWindow()

    // Start V8 JS coverage before anything loads so the entire app bundle,
    // worker, and wasm paths are captured.
    await page.coverage.startJSCoverage({ resetOnNavigation: false })

    // Read the mock backend script and inline it. The file is plain
    // ES5-compatible JavaScript — no TypeScript, no imports.
    const mockScript = readFileSync(MOCK_BACKEND_PATH, 'utf-8')
    await page.addInitScript(mockScript)
    await page.reload()
    // Wait for the React root to render children.
    await page.waitForSelector('#root > *', { timeout: 15_000 })

    try {
      await use(page)
    } finally {
      // Stop coverage and persist raw V8 data for the Istanbul converter.
      if (!page.isClosed()) {
        const coverage = await page.coverage.stopJSCoverage()
        if (coverage.length > 0) {
          mkdirSync(RAW_COVERAGE_DIR, { recursive: true })
          const safeName = testInfo.title.replace(/[^a-zA-Z0-9_-]/g, '_')
          const outPath = resolve(RAW_COVERAGE_DIR, `${safeName}.json`)
          writeFileSync(outPath, JSON.stringify(coverage))
        }
      }
      await electronApp.close()
      rmSync(userDataDir, { recursive: true, force: true })
    }
  },
  seededPage: async ({ page }, use) => {
    await use(page)
  }
})

export { expect } from '@playwright/test'

export async function prepareHarnessPage(page: Page): Promise<void> {
  await page.setContent('<!doctype html><html><head></head><body></body></html>')
}
