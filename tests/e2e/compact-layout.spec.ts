import { test, expect } from './fixtures'

const STRESS_THEMES = ['emerald', 'beton', 'mono', 'arcade']
const ALL_THEMES = [
  'emerald',
  'enterprise',
  'rave',
  'analog',
  'ide',
  'rust',
  'pa',
  'beton',
  'mono',
  'cosmic',
  'neon',
  'vintage',
  'rack',
  'soft',
  'riso',
  'arcade'
]
const LEGACY_BOTTOM_LAYOUT_KEY = 'mixjam:bottom-workspace-layout'
const BOTTOM_LAYOUT_KEY = 'mixjam:bottom-workspace-layout-v2'

async function settleLayout(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  })
}

test('Home stays root-overflow-free across desktop and narrow renderer sizes', async ({ seededPage: page }) => {
  for (const viewport of [
    {
      width: 1280,
      height: 720,
      expectedColumns: 4,
      expectInternalScroll: false
    },
    {
      width: 1280,
      height: 681,
      expectedColumns: 4,
      expectInternalScroll: false
    },
    {
      width: 900,
      height: 720,
      expectedColumns: 2,
      expectInternalScroll: true
    }
  ]) {
    await page.setViewportSize(viewport)

    for (const theme of ALL_THEMES) {
      await page.locator('.theme-selector').selectOption(theme)
      await settleLayout(page)

      const geometry = await page.evaluate(() => {
        const content = document.querySelector('.home-content')
        const hero = document.querySelector('.home-hero')
        const setup = document.querySelector('.home-setup')
        const recent = document.querySelector('.home-recent')
        const list = document.querySelector('.home-recent-list')
        const screen = document.querySelector('.home-screen')
        if (!(content instanceof HTMLElement) ||
          !(hero instanceof HTMLElement) ||
          !(setup instanceof HTMLElement) ||
          !(recent instanceof HTMLElement) ||
          !(list instanceof HTMLElement) ||
          !(screen instanceof HTMLElement)) {
          throw new Error('Home geometry elements are unavailable')
        }
        const contentBox = content.getBoundingClientRect()
        const heroBox = hero.getBoundingClientRect()
        const recentBox = recent.getBoundingClientRect()
        const items = [...list.querySelectorAll('.home-recent-item')]
        screen.scrollTop = 0
        const screenBoxAtStart = screen.getBoundingClientRect()
        const contentBoxAtStart = content.getBoundingClientRect()
        screen.scrollTop = screen.scrollHeight - screen.clientHeight
        const screenBoxAtEnd = screen.getBoundingClientRect()
        const contentBoxAtEnd = content.getBoundingClientRect()
        screen.scrollTop = 0
        return {
          recentInsideSetup: setup.contains(recent),
          contentLeft: contentBox.left,
          contentRight: contentBox.right,
          heroLeft: heroBox.left,
          heroRight: heroBox.right,
          recentLeft: recentBox.left,
          recentRight: recentBox.right,
          recentCount: items.length,
          recentRows: new Set(items.map((item) => Math.round(item.getBoundingClientRect().top))).size,
          gridColumns: getComputedStyle(list).gridTemplateColumns.split(' ').length,
          contentTopReachable: contentBoxAtStart.top >= screenBoxAtStart.top - 1,
          contentBottomReachable: contentBoxAtEnd.bottom <= screenBoxAtEnd.bottom + 1,
          rootClientWidth: document.documentElement.clientWidth,
          rootScrollWidth: document.documentElement.scrollWidth,
          rootClientHeight: document.documentElement.clientHeight,
          rootScrollHeight: document.documentElement.scrollHeight,
          screenClientHeight: screen.clientHeight,
          screenScrollHeight: screen.scrollHeight,
          screenOverflowY: getComputedStyle(screen).overflowY
        }
      })

      expect(geometry.recentInsideSetup).toBe(false)
      expect(Math.abs(geometry.heroLeft - geometry.recentLeft)).toBeLessThanOrEqual(1)
      expect(Math.abs(geometry.heroRight - geometry.recentRight)).toBeLessThanOrEqual(1)
      if (viewport.width > 900) {
        expect(geometry.recentRight).toBeLessThan(geometry.contentRight)
      } else {
        expect(Math.abs(geometry.contentLeft - geometry.recentLeft)).toBeLessThanOrEqual(1)
        expect(Math.abs(geometry.contentRight - geometry.recentRight)).toBeLessThanOrEqual(1)
      }
      expect(geometry.recentCount).toBe(4)
      expect(geometry.gridColumns).toBe(viewport.expectedColumns)
      expect(geometry.recentRows).toBe(viewport.width > 900 ? 1 : 2)
      expect(geometry.contentTopReachable).toBe(true)
      expect(geometry.contentBottomReachable).toBe(true)
      expect(geometry.rootScrollWidth).toBe(geometry.rootClientWidth)
      expect(geometry.rootScrollHeight).toBe(geometry.rootClientHeight)
      expect(geometry.screenOverflowY).toBe('auto')
      if (viewport.expectInternalScroll) {
        expect(geometry.screenScrollHeight).toBeGreaterThan(geometry.screenClientHeight)
      } else {
        expect(geometry.screenScrollHeight).toBeLessThanOrEqual(geometry.screenClientHeight + 1)
      }
    }
  }
})

