import { test, expect } from '@playwright/test'
import type { Page } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { launchMixJamElectron, seedMockBackend } from './packaged-launch'

const EVIDENCE_DIR = resolve(__dirname, '..', '..', 'tmp', 'verify-packaged-ui-size-50-many-lanes')
const UI_SIZE_50_LABEL = '125%'

interface ScrollMetrics {
  left: number
  top: number
  maxLeft: number
  maxTop: number
}

async function scrollMetrics(page: Page, selector: string): Promise<ScrollMetrics> {
  return page.locator(selector).evaluate((element) => {
    if (!(element instanceof HTMLElement)) throw new Error(`${element.className} is not an HTMLElement`)
    return {
      left: element.scrollLeft,
      top: element.scrollTop,
      maxLeft: element.scrollWidth - element.clientWidth,
      maxTop: element.scrollHeight - element.clientHeight
    }
  })
}

async function tabTo(page: Page, accessibleName: string): Promise<void> {
  for (let index = 0; index < 180; index += 1) {
    await page.keyboard.press('Tab')
    const activeName = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))
    if (activeName === accessibleName) return
  }
  throw new Error(`Tab traversal did not reach ${accessibleName}`)
}

async function expectFocusedElementVisible(page: Page, scrollportSelector: string): Promise<void> {
  const fullyVisible = await page.evaluate((portSelector) => {
    const target = document.activeElement
    const scrollport = document.querySelector(portSelector)
    if (!(target instanceof HTMLElement) || !(scrollport instanceof HTMLElement)) return false
    const targetBox = target.getBoundingClientRect()
    const portBox = scrollport.getBoundingClientRect()
    return targetBox.left >= portBox.left - 1 && targetBox.right <= portBox.right + 1 &&
      targetBox.top >= portBox.top - 1 && targetBox.bottom <= portBox.bottom + 1
  }, scrollportSelector)
  expect(fullyVisible).toBe(true)
}

