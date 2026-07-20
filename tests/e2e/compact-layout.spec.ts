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
// Footer zoom buttons show percentage labels; the underlying UI Size values
// remain 30/40/50.
const UI_SIZE_BUTTON_LABELS: Record<number, string> = { 30: '75%', 40: '100%', 50: '125%' }
const UI_SIZE_SUPPORTING_FONT: Record<number, string> = { 30: '10px', 40: '13px', 50: '17px' }

async function settleLayout(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  })
}

test('a viewport below 1920x1080 shows only the refusal screen', async ({ seededPage: page }) => {
  for (const viewport of [
    { width: 1919, height: 1080 },
    { width: 1920, height: 1079 }
  ]) {
    await page.setViewportSize(viewport)

    await expect(page.getByRole('alert')).toContainText('Display resolution not supported')
    await expect(page.getByRole('alert')).toContainText(
      `Current viewport: ${viewport.width} × ${viewport.height} pixels.`
    )
    await expect(page.getByRole('button', { name: 'Start New MixJam' })).toHaveCount(0)
    await expect(page.locator('.app')).toHaveCount(0)
  }

  await page.setViewportSize({ width: 1920, height: 1080 })
  await expect(page.getByRole('button', { name: 'Start New MixJam' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('Home stays root-overflow-free at the supported renderer size', async ({ seededPage: page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })

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
    expect(geometry.recentRight).toBeLessThan(geometry.contentRight)
    expect(geometry.recentCount).toBe(4)
    expect(geometry.gridColumns).toBe(4)
    expect(geometry.recentRows).toBe(1)
    expect(geometry.contentTopReachable).toBe(true)
    expect(geometry.contentBottomReachable).toBe(true)
    expect(geometry.rootScrollWidth).toBe(geometry.rootClientWidth)
    expect(geometry.rootScrollHeight).toBe(geometry.rootClientHeight)
    expect(geometry.screenOverflowY).toBe('hidden')
    expect(geometry.screenScrollHeight).toBeLessThanOrEqual(geometry.screenClientHeight + 1)
  }
})

test('Home uses both desktop columns while library analysis is active', async ({ seededPage: page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await setActivityState(page, 'analyzing', 'home-active-analysis')

  for (const theme of ALL_THEMES) {
    await page.locator('.theme-selector').selectOption(theme)
    await settleLayout(page)

    const geometry = await page.evaluate(() => {
      const screen = document.querySelector('.home-screen')
      const content = document.querySelector('.home-content')
      const setup = document.querySelector('.home-setup')
      const folderGrid = document.querySelector('.home-folder-grid')
      const actionRow = document.querySelector('.home-project-action-row')
      const libraryStatus = document.querySelector('.home-library-status')
      const generateButton = document.querySelector('.home-generator-card .btn-secondary')
      if (!(screen instanceof HTMLElement) ||
        !(content instanceof HTMLElement) ||
        !(setup instanceof HTMLElement) ||
        !(folderGrid instanceof HTMLElement) ||
        !(actionRow instanceof HTMLElement) ||
        !(libraryStatus instanceof HTMLElement) ||
        !(generateButton instanceof HTMLButtonElement)) {
        throw new Error('Home geometry elements are unavailable')
      }
      const screenBox = screen.getBoundingClientRect()
      const contentBox = content.getBoundingClientRect()
      const cards = [...setup.querySelectorAll(':scope > .home-workflow-card')]
        .filter((card): card is HTMLElement => card instanceof HTMLElement)
      const actionButtons = [...actionRow.querySelectorAll('button')]
        .filter((button): button is HTMLButtonElement => button instanceof HTMLButtonElement)
      const actionWidths = actionButtons.map((button) => button.getBoundingClientRect().width)
      return {
        rootClientWidth: document.documentElement.clientWidth,
        rootScrollWidth: document.documentElement.scrollWidth,
        rootClientHeight: document.documentElement.clientHeight,
        rootScrollHeight: document.documentElement.scrollHeight,
        screenClientHeight: screen.clientHeight,
        screenScrollHeight: screen.scrollHeight,
        screenOverflowY: getComputedStyle(screen).overflowY,
        setupDirection: getComputedStyle(setup).flexDirection,
        folderColumns: getComputedStyle(folderGrid).gridTemplateColumns.split(' ').length,
        cardCount: cards.length,
        cardsDoNotOverlap: cards.every((card, index) => index === 0 ||
          cards[index - 1]!.getBoundingClientRect().bottom <= card.getBoundingClientRect().top),
        actionWidthRatio: actionWidths.length === 2 ? actionWidths[0]! / actionWidths[1]! : 0,
        scannerInsideFolder: libraryStatus.closest('.folder-card') !== null,
        generateDisabled: generateButton.disabled,
        generateDescription: generateButton.getAttribute('aria-describedby'),
        contentInsideScreen:
          contentBox.top >= screenBox.top - 1 &&
          contentBox.bottom <= screenBox.bottom + 1
      }
    })

    expect(geometry.rootScrollWidth).toBe(geometry.rootClientWidth)
    expect(geometry.rootScrollHeight).toBe(geometry.rootClientHeight)
    expect(geometry.screenScrollHeight).toBeLessThanOrEqual(geometry.screenClientHeight + 1)
    expect(geometry.screenOverflowY).toBe('hidden')
    expect(geometry.setupDirection).toBe('column')
    expect(geometry.folderColumns).toBe(2)
    expect(geometry.cardCount).toBe(3)
    expect(geometry.cardsDoNotOverlap).toBe(true)
    expect(geometry.actionWidthRatio).toBeGreaterThan(1.9)
    expect(geometry.actionWidthRatio).toBeLessThan(2.1)
    expect(geometry.scannerInsideFolder).toBe(false)
    expect(geometry.generateDisabled).toBe(true)
    expect(geometry.generateDescription).toBe('home-generator-status')
    expect(geometry.contentInsideScreen).toBe(true)
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
        laneBoxes.length !== 8) {
        throw new Error('Player geometry elements are unavailable')
      }
      const lanesBox = lanes.getBoundingClientRect()
      const playerBox = player.getBoundingClientRect()
      const handleBox = handle.getBoundingClientRect()
      const bottomBox = box('.bottom-workspace')
      const app = document.querySelector('.app')
      if (!(app instanceof HTMLElement)) throw new Error('App root is unavailable')
      const appStyles = getComputedStyle(app)
      return {
        laneCount: laneBoxes.length,
        laneHeights: [...new Set(laneBoxes.map((lane) => lane.height))],
        firstLaneTop: laneBoxes[0]?.top,
        lastLaneBottom: laneBoxes[7]?.bottom,
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
        geometryScale: appStyles.getPropertyValue('--tracker-geometry-scale').trim(),
        laneHeightToken: appStyles.getPropertyValue('--ui-lane-height').trim(),
        laneHeadToken: appStyles.getPropertyValue('--tracker-lane-head-width').trim(),
        rulerToken: appStyles.getPropertyValue('--tracker-ruler-height').trim(),
        controlToken: appStyles.getPropertyValue('--ui-size').trim(),
        bubbleToken: appStyles.getPropertyValue('--sample-bubble-height').trim(),
        rootClientWidth: document.documentElement.clientWidth,
        rootScrollWidth: document.documentElement.scrollWidth,
        rootClientHeight: document.documentElement.clientHeight,
        rootScrollHeight: document.documentElement.scrollHeight
      }
    })

    expect(geometry.laneCount).toBe(8)
    expect(geometry.laneHeights).toEqual([49])
    expect(geometry.firstLaneTop).toBeGreaterThanOrEqual(geometry.lanesTop - 1)
    expect(geometry.lastLaneBottom).toBeLessThanOrEqual(geometry.lanesBottom + 1)
    expect(geometry.laneScrollHeight).toBeLessThanOrEqual(geometry.laneClientHeight + 1)
    expect(geometry.laneHeadWidth).toBe(240)
    expect(geometry.laneControlWidth).toBe(40)
    expect(geometry.rulerHeight).toBe(33)
    expect(geometry.middleHeight).toBe(107)
    expect(geometry.bottomPercent).toBeGreaterThan(23)
    expect(geometry.bottomPercent).toBeLessThan(25)
    expect(geometry.geometryScale).toBe('0.75')
    expect(geometry.laneHeightToken).toBe('49px')
    expect(geometry.laneHeadToken).toBe('240px')
    expect(geometry.rulerToken).toBe('33px')
    expect(geometry.controlToken).toBe('40px')
    expect(geometry.bubbleToken).toBe('33px')
    expect(geometry.rootScrollWidth).toBe(geometry.rootClientWidth)
    expect(geometry.rootScrollHeight).toBe(geometry.rootClientHeight)
  }

  await expect.poll(async () => page.evaluate((key) => {
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored).bottom : null
  }, BOTTOM_LAYOUT_KEY)).toBeCloseTo(24, 0)
})

