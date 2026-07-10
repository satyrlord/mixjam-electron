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

    const env = { ...process.env } as Record<string, string>
    delete env.ELECTRON_RUN_AS_NODE

    const electronApp = await electron.launch({
      args: process.env['CI'] ? [MAIN_ENTRY, '--no-sandbox'] : [MAIN_ENTRY],
      env
    })

    try {
      const window = await electronApp.firstWindow()
      expect(window).toBeTruthy()

      await window.waitForSelector('#root > *', { timeout: 15_000 })

      await expect(window.locator('header')).toBeVisible({ timeout: 5_000 })
      await expect(window.locator('.home-wordmark')).toBeVisible()
      await expect(window.locator('.home-wordmark')).toHaveText('MixJam')

      const footer = window.locator('footer')
      await expect(footer).toBeVisible({ timeout: 5_000 })

      const footerText = await footer.textContent()
      expect(footerText).toBeTruthy()

      await expect(window.locator('.folder-card').first()).toBeVisible({ timeout: 5_000 })

      const startBtn = window.getByRole('button', { name: 'Start New MixJam' })
      await expect(startBtn).toBeVisible()
    } finally {
      await electronApp.close()
    }
  })
})
