import { test, expect } from './fixtures'

test('ruler clicks and the playhead share the musical origin at zero and nonzero scroll', async ({ seededPage: page }) => {
  await page.getByRole('button', { name: 'Start New MixJam' }).click()
  await expect(page.getByText('Lane 1', { exact: true })).toBeVisible()

  const scrollport = page.locator('.tracker-lanes')
  const track = page.locator('.tracker-ruler-track')
  const slider = page.getByRole('slider', { name: 'Tracker timeline' })
  await expect(slider).toHaveAttribute('aria-valuemax', '4088')
  for (const { scrollLeft, targetTick } of [
    { scrollLeft: 0, targetTick: 32 },
    { scrollLeft: 1100, targetTick: 256 },
    { scrollLeft: 15_800, targetTick: 3072 }
  ]) {
    await scrollport.evaluate((element, left) => {
      element.scrollLeft = left
      element.dispatchEvent(new Event('scroll'))
    }, scrollLeft)

    const trackBox = await track.boundingBox()
    if (!trackBox) throw new Error('Tracker ruler track is missing')

    const clickX = trackBox.x + (targetTick / 4096) * trackBox.width
    await page.mouse.click(clickX, trackBox.y + trackBox.height / 2)

    await expect(slider).toHaveAttribute(
      'aria-valuenow',
      String(targetTick)
    )

    const playheadBox = await page.locator('.tracker-playhead').boundingBox()
    if (!playheadBox) throw new Error('Tracker playhead is missing')
    const playheadCenterX = playheadBox.x + playheadBox.width / 2
    expect(Math.abs(playheadCenterX - clickX)).toBeLessThanOrEqual(1)
  }
})
