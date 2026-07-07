/**
 * DIAGNOSTIC (temporary): screenshot the tracker lane-head column per theme
 * to reproduce the reported rendering artifact.
 */
import { test, expect } from './fixtures'

const THEMES = ['emerald', 'enterprise', 'rave', 'analog', 'ide', 'rust', 'screen', 'pa']

test('capture lane-head region across all themes', async ({ seededPage: page }) => {
  const start = page.getByRole('button', { name: 'Start New MixJam' })
  await expect(start).toBeEnabled()
  await start.click()
  await expect(page.getByText('Lane 1', { exact: true })).toBeVisible()

  const lanes = page.locator('.tracker-lanes')
  const box = await lanes.boundingBox()
  if (!box) throw new Error('tracker-lanes not found')

  for (const theme of THEMES) {
    await page.getByLabel('Theme').selectOption(theme)
    await page.waitForTimeout(150)
    await page.screenshot({
      path: `coverage-e2e/diag-${theme}.png`,
      clip: { x: box.x, y: box.y - 30, width: 260, height: Math.min(box.height + 30, 600) }
    })
  }
})
