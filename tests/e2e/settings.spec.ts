import { test, expect } from './fixtures'
import { closeSettings, openSettings, selectZoomLevel } from './settings-helpers'

interface ProjectFileHarness {
  __mixjamProjectFiles: Record<string, string>
}

test('Settings owns folder, Zoom Level, and project Clip Edge Fades controls', async ({ seededPage: page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Start New MixJam' }).click()
  await openSettings(page)

  await expect(page.getByRole('dialog', { name: 'Settings' })).toHaveAttribute('aria-modal', 'true')
  await expect(page.getByRole('button', { name: 'Select User Folder' })).toBeVisible()
  const zoom = page.getByRole('group', { name: 'Zoom Level' })
  await expect(zoom.getByRole('button', { name: '100%' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('checkbox', {
    name: 'Enable automatic clip-edge fades'
  })).toBeEnabled()
  await expect(page.locator('.footer')).not.toContainText('Select User Folder')
  await expect(page.locator('.footer')).not.toContainText('100%')

  await selectZoomLevel(page, '125%')
  await expect(page.locator('.app')).toHaveAttribute('data-ui-size', '50')
  await expect.poll(() => page.locator('.settings-modal').evaluate((element) => ({
    horizontalOverflow: element.scrollWidth > element.clientWidth,
    rootOverflow: document.documentElement.scrollHeight > document.documentElement.clientHeight
  }))).toEqual({ horizontalOverflow: false, rootOverflow: false })

  await closeSettings(page)
  await openSettings(page)
  await expect(zoom.getByRole('button', { name: '125%' })).toHaveAttribute('aria-pressed', 'true')
})

test('Player Settings edits Clip Edge Fades and returns to a Master panel without them', async ({ seededPage: page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.getByRole('button', { name: 'Start New MixJam' }).click()
  await openSettings(page)

  const enabled = page.getByRole('checkbox', {
    name: 'Enable automatic clip-edge fades'
  })
  await expect(enabled).toBeEnabled()
  await enabled.uncheck()
  await expect(page.getByRole('spinbutton', {
    name: 'Automatic clip fade-in milliseconds'
  })).toBeDisabled()

  await closeSettings(page)
  await expect(page.getByRole('region', { name: 'Master bus rack' })).toBeVisible()
  await expect(page.getByText('Clip Edge Fades')).toHaveCount(0)
})

test('Settings exclusively owns focus and input until Escape returns focus to its footer trigger', async ({ seededPage: page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.getByRole('button', { name: 'Start New MixJam' }).click()

  const settingsTrigger = page.getByRole('button', { name: 'Settings', exact: true })
  await settingsTrigger.click()

  const dialog = page.getByRole('dialog', { name: 'Settings' })
  const closeButton = page.getByRole('button', { name: 'Close Settings' })
  await expect(dialog).toBeVisible()
  await expect(closeButton).toBeFocused()

  await page.keyboard.press('Shift+Tab')
  await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
  await expect(closeButton).not.toBeFocused()
  await page.keyboard.press('Tab')
  await expect(closeButton).toBeFocused()

  await page.keyboard.press('Tab')
  await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
  await expect(closeButton).not.toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(closeButton).toBeFocused()

  await page.locator('.mixjam-dialog-overlay').click({ position: { x: 8, y: 8 } })
  await expect(dialog).toBeVisible()

  const savedBeforeShortcut = await page.evaluate(() => {
    const harness = window as unknown as ProjectFileHarness
    return Object.hasOwn(harness.__mixjamProjectFiles, 'saved-project.mixjam')
  })
  expect(savedBeforeShortcut).toBe(false)
  await page.keyboard.press('Control+Shift+S')
  await expect.poll(() => page.evaluate(() => {
    const harness = window as unknown as ProjectFileHarness
    return Object.hasOwn(harness.__mixjamProjectFiles, 'saved-project.mixjam')
  })).toBe(false)
  await expect(dialog).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(settingsTrigger).toBeFocused()
})
