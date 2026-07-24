import { test, expect } from './fixtures'
import { setZoomLevelAndClose } from './settings-helpers'

const UI_SIZE_BUTTON_LABELS: Record<number, string> = { 30: '75%', 40: '100%', 50: '125%' }
const BOTTOM_WORKSPACE_MINIMUM_HEIGHTS = {
  30: { master: 546, mixer: 340, samples: 136 },
  40: { master: 590, mixer: 449, samples: 183 },
  50: { master: 628, mixer: 557, samples: 225 }
} as const

async function settleLayout(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  })
}

test('each Bottom Workspace tab keeps its content inside the active minimum height', async ({ seededPage: page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.getByRole('button', { name: 'Start New MixJam' }).click()

  const shrinkToFloorWithKeyboard = async () => {
    const handle = page.getByRole('separator', { name: 'Resize bottom workspace' })
    await handle.focus()
    await handle.press('End')
    await settleLayout(page)
  }

  const auditActivePanel = async (tab: 'master' | 'mixer' | 'samples', minimumHeight: number) => {
    const audit = await page.evaluate(({ activeTab, expectedMinimum }) => {
      const workspace = document.querySelector('.bottom-workspace')
      const panel = document.querySelector(`[data-panel-name="${activeTab}"]`)
      if (!(workspace instanceof HTMLElement) || !(panel instanceof HTMLElement)) {
        throw new Error(`Missing ${activeTab} Bottom Workspace panel`)
      }
      const panelBox = panel.getBoundingClientRect()
      const workspaceBox = workspace.getBoundingClientRect()
      const upper = document.querySelector('.upper-middle-work')
      const separator = document.querySelector('[aria-label="Resize bottom workspace"]')
      if (!(upper instanceof HTMLElement) || !(separator instanceof HTMLElement)) {
        throw new Error('Bottom Workspace split geometry is unavailable')
      }
      const upperBox = upper.getBoundingClientRect()
      const isVisible = (element: Element): element is HTMLElement => {
        if (!(element instanceof HTMLElement)) return false
        const box = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        if (box.width <= 0 || box.height <= 0 || style.display === 'none' || style.visibility === 'hidden') {
          return false
        }
        let visibleTop = box.top
        let visibleBottom = box.bottom
        let ancestor = element.parentElement
        while (ancestor && ancestor !== panel.parentElement) {
          const ancestorStyle = getComputedStyle(ancestor)
          if (ancestorStyle.overflowY !== 'visible') {
            const ancestorBox = ancestor.getBoundingClientRect()
            visibleTop = Math.max(visibleTop, ancestorBox.top)
            visibleBottom = Math.min(visibleBottom, ancestorBox.bottom)
          }
          ancestor = ancestor.parentElement
        }
        return visibleBottom - visibleTop > 0.5
      }
      const protectedElements = activeTab === 'samples'
        ? [...panel.querySelectorAll('.cat-manage-btn, .subcats-row button')].filter(isVisible)
        : [...panel.querySelectorAll(
            'button, input, select, [role="slider"], [role="meter"], ' +
            '.vertical-control-endpoint, .mixer-channel-db'
          )].filter(isVisible)
      const verticalEscapes = protectedElements.flatMap((element) => {
        const box = element.getBoundingClientRect()
        const name = element.getAttribute('aria-label') || element.className || element.tagName
        return box.top < panelBox.top - 1 || box.bottom > panelBox.bottom + 1
          ? [`${name}: ${box.top}-${box.bottom} outside ${panelBox.top}-${panelBox.bottom}`]
          : []
      })
      const cards = [...panel.querySelectorAll(
        '.master-controls-module, .mixer-channel-strip, .mixer-fx-card'
      )].filter(isVisible)
      const cardEscapes = cards.flatMap((card) => {
        const box = card.getBoundingClientRect()
        return box.top < panelBox.top - 1 || box.bottom > panelBox.bottom + 1
          ? [`${card.className}: ${box.top}-${box.bottom} outside panel`]
          : []
      })
      const cardChildEscapes = protectedElements.flatMap((element) => {
        const card = element.closest('.master-controls-module, .mixer-channel-strip, .mixer-fx-card')
        if (!(card instanceof HTMLElement)) return []
        const box = element.getBoundingClientRect()
        const cardBox = card.getBoundingClientRect()
        const name = element.getAttribute('aria-label') || element.className || element.tagName
        return box.top < cardBox.top - 1 || box.bottom > cardBox.bottom + 1
          ? [`${name}: ${box.top}-${box.bottom} outside ${card.className}`]
          : []
      })
      const sampleShells = activeTab === 'samples'
        ? [...panel.querySelectorAll(
            '.browser-region, .cats, .tiles-section, .subcats-row, .category-tree, .tiles'
          )].filter(isVisible)
        : []
      const sampleShellEscapes = sampleShells.flatMap((element) => {
        const box = element.getBoundingClientRect()
        return box.top < panelBox.top - 1 || box.bottom > panelBox.bottom + 1
          ? [`${element.className}: ${box.top}-${box.bottom} outside panel`]
          : []
      })
      const sampleNestedControls = activeTab === 'samples'
        ? [...panel.querySelectorAll(
            '.category-tree .sample-bubble-hit-target, .tiles .sample-bubble-hit-target'
          )].filter(isVisible)
        : []
      const sampleNestedEscapes = sampleNestedControls.flatMap((element) => {
        const scrollport = element.closest('.category-tree, .tiles')
        if (!(scrollport instanceof HTMLElement)) return [`${element.className}: missing scrollport`]
        const box = element.getBoundingClientRect()
        const port = scrollport.getBoundingClientRect()
        const visibleTop = Math.max(box.top, port.top)
        const visibleBottom = Math.min(box.bottom, port.bottom)
        return visibleTop < panelBox.top - 1 || visibleBottom > panelBox.bottom + 1
          ? [`${element.className}: visible segment outside panel`]
          : []
      })
      const sampleControlCounts = activeTab === 'samples'
        ? {
            manage: panel.querySelectorAll('.cat-manage-btn').length,
            categories: panel.querySelectorAll('.category-tree .sample-bubble-hit-target').length,
            sort: panel.querySelectorAll('.sort-btn').length,
            bubbles: panel.querySelectorAll('.tiles .sample-bubble-hit-target').length
          }
        : null
      const sampleScrollportOverflow = activeTab === 'samples'
        ? [...panel.querySelectorAll<HTMLElement>('.category-tree, .tiles')]
            .map((element) => getComputedStyle(element).overflowY)
        : []
      return {
        expectedMinimum,
        workspaceHeight: workspaceBox.height,
        samePanelBounds: Math.abs(panelBox.top - workspaceBox.top -
          document.querySelector('.bottom-workspace-tabs')!.getBoundingClientRect().height) <= 1 &&
          Math.abs(panelBox.bottom - workspaceBox.bottom) <= 1,
        verticalEscapes,
        cardEscapes,
        cardChildEscapes,
        sampleShellEscapes,
        sampleNestedEscapes,
        sampleControlCounts,
        sampleScrollportOverflow,
        panelOverflowY: getComputedStyle(panel).overflowY,
        fallbackScrolling: panel.scrollHeight > panel.clientHeight + 1,
        rootOverflow: document.documentElement.scrollHeight > document.documentElement.clientHeight,
        separatorAria: {
          now: Number(separator.getAttribute('aria-valuenow')),
          max: Number(separator.getAttribute('aria-valuemax')),
          expectedMax: upperBox.height / (upperBox.height + workspaceBox.height) * 100
        }
      }
    }, { activeTab: tab, expectedMinimum: minimumHeight })

    expect(audit.workspaceHeight, `${tab} minimum height`).toBeGreaterThanOrEqual(minimumHeight - 1)
    expect(audit.samePanelBounds, `${tab} panel bounds`).toBe(true)
    expect(audit.verticalEscapes, `${tab} workspace containment`).toEqual([])
    expect(audit.cardEscapes, `${tab} card containment`).toEqual([])
    expect(audit.cardChildEscapes, `${tab} card child containment`).toEqual([])
    expect(audit.sampleShellEscapes, `${tab} Sample Browser shells`).toEqual([])
    expect(audit.sampleNestedEscapes, `${tab} Sample Browser controls`).toEqual([])
    if (tab === 'samples') {
      expect(audit.sampleControlCounts?.manage).toBe(1)
      expect(audit.sampleControlCounts?.categories).toBeGreaterThan(0)
      expect(audit.sampleControlCounts?.sort).toBe(3)
      expect(audit.sampleControlCounts?.bubbles).toBeGreaterThan(0)
      expect(audit.sampleScrollportOverflow).toEqual(['auto', 'auto'])
    }
    expect(audit.panelOverflowY, `${tab} emergency overflow`).toBe('auto')
    expect(audit.fallbackScrolling, `${tab} normal-size fallback scroll`).toBe(false)
    expect(audit.rootOverflow, `${tab} root overflow`).toBe(false)
    expect(audit.separatorAria.now, `${tab} separator current value`).toBeCloseTo(audit.separatorAria.max, 2)
    expect(audit.separatorAria.max, `${tab} separator active bound`).toBeCloseTo(
      audit.separatorAria.expectedMax,
      1
    )
  }

  for (const size of [30, 40, 50] as const) {
    await setZoomLevelAndClose(page, UI_SIZE_BUTTON_LABELS[size])
    if (size !== 30) {
      await expect.poll(async () => page.locator('.bottom-workspace').evaluate((element) =>
        element.getBoundingClientRect().height
      )).toBeGreaterThanOrEqual(BOTTOM_WORKSPACE_MINIMUM_HEIGHTS[size].samples - 1)
    }
    for (const tab of ['master', 'mixer', 'samples'] as const) {
      await page.getByRole('tab', { name: tab[0]!.toUpperCase() + tab.slice(1), exact: true }).click()
      await shrinkToFloorWithKeyboard()
      await auditActivePanel(tab, BOTTOM_WORKSPACE_MINIMUM_HEIGHTS[size][tab])
    }
  }

  // Tab restoration is programmatic. It must not overwrite the remembered
  // height of the tab that was active when the layout event was dispatched.
  for (const tab of ['master', 'mixer', 'samples', 'mixer', 'master'] as const) {
    await page.getByRole('tab', { name: tab[0]!.toUpperCase() + tab.slice(1), exact: true }).click()
    await expect.poll(async () => page.locator('.bottom-workspace').evaluate((element) =>
      element.getBoundingClientRect().height
    )).toBeCloseTo(BOTTOM_WORKSPACE_MINIMUM_HEIGHTS[50][tab], 0)
  }
})

test('Samples expansion and restore survive reloads and unrelated Master resizing', async ({ seededPage: page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.getByRole('button', { name: 'Start New MixJam' }).click()
  await page.getByRole('tab', { name: 'Samples', exact: true }).click()

  const separator = page.getByRole('separator', { name: 'Resize bottom workspace' })
  await separator.focus()
  await separator.press('End')
  await settleLayout(page)
  const restoredHeight = await page.locator('.bottom-workspace').evaluate((element) =>
    element.getBoundingClientRect().height
  )

  await page.getByRole('button', { name: 'Expand Samples' }).click()
  await expect(page.getByRole('button', { name: 'Restore workspace' })).toBeVisible()
  await expect.poll(async () => page.locator('.bottom-workspace').evaluate((element) =>
    element.getBoundingClientRect().height
  )).toBeGreaterThan(500)

  await page.getByRole('tab', { name: 'Master', exact: true }).click()
  await separator.focus()
  await separator.press('ArrowUp')
  await page.getByRole('tab', { name: 'Samples', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Restore workspace' })).toBeVisible()
  await expect.poll(async () => page.locator('.bottom-workspace').evaluate((element) =>
    element.getBoundingClientRect().height
  )).toBeGreaterThan(500)

  await page.reload()
  await page.getByRole('button', { name: 'Start New MixJam' }).click()
  await expect(page.getByRole('button', { name: 'Restore workspace' })).toBeVisible()
  await expect.poll(async () => page.locator('.bottom-workspace').evaluate((element) =>
    element.getBoundingClientRect().height
  )).toBeGreaterThan(500)

  await page.getByRole('button', { name: 'Restore workspace' }).click()
  await expect(page.getByRole('button', { name: 'Expand Samples' })).toBeVisible()
  await expect.poll(async () => page.locator('.bottom-workspace').evaluate((element) =>
    element.getBoundingClientRect().height
  )).toBeCloseTo(restoredHeight, 0)

  await page.reload()
  await page.getByRole('button', { name: 'Start New MixJam' }).click()
  await expect(page.getByRole('button', { name: 'Expand Samples' })).toBeVisible()
  await expect.poll(async () => page.locator('.bottom-workspace').evaluate((element) =>
    element.getBoundingClientRect().height
  )).toBeCloseTo(restoredHeight, 0)
})
