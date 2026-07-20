import { test, expect } from './fixtures'

test('the Mixer edits, saves, clears, and resets a return Echoform Delay', async ({ seededPage: page }) => {
  await page.getByRole('button', { name: 'Start New MixJam' }).click()
  await page.getByRole('tab', { name: 'Mixer' }).click()

  const firstLaneLabel = page.locator('.mixer-channel-select > span').first()
  await expect(firstLaneLabel).toHaveText('Lane 1')
  expect(await firstLaneLabel.evaluate((element) =>
    getComputedStyle(element, '::before').content
  )).toMatch(/^(none|normal|""|)$/)

  const fx1 = page.getByRole('button', { name: 'FX 1 Empty', exact: true })
  await fx1.click()
  await page.getByRole('menuitem', { name: 'Echoform Delay...' }).click()

  const dialog = page.getByRole('dialog', { name: 'Echoform Delay' })
  await expect(dialog).toBeVisible()
  const feedback = dialog.getByRole('slider', { name: 'Feedback' })
  await expect(feedback).toHaveAttribute('aria-valuetext', '68%')
  await feedback.press('ArrowUp')
  // The close button commits the draft as one edit.
  await dialog.getByRole('button', { name: 'Close Echoform Delay editor' }).click()
  // Saving renames the trigger to its module, so re-resolve.
  const fx1Populated = page.getByRole('button', { name: 'FX 1 Echoform Delay', exact: true })
  await expect(fx1Populated).toContainText('Echoform Delay')
  const fxCard1 = page.getByRole('region', { name: 'FX Return 1' })
  await expect(fxCard1).toContainText('Feedback 69%')
  await expect(fxCard1).toContainText('tape')

  await fx1Populated.click()
  await page.getByRole('menuitem', { name: 'Clear slot' }).click()
  await expect(fx1).toContainText('Empty')

  await page.reload()
  await page.getByRole('button', { name: 'Start New MixJam' }).click()
  await page.getByRole('tab', { name: 'Mixer' }).click()
  await expect(page.getByRole('button', { name: 'FX 1 Empty', exact: true })).toContainText('Empty')
})

test('return controls stay contained at the supported viewport size', async ({ seededPage: page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.getByRole('button', { name: 'Start New MixJam' }).click()
  await page.getByRole('tab', { name: 'Mixer' }).click()

  const fx1 = page.getByRole('button', { name: 'FX 1 Empty', exact: true })
  await fx1.click()
  await page.getByRole('menuitem', { name: 'Echoform Delay...' }).click()
  await page.getByRole('dialog', { name: 'Echoform Delay' })
    .getByRole('button', { name: 'Close Echoform Delay editor' }).click()

  const cardGeometry = await page.evaluate(() => {
    const cards = [...document.querySelectorAll<HTMLElement>('.mixer-fx-card')]
    const containmentErrors: string[] = []
    let returnControlCount = 0
    for (const [index, card] of cards.entries()) {
      const cardBox = card.getBoundingClientRect()
      const returnControls = [...card.querySelectorAll<HTMLElement>('.mixer-fx-mix [role="slider"], .mixer-limiter-toggle')]
      returnControlCount += returnControls.length
      for (const control of returnControls) {
        const box = control.getBoundingClientRect()
        if (box.left < cardBox.left - 0.5 || box.right > cardBox.right + 0.5 ||
          box.top < cardBox.top - 0.5 || box.bottom > cardBox.bottom + 0.5) {
          containmentErrors.push(`FX ${index + 1}: ${control.getAttribute('aria-label') ?? control.className}`)
        }
      }
    }

    const trigger = cards[0]?.querySelector<HTMLElement>('.mixer-fx-slot')
    const power = cards[0]?.querySelector<HTMLElement>('button.mixer-fx-led')
    if (!trigger || !power) throw new Error('Populated FX controls are unavailable')
    const triggerBox = trigger.getBoundingClientRect()
    const powerBox = power.getBoundingClientRect()
    const xOverlap = Math.min(triggerBox.right, powerBox.right) - Math.max(triggerBox.left, powerBox.left)
    const yOverlap = Math.min(triggerBox.bottom, powerBox.bottom) - Math.max(triggerBox.top, powerBox.top)
    return {
      cardCount: cards.length,
      returnControlCount,
      containmentErrors,
      moduleControlsIntersect: xOverlap > 0.5 && yOverlap > 0.5
    }
  })
  expect(cardGeometry.cardCount).toBe(4)
  expect(cardGeometry.returnControlCount).toBe(8)
  expect(cardGeometry.containmentErrors).toEqual([])
  expect(cardGeometry.moduleControlsIntersect).toBe(false)

  await expect(page.getByRole('button', { name: 'FX 4 Empty', exact: true })).toBeVisible()
  const laneSends = page.getByRole('group', { name: 'Lane 1 Sends' })
  await expect(laneSends.getByRole('slider', { name: 'Lane 1 Send 1' })).toBeVisible()
  const fxReturn4 = page.getByRole('region', { name: 'FX Return 4' })
  const return4Level = fxReturn4.getByRole('slider', { name: 'FX Return 4 Mix' })
  await expect(return4Level).toBeVisible()
  await expect(return4Level).toHaveAttribute('aria-valuetext', '100%')
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
