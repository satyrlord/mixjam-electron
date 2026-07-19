import { test, expect } from './fixtures'

test('the Mixer edits, saves, clears, and resets a return Delay', async ({ seededPage: page }) => {
  await page.getByRole('button', { name: 'Start New MixJam' }).click()
  await page.getByRole('tab', { name: 'Mixer' }).click()

  const firstLaneLabel = page.locator('.mixer-channel-select > span').first()
  await expect(firstLaneLabel).toHaveText('Lane 1')
  expect(await firstLaneLabel.evaluate((element) =>
    getComputedStyle(element, '::before').content
  )).toMatch(/^(none|normal|""|)$/)

  const fx1 = page.getByRole('button', { name: 'FX 1', exact: true })
  await expect(fx1).toContainText('Empty')
  await fx1.click()
  await page.getByRole('menuitem', { name: 'Delay...' }).click()

  const dialog = page.getByRole('dialog', { name: 'Delay' })
  await expect(dialog).toBeVisible()
  const time = dialog.getByRole('slider', { name: 'Free time' })
  const feedback = dialog.getByRole('slider', { name: 'Feedback' })
  await expect(time).toHaveAttribute('aria-valuetext', '375 ms')
  await time.press('ArrowUp')
  await feedback.press('ArrowUp')
  await dialog.getByRole('button', { name: 'OK' }).click()
  await expect(fx1).toContainText('Delay')
  await expect(fx1).toContainText('385 ms')
  await expect(fx1).toContainText('Feedback 36%')

  await fx1.click()
  await page.getByRole('menuitem', { name: 'Clear slot' }).click()
  await expect(fx1).toContainText('Empty')

  await page.reload()
  await page.getByRole('button', { name: 'Start New MixJam' }).click()
  await page.getByRole('tab', { name: 'Mixer' }).click()
  await expect(page.getByRole('button', { name: 'FX 1', exact: true })).toContainText('Empty')
})

test('return controls stay contained at the supported viewport size', async ({ seededPage: page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.getByRole('button', { name: 'Start New MixJam' }).click()
  await page.getByRole('tab', { name: 'Mixer' }).click()

  await expect(page.getByRole('button', { name: 'FX 4' })).toBeVisible()
  const laneSends = page.getByRole('group', { name: 'Lane 1 Sends' })
  await expect(laneSends.getByRole('slider', { name: 'Lane 1 Send 1' })).toBeVisible()
  const limiter = page.getByRole('button', { name: 'Limiter for FX Return 4' })
  await expect(limiter).not.toHaveAttribute('title')
  await limiter.evaluate((element) => element.focus({ preventScroll: true }))
  await expect(limiter).toBeFocused()
  await expect(limiter).toHaveAttribute('data-state', 'instant-open')
  await expect(page.getByRole('tooltip')).toContainText('Caps this FX Return at −1 dBFS')
  const contained = await page.evaluate(() => {
    const scrollport = document.querySelector('.mixer-column-scroll')
    const strips = document.querySelector('.mixer-strips')
    const fx = document.querySelector('.mixer-fx-grid')
    if (!(scrollport instanceof HTMLElement) ||
      !(strips instanceof HTMLElement) ||
      !(fx instanceof HTMLElement)) return false
    const scrollportBox = scrollport.getBoundingClientRect()
    const stripsBox = strips.getBoundingClientRect()
    const fxBox = fx.getBoundingClientRect()
    return stripsBox.width > 0 &&
      fxBox.width > 0 &&
      fxBox.right <= scrollportBox.left + scrollport.scrollWidth + 1
  })
  expect(contained).toBe(true)
})