test('compact Tracker fits all lanes and keeps shared geometry across themes', async ({ seededPage: page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.evaluate(({ legacyKey, currentKey }) => {
    localStorage.setItem(legacyKey, JSON.stringify({ upper: 40, bottom: 60 }))
    localStorage.removeItem(currentKey)
  }, { legacyKey: LEGACY_BOTTOM_LAYOUT_KEY, currentKey: BOTTOM_LAYOUT_KEY })
  await page.getByRole('button', { name: 'Start New MixJam' }).click()

  for (const theme of STRESS_THEMES) {
    await page.locator('.theme-selector').selectOption(theme)
    await settleLayout(page)

    const geometry = await page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)?.getBoundingClientRect()
      const player = document.querySelector('.player-view')
      const lanes = document.querySelector('.tracker-lanes')
      const laneBoxes = [...document.querySelectorAll('.tracker-lane')]
        .map((lane) => lane.getBoundingClientRect())
      const handle = document.querySelector('.bottom-workspace-resize')
      if (!(player instanceof HTMLElement) ||
        !(lanes instanceof HTMLElement) ||
        !(handle instanceof HTMLElement) ||
        laneBoxes.length !== 16) {
        throw new Error('Player geometry elements are unavailable')
      }
      const lanesBox = lanes.getBoundingClientRect()
      const playerBox = player.getBoundingClientRect()
      const handleBox = handle.getBoundingClientRect()
      const bottomBox = box('.bottom-workspace')
      const rootStyles = getComputedStyle(document.documentElement)
      return {
        laneCount: laneBoxes.length,
        laneHeights: [...new Set(laneBoxes.map((lane) => lane.height))],
        firstLaneTop: laneBoxes[0]?.top,
        lastLaneBottom: laneBoxes[15]?.bottom,
        lanesTop: lanesBox.top,
        lanesBottom: lanesBox.bottom,
        laneClientHeight: lanes.clientHeight,
        laneScrollHeight: lanes.scrollHeight,
        laneHeadWidth: box('.tracker-lane-head')?.width,
        laneControlWidth: box('.tracker-lane-mute')?.width,
        rulerHeight: box('.tracker-ruler')?.height,
        middleHeight: box('.middle-strip')?.height,
        bottomPercent: bottomBox
          ? bottomBox.height / (playerBox.height - handleBox.height) * 100
          : undefined,
        geometryScale: rootStyles.getPropertyValue('--tracker-geometry-scale').trim(),
        laneHeightToken: rootStyles.getPropertyValue('--tracker-lane-height').trim(),
        laneHeadToken: rootStyles.getPropertyValue('--tracker-lane-head-width').trim(),
        rulerToken: rootStyles.getPropertyValue('--tracker-ruler-height').trim(),
        controlToken: rootStyles.getPropertyValue('--tracker-lane-control-size').trim(),
        bubbleToken: rootStyles.getPropertyValue('--sample-bubble-height').trim(),
        rootClientWidth: document.documentElement.clientWidth,
        rootScrollWidth: document.documentElement.scrollWidth,
        rootClientHeight: document.documentElement.clientHeight,
        rootScrollHeight: document.documentElement.scrollHeight
      }
    })

    expect(geometry.laneCount).toBe(16)
    expect(geometry.laneHeights).toEqual([39])
    expect(geometry.firstLaneTop).toBeGreaterThanOrEqual(geometry.lanesTop - 1)
    expect(geometry.lastLaneBottom).toBeLessThanOrEqual(geometry.lanesBottom + 1)
    expect(geometry.laneScrollHeight).toBeLessThanOrEqual(geometry.laneClientHeight + 1)
    expect(geometry.laneHeadWidth).toBe(240)
    expect(geometry.laneControlWidth).toBe(32)
    expect(geometry.rulerHeight).toBe(33)
    expect(geometry.middleHeight).toBe(80)
    expect(geometry.bottomPercent).toBeGreaterThan(23)
    expect(geometry.bottomPercent).toBeLessThan(25)
    expect(geometry.geometryScale).toBe('0.75')
    expect(geometry.laneHeightToken).toBe('39px')
    expect(geometry.laneHeadToken).toBe('240px')
    expect(geometry.rulerToken).toBe('33px')
    expect(geometry.controlToken).toBe('32px')
    expect(geometry.bubbleToken).toBe('26px')
    expect(geometry.rootScrollWidth).toBe(geometry.rootClientWidth)
    expect(geometry.rootScrollHeight).toBe(geometry.rootClientHeight)
  }

  await expect.poll(async () => page.evaluate((key) => {
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored).bottom : null
  }, BOTTOM_LAYOUT_KEY)).toBeCloseTo(24, 0)
})