test.describe('packaged interaction proof', () => {
  test('UI Size 50 keeps 16-lane Tracker and Mixer input paths reachable', async () => {
    const launched = await launchMixJamElectron()
    const { page } = launched
    const evidence: Record<string, unknown> = { tracker: {}, timeline: {}, mixer: {} }

    try {
      mkdirSync(EVIDENCE_DIR, { recursive: true })
      await seedMockBackend(page)
      await expect(page.locator('.home-wordmark')).toHaveText('MixJam')
      await page.setViewportSize({ width: 1920, height: 1080 })
      await expect.poll(() => page.evaluate(() => ({ width: innerWidth, height: innerHeight })))
        .toEqual({ width: 1920, height: 1080 })
      await page.getByRole('button', { name: 'Start New MixJam' }).click()
      await page.getByRole('button', { name: 'Settings', exact: true }).click()
      await page.getByRole('button', { name: UI_SIZE_50_LABEL, exact: true }).click()
      await expect(page.locator('.app')).toHaveAttribute('data-ui-size', '50')
      await page.getByRole('button', { name: 'Close Settings' }).click()

      const addLane = page.getByRole('button', { name: 'Add lane' })
      await expect(page.locator('.tracker-lane')).toHaveCount(8)
      for (let index = 0; index < 8; index += 1) await addLane.click()
      await expect(page.locator('.tracker-lane')).toHaveCount(16)
      const surface = await page.evaluate(() => {
        const app = document.querySelector('.app')
        return {
          origin: window.location.origin,
          viewport: { width: innerWidth, height: innerHeight },
          devicePixelRatio,
          uiSize: app?.getAttribute('data-ui-size'),
          tokens: {
            uiSize: getComputedStyle(document.documentElement).getPropertyValue('--ui-size').trim(),
            laneHeight: getComputedStyle(document.documentElement).getPropertyValue('--ui-lane-height').trim(),
            sampleBubbleHeight: getComputedStyle(document.documentElement).getPropertyValue('--sample-bubble-height').trim()
          },
          laneCount: document.querySelectorAll('.tracker-lane').length
        }
      })
      expect(surface).toMatchObject({
        origin: 'app://bundle',
        viewport: { width: 1920, height: 1080 },
        uiSize: '50',
        tokens: { uiSize: '50px', laneHeight: '61px', sampleBubbleHeight: '41px' },
        laneCount: 16
      })
      evidence.surface = surface

      const tracker = page.locator('.tracker-lanes')
      await tracker.hover()
      await page.mouse.wheel(0, 800)
      await expect.poll(async () => (await scrollMetrics(page, '.tracker-lanes')).top).toBeGreaterThan(0)
      const trackerAfterWheel = await scrollMetrics(page, '.tracker-lanes')

      await page.mouse.wheel(0, -10_000)
      await expect.poll(() => scrollMetrics(page, '.tracker-lanes')).toMatchObject({ top: 0 })
      await page.locator('body').click({ position: { x: 1, y: 1 } })
      await tabTo(page, 'Mute Lane 16')
      await expect(page.getByRole('button', { name: 'Mute Lane 16' })).toBeFocused()
      await expectFocusedElementVisible(page, '.tracker-lanes')
      const trackerAfterTab = await scrollMetrics(page, '.tracker-lanes')
      expect(trackerAfterTab.top).toBeGreaterThan(0)
      await page.screenshot({ path: resolve(EVIDENCE_DIR, 'tracker-keyboard-focus-reveal.png') })
      evidence.tracker = { afterWheel: trackerAfterWheel, afterTab: trackerAfterTab }

      const progress = page.getByRole('scrollbar', { name: 'Song Progress Bar' })
      await progress.focus()
      await page.keyboard.press('End')
      const timelineAtEnd = await scrollMetrics(page, '.tracker-lanes')
      expect(timelineAtEnd.left).toBeGreaterThan(0)
      expect(timelineAtEnd.left).toBeCloseTo(timelineAtEnd.maxLeft, 0)
      await page.keyboard.press('Home')
      const timelineAtHome = await scrollMetrics(page, '.tracker-lanes')
      expect(timelineAtHome.left).toBe(0)
      evidence.timeline = { atEnd: timelineAtEnd, atHome: timelineAtHome }

      await page.getByRole('tab', { name: 'Mixer', exact: true }).click()
      const mixer = page.locator('.mixer-strips')
      await mixer.focus()
      await page.keyboard.press('ArrowRight')
      const mixerAfterRight = await scrollMetrics(page, '.mixer-strips')
      expect(mixerAfterRight.left).toBe(80)
      await page.keyboard.press('ArrowLeft')
      const mixerAfterLeft = await scrollMetrics(page, '.mixer-strips')
      expect(mixerAfterLeft.left).toBe(0)

      await mixer.hover()
      await page.keyboard.down('Shift')
      await page.mouse.wheel(0, 240)
      await page.keyboard.up('Shift')
      await expect.poll(async () => (await scrollMetrics(page, '.mixer-strips')).left).toBeGreaterThan(0)
      const mixerAfterShiftWheel = await scrollMetrics(page, '.mixer-strips')

      await page.evaluate(() => {
        const mixerScrollport = document.querySelector('.mixer-strips')
        if (!(mixerScrollport instanceof HTMLElement)) throw new Error('Mixer scrollport is unavailable')
        mixerScrollport.scrollLeft = 0
      })
      await mixer.hover()
      await page.mouse.wheel(240, 0)
      await expect.poll(async () => (await scrollMetrics(page, '.mixer-strips')).left).toBeGreaterThan(0)
      const mixerAfterHorizontalWheel = await scrollMetrics(page, '.mixer-strips')

      await page.mouse.wheel(0, 240)
      await expect.poll(async () => (await scrollMetrics(page, '.mixer-strips')).left)
        .toBe(mixerAfterHorizontalWheel.left)
      const mixerAfterPlainWheel = await scrollMetrics(page, '.mixer-strips')
      expect(mixerAfterPlainWheel.left).toBe(mixerAfterHorizontalWheel.left)

      await page.evaluate(() => {
        const mixerScrollport = document.querySelector('.mixer-strips')
        if (!(mixerScrollport instanceof HTMLElement)) throw new Error('Mixer scrollport is unavailable')
        mixerScrollport.scrollLeft = 0
      })
      await mixer.focus()
      await tabTo(page, 'Edit parameters for FX 4')
      await expect(page.getByRole('button', { name: 'Edit parameters for FX 4' })).toBeFocused()
      await expectFocusedElementVisible(page, '.mixer-strips')
      const mixerAfterFocus = await scrollMetrics(page, '.mixer-strips')
      expect(mixerAfterFocus.left).toBeGreaterThan(0)
      await page.screenshot({ path: resolve(EVIDENCE_DIR, 'mixer-keyboard-focus-reveal.png') })
      evidence.mixer = {
        afterRight: mixerAfterRight,
        afterLeft: mixerAfterLeft,
        afterShiftWheel: mixerAfterShiftWheel,
        afterHorizontalWheel: mixerAfterHorizontalWheel,
        afterPlainWheel: mixerAfterPlainWheel,
        afterFocus: mixerAfterFocus
      }

      const rootOverflow = await page.evaluate(() => ({
        horizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        vertical: document.documentElement.scrollHeight > document.documentElement.clientHeight
      }))
      expect(rootOverflow).toEqual({ horizontal: false, vertical: false })
      evidence.rootOverflow = rootOverflow

      writeFileSync(resolve(EVIDENCE_DIR, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
    } finally {
      await launched.close()
    }
  })
})
