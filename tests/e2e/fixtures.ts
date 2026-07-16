/**
 * Shared Playwright fixtures for e2e tests.
 *
 * The mock BackendAPI is defined in mock-backend.js (a plain ES5-compatible
 * .js file so it can be read and inlined into the browser context at test
 * time). Functions cannot survive structured-clone serialization, so the
 * entire mock must execute as a string. main.tsx's guard
 * (`if (!window.backendAPI)`) leaves the injected mock in place.
 *
 * To edit the mock data, edit tests/e2e/mock-backend.js directly.
 */
import { test as base, type Page } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

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
  seededPage: async ({ page }, use, testInfo) => {
    // Start V8 JS coverage before anything loads so the entire app bundle,
    // worker, and wasm paths are captured.
    await page.coverage.startJSCoverage({ resetOnNavigation: false })

    // Read the mock backend script and inline it. The file is plain
    // ES5-compatible JavaScript — no TypeScript, no imports.
    const mockScript = readFileSync(MOCK_BACKEND_PATH, 'utf-8')
    await page.addInitScript(mockScript)

    // The local production server reads the build output directly. On Windows,
    // an index request can briefly observe the output directory between file
    // replacement operations and return its plain 404 response. Retry only
    // that transport-level failure; a persistent bad build still fails here.
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await page.goto('/')
      if (response?.status() !== 404) break
      if (attempt === 3) {
        throw new Error('Production index remained unavailable after three requests')
      }
      await page.waitForTimeout(100)
    }
    // Wait for the React root to render children.
    await page.waitForSelector('#root > *', { timeout: 15_000 })
    await use(page)

    // Stop coverage and persist raw V8 data for the Istanbul converter.
    const coverage = await page.coverage.stopJSCoverage()
    if (coverage.length > 0) {
      mkdirSync(RAW_COVERAGE_DIR, { recursive: true })
      const safeName = testInfo.title.replace(/[^a-zA-Z0-9_-]/g, '_')
      const outPath = resolve(RAW_COVERAGE_DIR, `${safeName}.json`)
      writeFileSync(outPath, JSON.stringify(coverage))
    }
  }
})

export { expect } from '@playwright/test'