type ActivityState = 'idle' | 'syncing' | 'analyzing' | 'error'

async function setActivityState(
  page: import('@playwright/test').Page,
  state: ActivityState,
  jobId: string
) {
  await page.evaluate(({ nextState, activeJobId }) => {
    const controls = (window as unknown as {
      __mixjamE2EBackend: {
        emitScanProgress: (progress: unknown) => void
        emitScanDone: (done: unknown) => void
        emitAnalysisProgress: (progress: unknown) => void
        emitAnalysisDone: (identity: unknown) => void
      }
    }).__mixjamE2EBackend
    const identity = {
      rootKey: 'e2e-sample-folder',
      jobId: activeJobId,
      trigger: 'automatic'
    }

    if (nextState === 'syncing') {
      controls.emitScanProgress({
        identity,
        status: 'scanning',
        phase: 2,
        found: 85321,
        processed: 32145,
        total: 85321
      })
      return
    }
    if (nextState === 'analyzing') {
      controls.emitScanDone({ identity, lastCompletedAt: Date.now() })
      controls.emitAnalysisProgress({
        identity,
        status: 'analyzing',
        analyzed: 41234,
        total: 85321
      })
      return
    }
    if (nextState === 'error') {
      controls.emitScanProgress({
        identity,
        status: 'error',
        phase: 2,
        found: 85321,
        processed: 32145,
        total: 85321,
        error: 'A deliberately long library failure that must stay bounded inside the activity region.'
      })
      return
    }
    controls.emitAnalysisDone(identity)
  }, { nextState: state, activeJobId: jobId })

  if (state === 'syncing') {
    await expect(page.getByText('Updating library', { exact: true })).toBeVisible()
  } else if (state === 'analyzing') {
    await expect(page.getByText('Analyzing samples', { exact: true })).toBeVisible()
  } else if (state === 'error') {
    await expect(page.getByText('Library sync failed', { exact: true })).toBeVisible()
  } else {
    await expect(page.locator('.strip-activity')).toHaveCount(0)
  }
  await settleLayout(page)
}

