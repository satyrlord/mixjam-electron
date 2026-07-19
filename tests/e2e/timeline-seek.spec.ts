import { test, expect } from './fixtures'
import { TICKS_PER_BEAT } from '../../src/renderer/src/engine/transport'
import { TRACKER_TOTAL_TICKS } from '../../src/renderer/src/lib/arrangement'

const TRACKER_LAST_GRID_TICK = Math.floor((TRACKER_TOTAL_TICKS - 1) / TICKS_PER_BEAT) * TICKS_PER_BEAT

for (const viewport of [
  { width: 1920, height: 1080 }
]) {
  test(`Song Progress Bar stays fixed in the Middle Strip at ${viewport.width}x${viewport.height}`, async ({ seededPage: page }) => {
    await page.setViewportSize(viewport)
    await page.getByRole('button', { name: 'Start New MixJam' }).click()

    const middleStrip = page.locator('.middle-strip')
    const progress = page.getByRole('scrollbar', { name: 'Song Progress Bar' })
    const resizeHandle = page.getByRole('separator', { name: 'Resize bottom workspace' })
    await expect(progress).toBeVisible()
    await expect(page.getByRole('button', { name: 'Untitled, project menu' })).toBeVisible()

    const assertProgressGeometry = async () => {
      const geometry = await middleStrip.evaluate((strip, control) => {
        if (!(control instanceof HTMLElement)) throw new Error('Song Progress Bar is unavailable')
        const stripBox = strip.getBoundingClientRect()
        const progressBox = control.getBoundingClientRect()
        const centerX = progressBox.left + progressBox.width / 2
        const centerY = progressBox.top + progressBox.height / 2
        const hit = document.elementFromPoint(centerX, centerY)
        return {
          isDirectChild: control.parentElement === strip,
          isCenterHit: hit === control || (hit !== null && control.contains(hit)),
          strip: { top: stripBox.top, bottom: stripBox.bottom, height: stripBox.height },
          progress: { top: progressBox.top, bottom: progressBox.bottom },
          viewportHeight: window.innerHeight
        }
      }, await progress.elementHandle())

      expect(geometry.isDirectChild).toBe(true)
      expect(geometry.isCenterHit).toBe(true)
      expect(geometry.progress.top).toBeGreaterThanOrEqual(geometry.strip.top)
      expect(geometry.progress.bottom).toBeLessThanOrEqual(geometry.strip.bottom)
      expect(geometry.progress.bottom).toBeLessThanOrEqual(geometry.viewportHeight)
      return geometry
    }

    const beforeResize = await assertProgressGeometry()
    const resizeBox = await resizeHandle.boundingBox()
    if (!resizeBox) throw new Error('Bottom Workspace resize handle is unavailable')
    await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y - 60, { steps: 8 })
    await page.mouse.up()
    await expect.poll(async () => (await resizeHandle.boundingBox())?.y ?? resizeBox.y)
      .toBeLessThan(resizeBox.y)

    const afterResize = await assertProgressGeometry()
    expect(afterResize.strip.height).toBe(beforeResize.strip.height)
  })
}

test('ruler clicks and the playhead share the musical origin at zero and nonzero scroll', async ({ seededPage: page }) => {
  await page.getByRole('button', { name: 'Start New MixJam' }).click()
  await expect(page.locator('.tracker-lane-name').first()).toHaveText('Lane 1')

  const scrollport = page.locator('.tracker-lanes')
  const track = page.locator('.tracker-ruler-track')
  const slider = page.getByRole('slider', { name: 'Tracker timeline' })
  await expect(slider).toHaveAttribute('aria-valuemax', String(TRACKER_LAST_GRID_TICK))
  for (const { scrollLeft, targetTick } of [
    { scrollLeft: 0, targetTick: 32 },
    { scrollLeft: 1100, targetTick: 320 },
    { scrollLeft: 15_800, targetTick: 4000 }
  ]) {
    await scrollport.evaluate((element, left) => {
      element.scrollLeft = left
      element.dispatchEvent(new Event('scroll'))
    }, scrollLeft)

    const trackBox = await track.boundingBox()
    if (!trackBox) throw new Error('Tracker ruler track is missing')

    const clickX = trackBox.x + (targetTick / TRACKER_TOTAL_TICKS) * trackBox.width
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

test('Skip Back moves the playhead and Tracker view to the start', async ({ seededPage: page }) => {
  await page.getByRole('button', { name: 'Start New MixJam' }).click()
  await expect(page.locator('.tracker-lane-name').first()).toHaveText('Lane 1')

  const scrollport = page.locator('.tracker-lanes')
  const slider = page.getByRole('slider', { name: 'Tracker timeline' })
  await scrollport.evaluate((element) => {
    element.scrollLeft = 1_100
    element.dispatchEvent(new Event('scroll'))
  })
  await expect.poll(() => scrollport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)

  await page.getByRole('button', { name: 'Skip Back' }).click()

  await expect(slider).toHaveAttribute('aria-valuenow', '0')
  await expect.poll(() => scrollport.evaluate((element) => element.scrollLeft)).toBe(0)
})

test('Jump to End stops at the exact song end and brings it into view', async ({ seededPage: page }) => {
  await page.evaluate(() => {
    const harness = window as unknown as { __mixjamProjectFiles: Record<string, string> }
    const project = JSON.parse(harness.__mixjamProjectFiles['club-night.mixjam']!)
    project.lanes[0].placements[0].startTick = 5_000
    harness.__mixjamProjectFiles['club-night.mixjam'] = JSON.stringify(project)
  })
  await page.getByRole('button', { name: /club-night/ }).click()

  const scrollport = page.locator('.tracker-lanes')
  const slider = page.getByRole('slider', { name: 'Tracker timeline' })
  await page.getByRole('button', { name: 'Jump to End' }).click()

  await expect(slider).toHaveAttribute('aria-valuenow', '5032')
  await expect.poll(() => scrollport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible()
})

test('Play from the parked song end restarts at zero after delayed preparation', async ({ seededPage: page }) => {
  await page.evaluate(() => {
    const originalReadSampleBytes = window.backendAPI.readSampleBytes
    window.backendAPI.readSampleBytes = (...args) => new Promise((resolve, reject) => {
      window.setTimeout(() => {
        originalReadSampleBytes(...args).then(resolve, reject)
      }, 350)
    })
  })
  await page.getByRole('button', { name: /club-night/ }).click()

  const slider = page.getByRole('slider', { name: 'Tracker timeline' })
  await page.getByRole('button', { name: 'Jump to End' }).click()
  await expect(slider).toHaveAttribute('aria-valuenow', '32')

  await page.getByRole('button', { name: 'Play' }).click()
  await expect(page.getByRole('button', { name: 'Preparing playback' })).toBeVisible()
  await expect(slider).toHaveAttribute('aria-valuenow', '0')
  await page.waitForTimeout(150)
  await expect(page.getByRole('button', { name: 'Preparing playback' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 1_000 })
})
