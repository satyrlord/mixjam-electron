import { test, expect } from './fixtures'

test('generator opens from Home with editable parameters and no preview step', async ({ seededPage: page }) => {
  await page.getByRole('button', { name: 'Generate MixJam' }).click()

  const dialog = page.getByRole('dialog', { name: 'Generate MixJam' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Profile')).toHaveValue('techno')
  await expect(dialog.getByLabel('BPM source')).toHaveValue('follow-detected')
  await expect(dialog.getByRole('spinbutton', { name: 'BPM', exact: true })).toHaveCount(0)
  await expect(dialog.getByLabel('Intensity')).toHaveValue('medium')
  await expect(dialog.getByLabel('Duration (seconds)')).toHaveValue('180')
  await expect(dialog.getByText('5 samples ready. Analyzer tempo: 120 BPM.')).toBeVisible()
  await expect(dialog.getByText(/preview/i)).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Generate and Save' })).toBeEnabled()

  const geometry = await dialog.evaluate((element) => {
    const box = element.getBoundingClientRect()
    return {
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    }
  })
  expect(geometry.left).toBeGreaterThanOrEqual(0)
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth)
  expect(geometry.top).toBeGreaterThanOrEqual(0)
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight)

  await page.screenshot({ path: 'tmp/verify-generator-structure/generator-dialog.png', fullPage: true })
})

test('generator saves, opens, plays, and keeps Sample Browser and Tracker colors aligned', async ({ seededPage: page }) => {
  await page.getByRole('button', { name: 'Generate MixJam' }).click()
  const dialog = page.getByRole('dialog', { name: 'Generate MixJam' })
  await dialog.getByLabel('Seed').fill('e2e-color-proof')
  await dialog.getByRole('button', { name: 'Generate and Save' }).click()

  await expect(dialog.getByRole('heading', { name: 'MixJam created' })).toBeVisible()
  const generatedPath = await dialog.locator('.generator-path').innerText()
  expect(generatedPath).toMatch(/^techno-120bpm-medium-[a-f0-9]{8}-001\.mixjam$/)
  await page.screenshot({ path: 'tmp/verify-generator-structure/generator-complete.png', fullPage: true })

  await dialog.getByRole('button', { name: 'Open in Player' }).click()
  await expect(page.getByText('MixJam Browser')).toBeVisible()
  await expect(page.locator('.mixjam-browser-path', { hasText: generatedPath })).toBeVisible()
  await expect(page.locator('.lane-sample-bubble-canvas-container').first())
    .toHaveAttribute('data-placement-count', '2')

  await page.getByRole('tab', { name: 'Samples' }).click()
  await page.getByRole('button', { name: 'Drums', exact: true }).click()
  const sampleBubble = page.locator('.tiles .sample-bubble').first()
  await expect(sampleBubble).toBeVisible()
  const canvas = page.locator('.lane-sample-bubble-canvas').first()

  async function assertPaletteMatch(): Promise<string> {
    const colors = await sampleBubble.evaluate((element) => {
      const style = getComputedStyle(element)
      const token = getComputedStyle(document.documentElement).getPropertyValue('--palette-0').trim()
      return { bubble: style.backgroundColor, token }
    })
    const rgb = colors.bubble.match(/\d+/g)?.slice(0, 3).map(Number)
    expect(rgb).toHaveLength(3)
    const tokenHex = colors.token.replace('#', '')
    const tokenRgb = [0, 2, 4].map((offset) => Number.parseInt(tokenHex.slice(offset, offset + 2), 16))
    expect(rgb).toEqual(tokenRgb)
    const pixelCount = await canvas.evaluate((element, expected) => {
      const data = element.getContext('2d')?.getImageData(0, 0, element.width, element.height).data
      if (!data) return 0
      let count = 0
      for (let index = 0; index < data.length; index += 4) {
        if (data[index] === expected[0] && data[index + 1] === expected[1] &&
            data[index + 2] === expected[2] && data[index + 3] >= 250) count++
      }
      return count
    }, rgb!)
    expect(pixelCount).toBeGreaterThan(20)
    return colors.bubble
  }

  const emeraldColor = await assertPaletteMatch()
  await page.locator('.theme-selector').selectOption('beton')
  await expect.poll(() => sampleBubble.evaluate((element) => getComputedStyle(element).backgroundColor))
    .not.toBe(emeraldColor)
  await assertPaletteMatch()

  await page.getByRole('button', { name: 'Play' }).click()
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
  await page.screenshot({ path: 'tmp/verify-generator-structure/generator-player-beton.png', fullPage: true })
})

test('Player regeneration blocks shortcuts and returns focus to the project menu trigger', async ({ seededPage: page }) => {
  await page.getByRole('button', { name: 'Generate MixJam' }).click()
  const homeDialog = page.getByRole('dialog', { name: 'Generate MixJam' })
  await homeDialog.getByLabel('Seed').fill('e2e-modal-proof')
  await homeDialog.getByRole('button', { name: 'Generate and Save' }).click()
  await expect(homeDialog.getByRole('heading', { name: 'MixJam created' })).toBeVisible()
  await homeDialog.getByRole('button', { name: 'Open in Player' }).click()

  const projectMenuTrigger = page.locator('.strip-project-trigger')
  await expect(projectMenuTrigger).toBeVisible()
  await projectMenuTrigger.click()
  await page.getByRole('menuitem', { name: 'Regenerate with current library' }).click()

  const dialog = page.getByRole('dialog', { name: 'Generate MixJam' })
  await expect(dialog).toBeVisible()
  await expect(page.locator('body')).toHaveAttribute('data-mixjam-modal-blocking', '1')

  await page.keyboard.press('?')
  await expect(page.getByRole('dialog', { name: 'Keyboard Shortcuts' })).toHaveCount(0)
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(projectMenuTrigger).toBeFocused()
})
