import { test, expect } from './fixtures'

test.describe('Library', () => {
  test.beforeEach(async ({ seededPage }) => {
    await seededPage.getByRole('button', { name: 'Start New MixJam' }).click()
    await expect(seededPage.locator('.home-setup')).not.toBeVisible({ timeout: 5_000 })
  })

  test('sample browser shows sample tiles', async ({ seededPage }) => {
    const bubbles = seededPage.locator('.sample-bubble')
    const count = await bubbles.count()
    expect(count).toBeGreaterThan(0)

    await expect(seededPage.locator('.sample-bubble b').first()).toBeAttached()
  })

  test('category filter shows categories from mock data', async ({ seededPage }) => {
    await expect(seededPage.locator('.bubble-category').filter({ hasText: 'Bass' })).toBeVisible({ timeout: 5_000 })
    await expect(seededPage.locator('.bubble-category').filter({ hasText: 'Drums' })).toBeVisible()
    await expect(seededPage.locator('.bubble-category').filter({ hasText: 'Synth' })).toBeVisible()
    await expect(seededPage.locator('.bubble-category').filter({ hasText: 'FX' })).toBeVisible()
  })

  test('clicking a category filters samples', async ({ seededPage }) => {
    await seededPage.waitForTimeout(500)

    const sampleTiles = () => seededPage.locator('.tiles .sample-bubble')

    const tileCount = await sampleTiles().count()
    expect(tileCount).toBeGreaterThan(0)

    await seededPage.locator('.bubble-category').filter({ hasText: 'Drums' }).click()
    await seededPage.waitForTimeout(500)

    const afterFilter = await sampleTiles().count()
    expect(afterFilter).toBeGreaterThan(0)
  })

  test('back button returns to home screen', async ({ seededPage }) => {
    const backBtn = seededPage.locator('header button').first()
    await backBtn.click()

    await expect(seededPage.locator('.home-setup')).toBeVisible({ timeout: 5_000 })
  })
})
