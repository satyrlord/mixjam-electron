import { test, expect } from './fixtures'

test('the FX workspace edits, bypasses, reorders, removes, undoes, and does not leak into a new session', async ({ seededPage: page }) => {
  await page.getByRole('button', { name: 'Start New MixJam' }).click()
  await page.getByRole('tab', { name: 'Mixer' }).click()
  await page.getByRole('button', { name: 'Open channel 1 effects, 0 of 4 used' }).click()
  await expect(page.getByRole('tab', { name: 'FX' })).toHaveAttribute('aria-selected', 'true')

  await page.getByText('Add effect', { exact: false }).click()
  await page.getByRole('menuitem', { name: /Delay.*repeating echoes/i }).click()
  await page.getByText('Add effect', { exact: false }).click()
  await page.getByRole('menuitem', { name: /Reverb.*room, studio/i }).click()

  await page.getByText('Delay', { exact: true }).first().click()
  await page.getByRole('button', { name: '375 ms' }).click()
  const timeValue = page.getByRole('textbox', { name: 'Time value' })
  await timeValue.fill('640')
  await timeValue.press('Enter')
  await page.getByRole('button', { name: 'Bypass Delay' }).click()
  await page.getByLabel('Delay order actions').click()
  await page.getByRole('menuitem', { name: 'Move right' }).click()

  const cards = page.locator('.effect-card')
  await expect(cards).toHaveCount(2)
  await expect(cards.first()).toContainText('Reverb')
  await expect(cards.nth(1)).toContainText('Delay')
  await expect(cards.nth(1)).toHaveClass(/effect-card-bypassed/)

  await page.getByText('Delay', { exact: true }).first().click()
  await page.getByText('Actions', { exact: true }).click()
  await page.getByRole('menuitem', { name: 'Remove effect' }).click()
  await expect(page.locator('.effect-card')).toHaveCount(1)
  await page.locator('.effect-undo-toast').getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator('.effect-card')).toHaveCount(2)

  await page.reload()
  await page.getByRole('button', { name: 'Start New MixJam' }).click()
  await page.getByRole('tab', { name: 'Mixer' }).click()
  await page.getByRole('button', { name: 'Open channel 1 effects, 0 of 4 used' }).click()
  await expect(page.locator('.effect-card')).toHaveCount(0)
})

test('FX keeps reordered selection visible and contains the compressor meter at narrow widths', async ({ seededPage: page }) => {
  await page.setViewportSize({ width: 640, height: 720 })
  await page.getByRole('button', { name: 'Start New MixJam' }).click()
  await page.getByRole('tab', { name: 'FX' }).click()

  for (let index = 0; index < 4; index++) {
    await page.getByRole('button', { name: 'Add effect' }).click()
    await page.getByRole('menuitem', { name: /Delay.*repeating echoes/i }).click()
  }

  await page.locator('.effect-card-main').first().click()
  for (let index = 0; index < 3; index++) {
    await page.locator('.effect-card-selected .effect-card-main').press('Alt+ArrowRight')
  }

  await expect.poll(async () => page.evaluate(() => {
    const chain = document.querySelector('.effects-chain')
    const selected = document.querySelector('.effect-card-selected')
    if (!chain || !selected) return false
    const chainRect = chain.getBoundingClientRect()
    const selectedRect = selected.getBoundingClientRect()
    return selectedRect.left >= chainRect.left + 12 && selectedRect.right <= chainRect.right - 12
  })).toBe(true)

  await page.reload()
  await page.getByRole('button', { name: 'Start New MixJam' }).click()
  await page.getByRole('tab', { name: 'FX' }).click()
  await page.getByRole('button', { name: 'Add effect' }).click()
  await page.getByRole('menuitem', { name: /Compressor.*loud and quiet/i }).click()

  const meterIsContained = await page.evaluate(() => {
    const editor = document.querySelector('.effect-detail')
    const controls = document.querySelector('.effect-controls')
    const meter = document.querySelector('.reduction-meter')
    if (!editor || !controls || !meter) return false
    const editorRect = editor.getBoundingClientRect()
    const controlsRect = controls.getBoundingClientRect()
    const meterRect = meter.getBoundingClientRect()
    return meterRect.left >= controlsRect.left &&
      meterRect.right <= controlsRect.right &&
      meterRect.right <= editorRect.right
  })
  expect(meterIsContained).toBe(true)
})
