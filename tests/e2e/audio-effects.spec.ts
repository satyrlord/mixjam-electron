import { test, expect } from './fixtures'

test('the Mixer edits, saves, clears, and resets a return Delay', async ({ seededPage: page }) => {
  await page.getByRole('button', { name: 'Start New MixJam' }).click()
  await page.getByRole('tab', { name: 'Mixer' }).click()

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

test('return controls stay contained at narrow widths', async ({ seededPage: page }) => {
  await page.setViewportSize({ width: 640, height: 720 })
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
    return scrollport instanceof HTMLElement && strips instanceof HTMLElement && fx instanceof HTMLElement &&
      strips.scrollWidth >= scrollport.clientWidth && fx.getBoundingClientRect().width > 0
  })
  expect(contained).toBe(true)
})
