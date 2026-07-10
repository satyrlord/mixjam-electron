import { test, expect } from './fixtures'

test('per-channel effects can be edited, bypassed, reordered, removed, and restored from storage', async ({ seededPage: page }) => {
  await page.getByRole('button', { name: 'Start New MixJam' }).click()

  const add = page.getByRole('combobox', { name: 'Add effect to channel 1', exact: true })
  await add.selectOption('delay')
  await add.selectOption('reverb')

  await page.getByRole('button', { name: 'Delay effect on channel 1' }).click()
  const time = page.getByRole('slider', { name: 'Time', exact: true })
  await time.fill('640')
  await page.getByRole('button', { name: 'Bypass' }).click()
  await page.getByRole('button', { name: 'Move right' }).click()
  await page.getByRole('button', { name: 'Close effect settings' }).click()

  const slots = page.locator('[aria-label="Channel 1 effects"] .channel-effect-slot')
  await expect(slots).toHaveCount(2)
  await expect(slots.first()).toHaveAttribute('aria-label', 'Reverb effect on channel 1')
  await expect(slots.nth(1)).toHaveClass(/channel-effect-slot-bypassed/)

  await page.reload()
  await page.getByRole('button', { name: 'Start New MixJam' }).click()
  const restoredSlots = page.locator('[aria-label="Channel 1 effects"] .channel-effect-slot')
  await expect(restoredSlots).toHaveCount(2)
  await expect(restoredSlots.first()).toHaveAttribute('aria-label', 'Reverb effect on channel 1')

  await page.getByRole('button', { name: 'Delay effect on channel 1' }).click()
  await page.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(restoredSlots).toHaveCount(1)
})
