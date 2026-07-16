import { test, expect } from './fixtures'

test('999-bar lanes use a viewport-bounded canvas while scrolling', async ({ seededPage: page }) => {
  await page.getByRole('button', { name: 'Start New MixJam' }).click()

  const lane = page.locator('.tracker-lane-canvas').first()
  const canvas = page.locator('.lane-sample-bubble-canvas').first()
  const scrollport = page.locator('.tracker-lanes')

  const initial = await canvas.evaluate((element) => {
    const laneContainer = element.parentElement
    const tracker = element.closest('.tracker-lanes')
    if (!(laneContainer instanceof HTMLElement) || !(tracker instanceof HTMLElement)) {
      throw new Error('Lane canvas structure is missing')
    }
    return {
      logicalWidth: laneContainer.getBoundingClientRect().width,
      backingWidth: element.width,
      visibleLaneWidth: tracker.clientWidth - 168
    }
  })
  expect(initial.logicalWidth).toBe(127_872)
  expect(initial.backingWidth).toBe(initial.visibleLaneWidth)
  expect(initial.backingWidth).toBeLessThan(initial.logicalWidth)

  await lane.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const transfer = new DataTransfer()
    transfer.setData('application/mixjam-sample', JSON.stringify({
      name: 'kick.wav',
      relpath: 'Drums/kick.wav',
      tags: [],
      bpm: 120,
      duration: 1,
      slot: 0
    }))
    element.dispatchEvent(new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + 20,
      dataTransfer: transfer
    }))
  })
  await expect(page.locator('.lane-sample-bubble-canvas-container').first())
    .toHaveAttribute('data-placement-count', '1')

  const opaquePixels = await canvas.evaluate((element) => {
    const pixels = element.getContext('2d')?.getImageData(0, 0, element.width, element.height).data
    if (!pixels) return 0
    let count = 0
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] > 0) count++
    }
    return count
  })
  expect(opaquePixels).toBeGreaterThan(0)

  await scrollport.evaluate((element) => { element.scrollLeft = 50_000 })
  await expect.poll(() => canvas.evaluate((element) => Number.parseFloat(element.style.left)))
    .toBe(50_000)
  await expect.poll(() => canvas.evaluate((element) => element.width))
    .toBe(initial.visibleLaneWidth)
})
