import { test, expect } from './fixtures'

test.describe('Home screen', () => {
  test('renders the app shell with header, home content, and footer', async ({ seededPage }) => {
    await expect(seededPage.locator('header')).toBeVisible()
    await expect(seededPage.locator('.home-wordmark')).toBeVisible()
    await expect(seededPage.locator('.home-wordmark')).toHaveText('MixJam')
    await expect(seededPage.locator('footer')).toBeVisible()
  })

  test('shows User Folder and Sample Folder cards', async ({ seededPage }) => {
    await expect(seededPage.getByText('User Folder', { exact: true })).toBeVisible()
    await expect(seededPage.getByText('Sample Folder', { exact: true })).toBeVisible()
    await expect(seededPage.locator('.folder-card').filter({ hasText: 'MixJam' })).toBeVisible()
    await expect(seededPage.locator('.folder-card').filter({ hasText: 'Samples' })).toBeVisible()
  })

  test('Start New MixJam is enabled when both folders are valid', async ({ seededPage }) => {
    const startBtn = seededPage.getByRole('button', { name: 'Start New MixJam' })
    await expect(startBtn).toBeVisible()
    await expect(startBtn).toBeEnabled()
  })

  test('clicking Start New MixJam navigates to the Player', async ({ seededPage }) => {
    await seededPage.getByRole('button', { name: 'Start New MixJam' }).click()
    await expect(seededPage.locator('.home-setup')).not.toBeVisible({ timeout: 5_000 })
    await expect(seededPage.locator('.player-view')).toBeVisible({ timeout: 5_000 })
  })

  test('shows MixJam files returned by the backend', async ({ seededPage }) => {
    await expect(seededPage.locator('.home-recent-title')).toBeVisible()
    await expect(seededPage.locator('.home-recent-name').filter({ hasText: 'club-night' })).toBeVisible()
    await expect(seededPage.locator('.home-recent-name').filter({ hasText: 'sunrise' })).toBeVisible()
  })

  test('shows theme swatches section', async ({ seededPage }) => {
    await expect(seededPage.locator('.home-themes')).toBeVisible()
    const swatches = seededPage.locator('.home-theme-swatches button')
    expect(await swatches.count()).toBeGreaterThan(0)
  })

  test('footer shows app info', async ({ seededPage }) => {
    const footer = seededPage.locator('footer')
    await expect(footer).toBeVisible()
    expect(await footer.textContent()).toBeTruthy()
  })
})
