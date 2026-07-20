import { expect, type Page } from '@playwright/test'

export async function openSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
}

export async function selectZoomLevel(page: Page, label: string): Promise<void> {
  const zoomLevel = page.getByRole('group', { name: 'Zoom Level' })
  await zoomLevel.getByRole('button', { name: label, exact: true }).click()
}

export async function closeSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Close Settings' }).click()
}

export async function setZoomLevelAndClose(
  page: Page,
  label: string
): Promise<void> {
  await openSettings(page)
  await selectZoomLevel(page, label)
  await closeSettings(page)
}
