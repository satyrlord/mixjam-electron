import { test, expect } from './fixtures'

test.describe('Library', () => {
  test.beforeEach(async ({ seededPage }) => {
    await seededPage.getByRole('button', { name: 'Start New MixJam' }).click()
    await expect(seededPage.locator('.home-setup')).not.toBeVisible({ timeout: 5_000 })
    await seededPage.getByRole('tab', { name: 'Samples' }).click()
  })

  test('sample browser shows sample tiles', async ({ seededPage }) => {
    const bubbles = seededPage.locator('.tiles .sample-bubble')
    await expect(bubbles).toHaveCount(5)
    await expect(bubbles.filter({ hasText: 'kick_808' })).toBeVisible()
  })

  test('category filter shows categories from mock data', async ({ seededPage }) => {
    await expect(seededPage.locator('.bubble-category').filter({ hasText: 'Bass' })).toBeVisible({ timeout: 5_000 })
    await expect(seededPage.locator('.bubble-category').filter({ hasText: 'Drums' })).toBeVisible()
    await expect(seededPage.locator('.bubble-category').filter({ hasText: 'Synth' })).toBeVisible()
    await expect(seededPage.locator('.bubble-category').filter({ hasText: 'FX' })).toBeVisible()
  })

  test('sample filtering and management actions use the selected UI Size targets', async ({ seededPage }) => {
    await seededPage.getByRole('button', { name: /Manage tags/ }).click()

    const actions = seededPage.locator('.subcat, .sort-btn, .manage-action')
    await expect(actions.first()).toBeVisible()
    const boxes = await actions.evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect()
      return { width: rect.width, height: rect.height }
    }))
    const selectedSize = await seededPage.evaluate(() => Number.parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--ui-size'),
      10
    ))

    expect(boxes.length).toBeGreaterThan(0)
    for (const box of boxes) {
      expect(box.width).toBeGreaterThanOrEqual(selectedSize)
      expect(box.height).toBeGreaterThanOrEqual(selectedSize)
    }
  })

  test('clicking a category filters samples', async ({ seededPage }) => {
    const sampleTiles = seededPage.locator('.tiles .sample-bubble')
    await expect(sampleTiles).toHaveCount(5)

    await seededPage.getByRole('button', { name: 'Drums', exact: true }).click()

    await expect(sampleTiles).toHaveCount(2)
    await expect(sampleTiles.filter({ hasText: 'kick_808' })).toBeVisible()
    await expect(sampleTiles.filter({ hasText: 'snare_clap' })).toBeVisible()
    await expect(sampleTiles.filter({ hasText: 'deep_sub' })).toHaveCount(0)
  })

  test('back button returns to home screen', async ({ seededPage }) => {
    const backBtn = seededPage.getByRole('button', { name: /Return to Main Menu/ })
    await backBtn.click()

    await expect(seededPage.locator('.home-setup')).toBeVisible({ timeout: 5_000 })
  })
})
