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

// The bottom-panel drag floor is a CONSTANT (the smallest tab budget). A per-tab
// floor re-registered the panel-group constraint inside the tab-switch commit
// frame — a forced synchronous layout that, split across a second rAF frame from
// the size restore, let a main-thread stall breach the audio scheduler's
// lookahead margin and glitch playback. With a constant floor every tab shrinks
// to the samples budget, so the taller tabs (Master, Mixer) sit BELOW their own
// content budget and scroll. The guarantee is no longer "fits without a
// scrollbar" but "content stays laid out at its full budget (CSS min-height) and
// scrolls, so no control is clipped away — every control remains reachable."
test('a tab dragged below its budget scrolls with every control still reachable', async ({ seededPage: page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.getByRole('button', { name: 'Start New MixJam' }).click()

  const shrinkToFloorWithKeyboard = async () => {
    const handle = page.getByRole('separator', { name: 'Resize bottom workspace' })
    await handle.focus()
    await handle.press('End')
    await settleLayout(page)
  }

  const auditActivePanel = async (
    tab: 'master' | 'mixer' | 'samples',
    activeBudget: number,
    floor: number
  ) => {
    const audit = await page.evaluate(({ activeTab }) => {
      const workspace = document.querySelector('.bottom-workspace')
      const panel = document.querySelector(`[data-panel-name="${activeTab}"]`)
      if (!(workspace instanceof HTMLElement) || !(panel instanceof HTMLElement)) {
        throw new Error(`Missing ${activeTab} Bottom Workspace panel`)
      }
      const content = panel.firstElementChild
      if (!(content instanceof HTMLElement)) throw new Error(`${activeTab} panel has no content`)
      const tabs = document.querySelector('.bottom-workspace-tabs')
      if (!(tabs instanceof HTMLElement)) throw new Error('Missing tab row')
      // Measure control positions from the content origin.
      panel.scrollTop = 0
      const panelBox = panel.getBoundingClientRect()
      const workspaceBox = workspace.getBoundingClientRect()
      const tabsHeight = tabs.getBoundingClientRect().height
      // The panel is the vertical scrollport; content reaches from its top down
      // to scrollHeight. A control is reachable when its box lies within that
      // range. Controls inside a nested scrollport (the Samples category tree /
      // tiles, or the horizontal rack) are bounded by that port, which is itself
      // laid out within the panel's scroll range.
      const scrollBottom = panelBox.top + panel.scrollHeight
      const selector = activeTab === 'samples'
        ? '.cat-manage-btn, .sort-btn, .category-tree .sample-bubble-hit-target, .tiles .sample-bubble-hit-target'
        : 'button, input, select, [role="slider"], [role="meter"], .vertical-control-endpoint, .mixer-channel-db'
      const controls = [...panel.querySelectorAll(selector)].filter((el): el is HTMLElement => {
        if (!(el instanceof HTMLElement)) return false
        const box = el.getBoundingClientRect()
        return box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== 'hidden'
      })
      // The Samples category tree and tiles scroll their own contents (internal
      // overflow-y), so a bubble below their visible edge is reachable through
      // that port — check the port against the panel, not each bubble. Controls
      // elsewhere (the rack knobs, the Samples manage/sort buttons) must sit
      // within the panel's own scroll range.
      const clipped: string[] = []
      const seen = new Set<Element>()
      for (const el of controls) {
        const port = el.closest('.category-tree, .tiles')
        const target = port instanceof HTMLElement ? port : el
        if (seen.has(target)) continue
        seen.add(target)
        const box = target.getBoundingClientRect()
        const name = target.getAttribute('aria-label') || target.className || target.tagName
        if (box.top < panelBox.top - 1 || box.bottom > scrollBottom + 1) {
          clipped.push(`${name}: ${box.top.toFixed(0)}-${box.bottom.toFixed(0)} outside ${panelBox.top.toFixed(0)}-${scrollBottom.toFixed(0)}`)
        }
      }
      return {
        workspaceHeight: workspaceBox.height,
        panelFillsWorkspace:
          Math.abs(panelBox.height + tabsHeight - workspaceBox.height) <= 1 &&
          Math.abs(panelBox.bottom - workspaceBox.bottom) <= 1,
        overflowY: getComputedStyle(panel).overflowY,
        contentMinHeight: parseFloat(getComputedStyle(content).minHeight) || 0,
        scrollHeight: panel.scrollHeight,
        clientHeight: panel.clientHeight,
        scrolls: panel.scrollHeight > panel.clientHeight + 1,
        controlCount: controls.length,
        clipped,
        rootOverflow: document.documentElement.scrollHeight > document.documentElement.clientHeight
      }
    }, { activeTab: tab })

    // Every tab shrank to the constant floor (the smallest budget), regardless of
    // the active tab's own, larger budget.
    expect(audit.workspaceHeight, `${tab} floor`).toBeGreaterThanOrEqual(floor - 1)
    expect(audit.workspaceHeight, `${tab} shrank to the floor`).toBeLessThanOrEqual(floor + 2)
    expect(audit.panelFillsWorkspace, `${tab} panel bounds`).toBe(true)
    expect(audit.overflowY, `${tab} scrollable`).toBe('auto')
    // The content is laid out at the active tab's own budget (CSS min-height), so
    // nothing is compressed and every control is reachable within the scroll
    // range — never clipped away.
    expect(audit.controlCount, `${tab} has controls`).toBeGreaterThan(0)
    expect(audit.clipped, `${tab} controls reachable`).toEqual([])
    expect(audit.contentMinHeight, `${tab} content floor`).toBeGreaterThan(0)
    expect(audit.scrollHeight, `${tab} content laid out at its budget`).toBeGreaterThanOrEqual(audit.contentMinHeight - 2)
    expect(audit.rootOverflow, `${tab} root overflow`).toBe(false)
    // The taller tabs sit below their budget at the floor and scroll; Samples is
    // itself the floor, so it still fits without a scrollbar.
    if (tab === 'samples') {
      expect(audit.scrolls, `${tab} fits without scroll`).toBe(false)
    } else {
      expect(audit.scrolls, `${tab} scrolls at the floor`).toBe(true)
      expect(audit.workspaceHeight, `${tab} sits below its own budget`).toBeLessThan(activeBudget)
    }
  }

  for (const size of [30, 40, 50] as const) {
    await setZoomLevelAndClose(page, UI_SIZE_BUTTON_LABELS[size])
    const floor = BOTTOM_WORKSPACE_MINIMUM_HEIGHTS[size].samples
    if (size !== 30) {
      await expect.poll(async () => page.locator('.bottom-workspace').evaluate((element) =>
        element.getBoundingClientRect().height
      )).toBeGreaterThanOrEqual(floor - 1)
    }
    for (const tab of ['master', 'mixer', 'samples'] as const) {
      await page.getByRole('tab', { name: tab[0]!.toUpperCase() + tab.slice(1), exact: true }).click()
      await shrinkToFloorWithKeyboard()
      await auditActivePanel(tab, BOTTOM_WORKSPACE_MINIMUM_HEIGHTS[size][tab], floor)
    }
  }

  // Tab restoration is programmatic and still lifts each tab to its OWN budget
  // (the imperative resize, not the drag floor), so a switch restores the tab to
  // its content height even though the drag floor is now constant.
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
