/**
 * E2E tests for the Home screen. The app runs against the production bundle
 * with a mock BackendAPI injected before load.
 */
import { test, expect } from './fixtures'

test.describe('Home screen', () => {
  test('renders the app shell with header, home content, and footer', async ({ seededPage }) => {
    await expect(seededPage.locator('header')).toBeVisible()
    // The wordmark is the large "MixJam" heading on the home screen.
    await expect(seededPage.locator('.home-wordmark')).toBeVisible()
    await expect(seededPage.locator('.home-wordmark')).toHaveText('MixJam')
    await expect(seededPage.locator('footer')).toBeVisible()
  })

  test('shows User Folder and Sample Folder cards', async ({ seededPage }) => {
    // Use exact text to avoid substring matches (e.g. "Select User Folder").
    await expect(seededPage.getByText('User Folder', { exact: true })).toBeVisible()
    await expect(seededPage.getByText('Sample Folder', { exact: true })).toBeVisible()
    // Folder names from the mock session — scope to folder cards to avoid
    // matching the wordmark heading.
    await expect(seededPage.locator('.folder-card').filter({ hasText: 'MixJam' })).toBeVisible()
    await expect(seededPage.locator('.folder-card').filter({ hasText: 'Samples' })).toBeVisible()
  })

  test('Start New MixJam is enabled when both folders are valid', async ({ seededPage }) => {
    const startBtn = seededPage.getByRole('button', { name: 'Start New MixJam' })
    await expect(startBtn).toBeVisible()
    await expect(startBtn).toBeEnabled()
  })

  test('clicking Start New MixJam navigates to tracker', async ({ seededPage }) => {
    await seededPage.getByRole('button', { name: 'Start New MixJam' }).click()
    await expect(seededPage.locator('.home-setup')).not.toBeVisible({ timeout: 5_000 })
    // The tracker view has class .tracker-view.
    await expect(seededPage.locator('.tracker-view')).toBeVisible({ timeout: 5_000 })
  })

  test('shows recent projects when session has them', async ({ seededPage }) => {
    await expect(seededPage.locator('.home-recent-title')).toBeVisible()
    // Scoped selectors to avoid strict-mode violations from duplicate text.
    await expect(seededPage.locator('.home-recent-name').filter({ hasText: 'club-night' })).toBeVisible()
    await expect(seededPage.locator('.home-recent-name').filter({ hasText: 'sunrise' })).toBeVisible()
  })

  test('shows theme swatches section', async ({ seededPage }) => {
    // Theme section has class .home-themes.
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
