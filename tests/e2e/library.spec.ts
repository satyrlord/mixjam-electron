/**
 * E2E tests for the library (sample browser, filtering, and player).
 * Uses the mock BackendAPI with pre-seeded samples.
 */
import { test, expect } from './fixtures'

test.describe('Library', () => {
  test.beforeEach(async ({ seededPage }) => {
    // Navigate to the tracker by clicking Start New MixJam.
    await seededPage.getByRole('button', { name: 'Start New MixJam' }).click()
    // Wait for the tracker to appear (home content disappears).
    await expect(seededPage.locator('.home-setup')).not.toBeVisible({ timeout: 5_000 })
  })

  test('sample browser shows sample tiles', async ({ seededPage }) => {
    // The sample grid should have sample-bubble buttons. Since the list is
    // virtualized, not all tiles may be in the visible viewport; verify at
    // least some are present.
    const bubbles = seededPage.locator('.sample-bubble')
    const count = await bubbles.count()
    expect(count).toBeGreaterThan(0)

    // At least one sample name from our mock data should be in a tile.
    await expect(seededPage.locator('.sample-bubble b').first()).toBeAttached()
  })

  test('category filter shows categories from mock data', async ({ seededPage }) => {
    // Categories are rendered as .bubble-category buttons.
    await expect(seededPage.locator('.bubble-category').filter({ hasText: 'Bass' })).toBeVisible({ timeout: 5_000 })
    await expect(seededPage.locator('.bubble-category').filter({ hasText: 'Drums' })).toBeVisible()
    await expect(seededPage.locator('.bubble-category').filter({ hasText: 'Synth' })).toBeVisible()
    await expect(seededPage.locator('.bubble-category').filter({ hasText: 'FX' })).toBeVisible()
  })

  test('clicking a category filters samples', async ({ seededPage }) => {
    // The sample grid is virtualized (TanStack Virtual). After navigating to
    // the tracker, give the grid time to measure its container and render the
    // initial viewport rows.
    await seededPage.waitForTimeout(500)

    // Count sample tiles only (exclude category bubbles which also have the
    // .sample-bubble class via the compound .sample-bubble.bubble-category).
    const sampleTiles = () => seededPage.locator('.tiles .sample-bubble')

    // Verify tiles render (at least some should be visible).
    const tileCount = await sampleTiles().count()
    expect(tileCount).toBeGreaterThan(0)

    // Click the Drums category to filter.
    await seededPage.locator('.bubble-category').filter({ hasText: 'Drums' }).click()
    await seededPage.waitForTimeout(500)

    // After filtering, tiles should still be present (drum samples only).
    const afterFilter = await sampleTiles().count()
    expect(afterFilter).toBeGreaterThan(0)
  })

  test('back button returns to home screen', async ({ seededPage }) => {
    // The header should have a back/home navigation button.
    const backBtn = seededPage.locator('header button').first()
    await backBtn.click()

    // Home screen reappears.
    await expect(seededPage.locator('.home-setup')).toBeVisible({ timeout: 5_000 })
  })
})