const MIDDLE_STRIP_VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 }
]
const MIDDLE_STRIP_ACTIVITY_STATES: ActivityState[] = ['syncing', 'analyzing', 'idle', 'error']

for (const viewport of MIDDLE_STRIP_VIEWPORTS) {
  for (const activityState of MIDDLE_STRIP_ACTIVITY_STATES) {
    test(`Middle Strip stays centered at ${viewport.width}px while ${activityState}`, async ({
      seededPage: page
    }) => {
      await page.setViewportSize(viewport)
      await page.getByRole('button', { name: 'Start New MixJam' }).click()
      const activityJobId = `middle-strip-${viewport.width}-${activityState}`
      if (activityState !== 'syncing') {
        await setActivityState(page, 'syncing', activityJobId)
      }
      await setActivityState(page, activityState, activityJobId)

      for (const theme of ALL_THEMES) {
        await page.locator('.theme-selector').selectOption(theme)
        await page.locator('.strip-project-name').evaluate((element) => {
          element.textContent = 'A deliberately long MixJam project name that must truncate cleanly'
        })
        await settleLayout(page)

        const geometry = await page.evaluate(() => {
          const strip = document.querySelector('.middle-strip')
          const progress = document.querySelector('.middle-strip > .song-progress-bar')
          const main = document.querySelector('.middle-strip-main')
          const dock = document.querySelector('.strip-command-dock')
          const transport = document.querySelector('.transport-ribbon')
          const targets = [...document.querySelectorAll(
            '.strip-project-trigger, .strip-command-button, .strip-search-field, .strip-activity, .strip-more-trigger'
          )]
          if (!(strip instanceof HTMLElement) ||
            !(progress instanceof HTMLElement) ||
            !(main instanceof HTMLElement) ||
            !(dock instanceof HTMLElement) ||
            !(transport instanceof HTMLElement)) {
            throw new Error('Middle Strip geometry elements are unavailable')
          }

          const stripBox = strip.getBoundingClientRect()
          const dockBox = dock.getBoundingClientRect()
          const targetBoxes = targets.map((target) => {
            const rect = target.getBoundingClientRect()
            const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
            return {
              className: target.className,
              left: rect.left,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
              centerHitsTarget: hit !== null && (target === hit || target.contains(hit))
            }
          })
          const intersections: string[] = []
          for (let leftIndex = 0; leftIndex < targetBoxes.length; leftIndex += 1) {
            for (let rightIndex = leftIndex + 1; rightIndex < targetBoxes.length; rightIndex += 1) {
              const left = targetBoxes[leftIndex]!
              const right = targetBoxes[rightIndex]!
              const xOverlap = Math.min(left.right, right.right) - Math.max(left.left, right.left)
              const yOverlap = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top)
              if (xOverlap > 0.5 && yOverlap > 0.5) {
                intersections.push(`${left.className} intersects ${right.className}`)
              }
            }
          }

          return {
            stripHeight: stripBox.height,
            progressHeight: progress.getBoundingClientRect().height,
            mainHeight: main.getBoundingClientRect().height,
            dockCenterDelta: Math.abs(
              (dockBox.left + dockBox.width / 2) - (stripBox.left + stripBox.width / 2)
            ),
            targetsInside: targetBoxes.every((box) =>
              box.left >= stripBox.left - 1 &&
              box.right <= stripBox.right + 1 &&
              box.top >= stripBox.top - 1 &&
              box.bottom <= stripBox.bottom + 1
            ),
            centersHit: targetBoxes.every((box) => box.centerHitsTarget),
            intersections,
            transportButtons: transport.querySelectorAll('button').length,
            primaryCommands: strip.querySelectorAll('.strip-command-primary').length,
            uniformRescanText: strip.textContent?.includes('Uniform Re-scan') ?? false
          }
        })

        expect(geometry.stripHeight).toBe(80)
        expect(geometry.progressHeight).toBe(28)
        expect(geometry.mainHeight).toBe(48)
        expect(geometry.dockCenterDelta).toBeLessThanOrEqual(1)
        expect(geometry.targetsInside).toBe(true)
        expect(geometry.centersHit).toBe(true)
        expect(geometry.intersections).toEqual([])
        expect(geometry.transportButtons).toBe(4)
        expect(geometry.primaryCommands).toBe(1)
        expect(geometry.uniformRescanText).toBe(false)
      }
    })
  }
}

