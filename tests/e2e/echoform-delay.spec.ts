import { expect, test } from './fixtures'

/**
 * The preset picker opens from inside a blocking dialog, so it is a stacking
 * test as much as a behaviour test: the menu portals to <body> while the
 * dialog overlay is a separate fixed layer. When the menu sat below that
 * overlay it still mounted, measured, and reported its items to the
 * accessibility tree — jsdom saw a perfectly healthy menu — but nothing
 * painted and nothing could be clicked. Only a real browser catches that, so
 * these assertions check what is actually on top and actually clickable.
 */
async function openEchoformEditor(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('button', { name: 'Start New MixJam' }).click()
  await page.getByRole('tab', { name: 'Mixer' }).click()
  await page.getByRole('button', { name: 'FX 1 Empty', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Echoform Delay...' }).click()
  await expect(page.getByRole('dialog', { name: 'Echoform Delay' })).toBeVisible()
}

test.describe('Echoform Delay editor', () => {
  test('preset menu paints above the dialog overlay and applies a preset', async ({
    seededPage
  }) => {
    await openEchoformEditor(seededPage)

    const trigger = seededPage.locator('.ef-preset-trigger')
    await expect(trigger).toHaveText('Custom')
    await trigger.click()

    // Single-choice set: radio items, which unlike `menuitem` can carry a
    // checked state at all.
    const items = seededPage.getByRole('menuitemradio')
    await expect(items).toHaveCount(6)

    // The decisive assertion: the menu must be the top-most element at its own
    // center, not the dialog overlay painted over it.
    const cleanSlap = seededPage.getByRole('menuitemradio', { name: 'Clean Slap' })
    await expect(cleanSlap).toBeVisible()
    const topMost = await cleanSlap.evaluate((el) => {
      const rect = el.getBoundingClientRect()
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      return hit ? hit.closest('.mixjam-menu-content') !== null : false
    })
    expect(topMost, 'preset item is hit-testable, not covered by the overlay').toBe(true)

    await cleanSlap.click()
    await expect(trigger).toHaveText('Clean Slap')
    // The preset really applied rather than only relabelling the trigger.
    await expect(seededPage.locator('.ef-knob[aria-label="Feedback"]')).toHaveAttribute(
      'aria-valuenow',
      '18'
    )

    // Reopening shows the active preset as the checked one.
    await trigger.click()
    await expect(seededPage.getByRole('menuitemradio', { name: 'Clean Slap' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
  })

  test('keeps the footer legend visible and every control reachable at UI Size 50', async ({
    seededPage
  }) => {
    await openEchoformEditor(seededPage)

    await seededPage.evaluate(() => {
      const root = document.documentElement
      root.dataset.uiSize = '50'
      root.style.setProperty('--ui-size', '50px')
      root.style.setProperty('--ui-scale', String(5 / 3))
      root.style.setProperty('--ui-space-xs', '3px')
      root.style.setProperty('--ui-space-sm', '7px')
      root.style.setProperty('--ui-space-md', '13px')
      root.style.setProperty('--ui-space-lg', '20px')
      root.style.setProperty('--ui-font-xs', '17px')
      root.style.setProperty('--ui-font-sm', '18px')
      root.style.setProperty('--ui-font-md', '20px')
      root.style.setProperty('--ui-font-lg', '23px')
    })

    const geometry = await seededPage.evaluate(() => {
      const module = document.querySelector('.ef-module') as HTMLElement
      const foot = document.querySelector('.ef-foot') as HTMLElement
      const cards = [...document.querySelectorAll('.ef-card')] as HTMLElement[]
      return {
        // The footer is a persistent legend; it must not scroll away.
        footerInside:
          foot.getBoundingClientRect().bottom <= module.getBoundingClientRect().bottom + 1,
        // No card may hide content: the scroll belongs to the grid.
        clippedCards: cards
          .filter((card) => card.scrollHeight > card.clientHeight + 1)
          .map((card) => card.getAttribute('aria-label')),
        gridScrolls: getComputedStyle(document.querySelector('.ef-grid')!).overflowY
      }
    })

    expect(geometry.footerInside, 'footer legend stays inside the module').toBe(true)
    expect(geometry.clippedCards, 'no card clips its own controls').toEqual([])
    expect(geometry.gridScrolls).toBe('auto')

    // Freeze / Hold is the last control in the last card — the one the old
    // fixed-height layout cut off.
    await expect(seededPage.getByRole('button', { name: /Freeze \/ Hold/ })).toBeVisible()
  })
})
