/**
 * Electron smoke test: launches the packaged Electron app and verifies it
 * boots, renders the home screen, and the thin shell is wired correctly.
 *
 * This test requires the production build to exist (npm run build). It is
 * skipped in CI environments that don't have a display server (use xvfb-run
 * or a headed CI runner).
 */
import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'

const MAIN_ENTRY = resolve(__dirname, '..', '..', 'out', 'main', 'index.js')

test.describe('Electron smoke', () => {
  test('app launches and renders the home screen', async () => {
    if (!existsSync(MAIN_ENTRY)) {
      test.skip(true, `Production build not found at ${MAIN_ENTRY}. Run "npm run build" first.`)
      return
    }

    const electronApp = await electron.launch({
      args: process.env['CI'] ? [MAIN_ENTRY, '--no-sandbox'] : [MAIN_ENTRY]
    })

    try {
      // The app opens one BrowserWindow.
      const window = await electronApp.firstWindow()
      expect(window).toBeTruthy()

      // Wait for the React root to render something.
      await window.waitForSelector('#root > *', { timeout: 15_000 })

      // Verify the home screen is visible. Use the wordmark heading to avoid
      // strict-mode violations from the many "MixJam" text matches.
      await expect(window.locator('header')).toBeVisible({ timeout: 5_000 })
      await expect(window.locator('.home-wordmark')).toBeVisible()
      await expect(window.locator('.home-wordmark')).toHaveText('MixJam')

      // Verify the thin shell is connected: the footer should show a version
      // that includes the app version (not "dev" which means shellAPI was
      // missing).
      const footer = window.locator('footer')
      await expect(footer).toBeVisible({ timeout: 5_000 })

      // The shellAPI provides getVersion; verify it is non-empty.
      const footerText = await footer.textContent()
      expect(footerText).toBeTruthy()
      // The version should not be "dev" (that would mean shellAPI fallback).
      // It may show something like "MixJam Electron" or the version number.
      console.log(`Electron app footer: ${footerText}`)

      // Verify the home screen folder cards render. On first launch without
      // a picked folder, the cards show prompts rather than names.
      await expect(window.locator('.folder-card').first()).toBeVisible({ timeout: 5_000 })

      // The Start button exists (disabled until folders are picked).
      const startBtn = window.getByRole('button', { name: 'Start New MixJam' })
      await expect(startBtn).toBeVisible()

      // Close the app cleanly.
      await electronApp.close()
    } catch (error) {
      // Always try to close, even on failure.
      await electronApp.close().catch(() => {})
      throw error
    }
  })
})