test('Middle Strip menus keep their labels and dialog layering', async ({ seededPage: page }) => {
  await page.getByRole('button', { name: 'Start New MixJam' }).click()
  await page.getByRole('button', { name: 'More actions' }).click()
  await expect(page.getByRole('menuitem', { name: 'Re-scan Sample Folder' })).toHaveCount(1)
  await expect(page.getByText('Uniform Re-scan', { exact: true })).toHaveCount(0)
  await page.getByRole('menuitem', { name: 'Keyboard Shortcuts' }).click()

  const dialogLayers = await page.evaluate(() => {
    const overlay = document.querySelector('.mixjam-dialog-overlay')
    const panel = document.querySelector('.mixjam-dialog-content')
    if (!(overlay instanceof HTMLElement) || !(panel instanceof HTMLElement)) {
      throw new Error('Shortcuts dialog is unavailable')
    }
    const rect = panel.getBoundingClientRect()
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    return {
      overlayLayer: Number(getComputedStyle(overlay).zIndex),
      panelLayer: Number(getComputedStyle(panel).zIndex),
      backdropFilter: getComputedStyle(overlay).backdropFilter,
      panelCenterHitsPanel: hit !== null && (hit === panel || panel.contains(hit)),
      visibleTooltipCount: [...document.querySelectorAll('.mixjam-tooltip-content')]
        .filter((element) => getComputedStyle(element).visibility !== 'hidden').length
    }
  })

  expect(dialogLayers.panelLayer).toBeGreaterThan(dialogLayers.overlayLayer)
  expect(dialogLayers.backdropFilter).toBe('none')
  expect(dialogLayers.panelCenterHitsPanel).toBe(true)
  expect(dialogLayers.visibleTooltipCount).toBe(0)
})

test('versioned Bottom Workspace layout resets once and then preserves manual resizing', async ({ seededPage: page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.evaluate(({ legacyKey, currentKey }) => {
    localStorage.setItem(legacyKey, JSON.stringify({ upper: 40, bottom: 60 }))
    localStorage.removeItem(currentKey)
  }, { legacyKey: LEGACY_BOTTOM_LAYOUT_KEY, currentKey: BOTTOM_LAYOUT_KEY })
  await page.getByRole('button', { name: 'Start New MixJam' }).click()

  await expect.poll(async () => page.evaluate((key) => {
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored).bottom : null
  }, BOTTOM_LAYOUT_KEY)).toBeCloseTo(24, 0)

  const handle = page.getByRole('separator', { name: 'Resize bottom workspace' })
  const handleBox = await handle.boundingBox()
  if (!handleBox) throw new Error('Bottom Workspace resize handle is unavailable')
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y - 100, { steps: 8 })
  await page.mouse.up()

  await expect.poll(async () => page.evaluate((key) => {
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored).bottom : null
  }, BOTTOM_LAYOUT_KEY)).toBeGreaterThan(30)

  const persistedBottom = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').bottom, BOTTOM_LAYOUT_KEY)
  await page.reload()
  await page.getByRole('button', { name: 'Start New MixJam' }).click()
  await expect.poll(async () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').bottom, BOTTOM_LAYOUT_KEY))
    .toBeCloseTo(persistedBottom, 0)
})
