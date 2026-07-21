import { test, expect } from './fixtures'

test.describe('Home screen', () => {
  test('renders the app shell with header, home content, and footer', async ({ seededPage }) => {
    await expect(seededPage.locator('header')).toBeVisible()
    await expect(seededPage.locator('.home-wordmark')).toBeVisible()
    await expect(seededPage.locator('.home-wordmark')).toHaveText('MixJam')
    await expect(seededPage.locator('footer')).toBeVisible()
  })

  test('uses the bundled app icon as the Home logo', async ({ seededPage }) => {
    const logo = seededPage.getByRole('img', { name: 'MixJam logo' })

    await expect(logo).toBeVisible()
    await expect(logo).toHaveAttribute('src', /app-icon-128-.*\.png$/)
    await expect.poll(() => logo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(128)
  })

  test('shows the configured library summary and reveals folder controls', async ({ seededPage }) => {
    const library = seededPage.getByRole('region', { name: 'Library Setup' })
    await expect(library.getByText('Library ready')).toBeVisible()
    await expect(library.getByText('MixJam', { exact: true })).toBeVisible()
    await expect(library.getByText('Samples', { exact: true })).toBeVisible()

    await library.getByRole('button', { name: 'Change folders' }).click()
    await expect(library.getByRole('button', { name: 'Change User Folder' })).toBeVisible()
    await expect(library.getByRole('button', { name: 'Change Sample Folder' })).toBeVisible()
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

    const longName = seededPage.locator('.home-recent-name').filter({
      hasText: 'deep-water-session-with-an-unusually-long-project-name-for-layout-stress-that-keeps-going'
    })
    await expect(longName).toBeVisible()
    const truncation = await longName.evaluate((element) => {
      const style = getComputedStyle(element)
      const item = element.closest('.home-recent-item')
      if (!(item instanceof HTMLElement)) throw new Error('Recent project row is unavailable')
      return {
        overflow: style.overflow,
        textOverflow: style.textOverflow,
        whiteSpace: style.whiteSpace,
        nameIsTruncated: element.scrollWidth > element.clientWidth,
        rowIsContained: item.scrollWidth <= item.clientWidth + 1
      }
    })
    expect(truncation).toEqual({
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      nameIsTruncated: true,
      rowIsContained: true
    })
  })

  test('keeps theme selection in the header only', async ({ seededPage }) => {
    await expect(seededPage.locator('.theme-selector')).toBeVisible()
    await expect(seededPage.locator('.home-themes')).toHaveCount(0)
    await expect(seededPage.locator('.home-theme-swatch')).toHaveCount(0)
  })

  test('footer shows app info', async ({ seededPage }) => {
    const footer = seededPage.locator('footer')
    await expect(footer).toBeVisible()
    expect(await footer.textContent()).toBeTruthy()
  })
})
