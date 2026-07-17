import { test, expect } from './fixtures'

interface FaderFrame {
  ariaValueNow: string | null
  thumbTop: number
  thumbHeight: number
  trackHeight: number
  wrapperPosition: string | null
}

test('Mixer fader thumbs stay fixed when the panel becomes visible', async ({ seededPage: page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.getByRole('button', { name: 'Start New MixJam' }).click()

  await page.evaluate(async () => {
    for (let frame = 0; frame < 3; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    }
  })

  const hiddenGeometry = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('.bottom-workspace-mixer')
    const thumb = document.querySelector<HTMLElement>('.mixer-channel-vol')
    const track = thumb?.closest<HTMLElement>('.vertical-fader-track')
    return {
      hidden: panel?.hidden,
      display: panel ? getComputedStyle(panel).display : null,
      visibility: panel ? getComputedStyle(panel).visibility : null,
      thumbHeight: thumb?.getBoundingClientRect().height ?? 0,
      trackHeight: track?.getBoundingClientRect().height ?? 0
    }
  })

  expect(hiddenGeometry).toMatchObject({
    hidden: true,
    display: 'block',
    visibility: 'hidden',
    thumbHeight: 18
  })
  expect(hiddenGeometry.trackHeight).toBeGreaterThan(0)

  const mixerTab = page.getByRole('tab', { name: 'Mixer' })
  const mixerPanel = page.locator('.bottom-workspace-mixer')
  const takeFaderFrame = (): Promise<FaderFrame> => page.evaluate(() => {
    const thumb = document.querySelector<HTMLElement>('.mixer-channel-vol')
    const slider = thumb?.closest<HTMLElement>('[role="slider"]') ?? thumb
    const track = thumb?.closest<HTMLElement>('.vertical-fader-track')
    return {
      ariaValueNow: slider?.getAttribute('aria-valuenow') ?? null,
      thumbTop: thumb?.getBoundingClientRect().top ?? 0,
      thumbHeight: thumb?.getBoundingClientRect().height ?? 0,
      trackHeight: track?.getBoundingClientRect().height ?? 0,
      wrapperPosition: thumb?.parentElement?.style.bottom ?? null
    }
  })

  for (let cycle = 0; cycle < 3; cycle += 1) {
    const frames = [await takeFaderFrame()]
    await mixerTab.click()
    await expect(mixerTab).toHaveAttribute('aria-selected', 'true')
    await expect(mixerPanel).toHaveCSS('visibility', 'visible')
    frames.push(await takeFaderFrame())
    for (let frame = 1; frame <= 4; frame += 1) {
      await page.evaluate(() => new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
      }))
      frames.push(await takeFaderFrame())
    }

    expect(new Set(frames.map((frame) => frame.ariaValueNow))).toEqual(new Set(['80']))
    expect(new Set(frames.map((frame) => frame.thumbHeight))).toEqual(new Set([18]))
    expect(new Set(frames.map((frame) => frame.trackHeight)).size).toBe(1)
    expect(new Set(frames.map((frame) => frame.wrapperPosition)).size).toBe(1)
    expect(Math.max(...frames.map((frame) => frame.thumbTop)) - Math.min(...frames.map((frame) => frame.thumbTop))).toBeLessThan(0.1)

    await page.getByRole('tab', { name: 'Song' }).click()
    await expect(page.locator('.bottom-workspace-mixer')).toHaveCSS('visibility', 'hidden')
  }
})
