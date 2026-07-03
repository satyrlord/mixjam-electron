/**
 * Playwright coverage fixture. Collects V8 code coverage during e2e tests and
 * writes raw coverage data to coverage-e2e/raw/ so a merge script can convert
 * it to Istanbul format and combine it with vitest's unit-test coverage.
 *
 * Usage: import { test } from './coverageFixture' instead of './fixtures'.
 */
import { test as base, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const RAW_DIR = resolve(__dirname, '..', 'coverage-e2e', 'raw')

// Ensure the output directory exists.
try { mkdirSync(RAW_DIR, { recursive: true }) } catch { /* ok */ }

interface CoverageFixtures {
  coveragePage: Page
}

export const test = base.extend<CoverageFixtures>({
  coveragePage: async ({ page }, use, testInfo) => {
    // Start JS coverage collection before the test.
    await page.coverage.startJSCoverage({ resetOnNavigation: false })

    await use(page)

    // Stop and save coverage after the test.
    const coverage = await page.coverage.stopJSCoverage()
    if (coverage.length > 0) {
      const filename = `${testInfo.title.replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now()}.json`
      writeFileSync(resolve(RAW_DIR, filename), JSON.stringify(coverage, null, 2))
    }
  }
})

export { expect } from '@playwright/test'