test('UI Size scales controls across the app without breaking the 1080p frame', async ({ seededPage: page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })

  const auditVisibleControls = async (size: number, surface: string) => {
    const audit = await page.evaluate(({ expectedSize, surfaceName }) => {
      const isVisible = (element: Element): element is HTMLElement => {
        if (!(element instanceof HTMLElement)) return false
        const box = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
      }
      const controls = [...document.querySelectorAll(
        'button, select, input:not([type="range"]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), [role="button"], [role="tab"], [role="menuitem"]'
      )].filter(isVisible)
      const undersized = controls.flatMap((control) => {
        const box = control.getBoundingClientRect()
        return box.height + 0.5 < expectedSize
          ? [`${control.tagName}.${control.className}: ${box.width}x${box.height}`]
          : []
      })
      const exactSquares = [...document.querySelectorAll(
        '.footer-ui-size button, .home-theme-swatch, .strip-command-button, .strip-more-trigger, ' +
        '.tracker-lane-controls button, .master-loudness-reset, .mixer-restore, ' +
        '.mixer-channel-remove, .mixer-channel-pan, .manage-action'
      )].filter(isVisible)
      const incorrectSquares = exactSquares.flatMap((control) => {
        const box = control.getBoundingClientRect()
        return Math.abs(box.width - expectedSize) > 0.5 || Math.abs(box.height - expectedSize) > 0.5
          ? [`${control.className}: ${box.width}x${box.height}`]
          : []
      })
      const incorrectFaders = [...document.querySelectorAll('.vertical-fader-input')]
        .filter(isVisible)
        .flatMap((control) => {
          const width = control.getBoundingClientRect().width
          return Math.abs(width - expectedSize) > 0.5 ? [`${control.className}: ${width}`] : []
        })
      const root = document.documentElement
      return {
        surfaceName,
        preset: root.dataset.uiSize,
        token: getComputedStyle(root).getPropertyValue('--ui-size').trim(),
        controlCount: controls.length,
        undersized,
        incorrectSquares,
        incorrectFaders,
        horizontalOverflow: root.scrollWidth > root.clientWidth,
        verticalOverflow: root.scrollHeight > root.clientHeight
      }
    }, { expectedSize: size, surfaceName: surface })

    expect(audit.preset, `${surface} preset`).toBe(String(size))
    expect(audit.token, `${surface} token`).toBe(`${size}px`)
    expect(audit.controlCount, `${surface} controls`).toBeGreaterThan(0)
    expect(audit.undersized, `${surface} undersized controls`).toEqual([])
    expect(audit.incorrectSquares, `${surface} square controls`).toEqual([])
    expect(audit.incorrectFaders, `${surface} vertical faders`).toEqual([])
    expect(audit.horizontalOverflow, `${surface} horizontal overflow`).toBe(false)
    expect(audit.verticalOverflow, `${surface} vertical overflow`).toBe(false)
  }

  for (const size of [30, 40, 50]) {
    await page.getByRole('button', { name: UI_SIZE_BUTTON_LABELS[size], exact: true }).click()
    await settleLayout(page)
    await auditVisibleControls(size, `Home ${size}`)
  }

  await page.getByRole('button', { name: 'Start New MixJam' }).click()
  await page.getByRole('tab', { name: 'Mixer' }).click()
  await page.getByRole('button', { name: 'FX 1 Empty', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Delay...' }).click()
  await page.getByRole('dialog', { name: 'Delay' }).getByRole('button', { name: 'OK' }).click()
  await page.getByRole('tab', { name: 'Song', exact: true }).click()
  for (const size of [30, 40, 50]) {
    await page.getByRole('button', { name: UI_SIZE_BUTTON_LABELS[size], exact: true }).click()
    await settleLayout(page)
    await auditVisibleControls(size, `Player Song ${size}`)

    await page.getByRole('tab', { name: 'Mixer' }).click()
    await settleLayout(page)
    await auditVisibleControls(size, `Player Mixer ${size}`)
    const mixerFit = await page.evaluate(() => {
      const scrollport = document.querySelector('.mixer-strips')
      if (!(scrollport instanceof HTMLElement)) throw new Error('Mixer scrollport is unavailable')
      const port = scrollport.getBoundingClientRect()
      const children = [...scrollport.querySelectorAll(':scope > .mixer-strips-row > *')]
      const controls = [...scrollport.querySelectorAll<HTMLElement>(
        '.mixer-channel-strip button, .mixer-channel-strip [role="slider"], .mixer-fx-card button, .mixer-fx-card [role="slider"]'
      )]
        .filter((control) => {
          const box = control.getBoundingClientRect()
          const style = getComputedStyle(control)
          return box.width > 0 && box.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
        })
      const controlIntersections: string[] = []
      for (let leftIndex = 0; leftIndex < controls.length; leftIndex += 1) {
        const left = controls[leftIndex]!
        const leftBox = left.getBoundingClientRect()
        for (let rightIndex = leftIndex + 1; rightIndex < controls.length; rightIndex += 1) {
          const right = controls[rightIndex]!
          if (left.contains(right) || right.contains(left)) continue
          const rightBox = right.getBoundingClientRect()
          const xOverlap = Math.min(leftBox.right, rightBox.right) - Math.max(leftBox.left, rightBox.left)
          const yOverlap = Math.min(leftBox.bottom, rightBox.bottom) - Math.max(leftBox.top, rightBox.top)
          if (xOverlap > 0.5 && yOverlap > 0.5) {
            const leftName = left.getAttribute('aria-label') ?? left.className
            const rightName = right.getAttribute('aria-label') ?? right.className
            controlIntersections.push(`${leftName} intersects ${rightName}`)
          }
        }
      }
      const dialOverflow = [...scrollport.querySelectorAll<SVGElement>('.rotary-dial')]
        .flatMap((dial) => {
          const control = dial.closest<HTMLElement>('[role="slider"]')
          if (!control) return ['Rotary dial has no slider owner']
          const dialBox = dial.getBoundingClientRect()
          const controlBox = control.getBoundingClientRect()
          const contained = dialBox.left >= controlBox.left - 0.5
            && dialBox.right <= controlBox.right + 0.5
            && dialBox.top >= controlBox.top - 0.5
            && dialBox.bottom <= controlBox.bottom + 0.5
          return contained
            ? []
            : [`${control.getAttribute('aria-label') ?? control.className}: ${dialBox.width}x${dialBox.height} dial exceeds ${controlBox.width}x${controlBox.height} control`]
        })
      return {
        workspaceHeight: document.querySelector('.bottom-workspace')?.getBoundingClientRect().height ?? 0,
        supportingFontSizes: [...new Set(
          [...scrollport.querySelectorAll<HTMLElement>('.mixer-fx-summary')]
            .map((element) => getComputedStyle(element).fontSize)
        )],
        verticalContentFits: children.every((child) => child.getBoundingClientRect().bottom <= port.bottom + 1),
        controlIntersections,
        dialOverflow,
        rootVerticalOverflow: document.documentElement.scrollHeight > document.documentElement.clientHeight
      }
    })
    expect(mixerFit.workspaceHeight, `Player Mixer ${size} workspace height`).toBeGreaterThan(0)
    expect(mixerFit.supportingFontSizes, `Player Mixer ${size} supporting font`).toEqual([UI_SIZE_SUPPORTING_FONT[size]])
    expect(mixerFit.verticalContentFits, `Player Mixer ${size} vertical fit`).toBe(true)
    expect(mixerFit.controlIntersections, `Player Mixer ${size} control intersections`).toEqual([])
    expect(mixerFit.dialOverflow, `Player Mixer ${size} rotary dial containment`).toEqual([])
    expect(mixerFit.rootVerticalOverflow, `Player Mixer ${size} root overflow`).toBe(false)

    await page.getByRole('tab', { name: 'Samples' }).click()
    await settleLayout(page)
    await auditVisibleControls(size, `Player Samples ${size}`)

    await page.locator('.strip-more-trigger').click()
    await expect(page.locator('[role="menu"]')).toBeVisible()
    await auditVisibleControls(size, `Player menu ${size}`)
    await page.keyboard.press('Escape')
  }
})

test('Mixer and Tracker stay reachable with 1, 8, and 64 lanes at every UI Size', async ({ seededPage: page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.getByRole('button', { name: 'Start New MixJam' }).click()

  const addLanes = async (count: number) => {
    await page.getByRole('tab', { name: 'Song', exact: true }).click()
    const addLane = page.getByRole('button', { name: 'Add lane' })
    for (let index = 0; index < count; index += 1) await addLane.click()
  }

  const auditCount = async (expectedLaneCount: number) => {
    for (const size of [30, 40, 50]) {
      await page.getByRole('button', { name: UI_SIZE_BUTTON_LABELS[size], exact: true }).click()
      await page.getByRole('tab', { name: 'Song', exact: true }).click()
      await settleLayout(page)

      const tracker = await page.evaluate(() => {
        const scrollport = document.querySelector('.tracker-lanes')
        const ruler = document.querySelector('.tracker-ruler')
        const firstLane = document.querySelector('.tracker-lane')
        if (!(scrollport instanceof HTMLElement) ||
          !(ruler instanceof HTMLElement) ||
          !(firstLane instanceof HTMLElement)) {
          throw new Error('Tracker geometry is unavailable')
        }
        scrollport.scrollTop = 0
        const port = scrollport.getBoundingClientRect()
        const rulerBox = ruler.getBoundingClientRect()
        const laneBox = firstLane.getBoundingClientRect()
        return {
          laneCount: document.querySelectorAll('.tracker-lane').length,
          rulerVisible: rulerBox.width > 0 && rulerBox.height > 0,
          completeFirstLane: laneBox.top >= port.top - 1 && laneBox.bottom <= port.bottom + 1,
          rootHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          rootVerticalOverflow: document.documentElement.scrollHeight > document.documentElement.clientHeight
        }
      })
      expect(tracker.laneCount, `Tracker lane count at UI Size ${size}`).toBe(expectedLaneCount)
      expect(tracker.rulerVisible, `Tracker ruler at ${expectedLaneCount} lanes / UI Size ${size}`).toBe(true)
      expect(tracker.completeFirstLane, `Tracker lane at ${expectedLaneCount} lanes / UI Size ${size}`).toBe(true)
      expect(tracker.rootHorizontalOverflow, `Tracker horizontal root overflow at ${expectedLaneCount} lanes / UI Size ${size}`).toBe(false)
      expect(tracker.rootVerticalOverflow, `Tracker vertical root overflow at ${expectedLaneCount} lanes / UI Size ${size}`).toBe(false)

      await page.getByRole('tab', { name: 'Mixer', exact: true }).click()
      await settleLayout(page)
      const mixer = await page.evaluate(() => {
        const scrollport = document.querySelector('.mixer-strips')
        const laneStrips = [...document.querySelectorAll('.mixer-channel-strip')]
        const fxCards = [...document.querySelectorAll('.mixer-fx-card')]
        const fx4 = fxCards[3]
        if (!(scrollport instanceof HTMLElement) ||
          !(fx4 instanceof HTMLElement)) {
          throw new Error('Mixer geometry is unavailable')
        }

        const targets = [...laneStrips, ...fxCards]
        scrollport.scrollLeft = 0
        const initialPort = scrollport.getBoundingClientRect()
        const reachable = targets.every((target) => {
          const box = target.getBoundingClientRect()
          const contentLeft = box.left - initialPort.left
          const contentRight = contentLeft + box.width
          return box.width <= scrollport.clientWidth + 1 &&
            contentLeft >= -1 && contentRight <= scrollport.scrollWidth + 1
        })
        scrollport.scrollLeft = scrollport.scrollWidth
        const endPort = scrollport.getBoundingClientRect()
        const fx4AtEnd = fx4.getBoundingClientRect()
        const endReachable = fx4AtEnd.left >= endPort.left - 1 && fx4AtEnd.right <= endPort.right + 1
        const port = scrollport.getBoundingClientRect()
        const verticallyFits = targets.every((target) => {
          const box = target.getBoundingClientRect()
          return box.top >= port.top - 1 && box.bottom <= port.bottom + 1
        })
        return {
          laneCount: laneStrips.length,
          reachable,
          endReachable,
          verticallyFits,
          verticalOverflowExposed: getComputedStyle(scrollport).overflowY !== 'hidden' &&
            scrollport.scrollHeight > scrollport.clientHeight + 1,
          rootHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          rootVerticalOverflow: document.documentElement.scrollHeight > document.documentElement.clientHeight
        }
      })
      expect(mixer.laneCount, `Mixer lane count at UI Size ${size}`).toBe(expectedLaneCount)
      expect(mixer.reachable, `Mixer reachability at ${expectedLaneCount} lanes / UI Size ${size}`).toBe(true)
      expect(mixer.endReachable, `Mixer FX 4 reachability at ${expectedLaneCount} lanes / UI Size ${size}`).toBe(true)
      expect(mixer.verticallyFits, `Mixer vertical fit at ${expectedLaneCount} lanes / UI Size ${size}`).toBe(true)
      expect(mixer.verticalOverflowExposed, `Mixer vertical overflow at ${expectedLaneCount} lanes / UI Size ${size}`).toBe(false)
      expect(mixer.rootHorizontalOverflow, `Mixer horizontal root overflow at ${expectedLaneCount} lanes / UI Size ${size}`).toBe(false)
      expect(mixer.rootVerticalOverflow, `Mixer vertical root overflow at ${expectedLaneCount} lanes / UI Size ${size}`).toBe(false)
    }
  }

  await page.getByRole('button', { name: /Delete \d+ empty lanes/ }).click()
  await auditCount(1)
  await addLanes(7)
  await auditCount(8)
  await addLanes(56)
  await auditCount(64)
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

        expect(geometry.stripHeight).toBe(107)
        expect(geometry.progressHeight).toBe(37)
        expect(geometry.mainHeight).toBe(64)
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
