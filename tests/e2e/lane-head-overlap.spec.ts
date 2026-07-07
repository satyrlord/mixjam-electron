/**
 * Regression: collapsing the recent-projects rail must not paint the rail
 * over the tracker's lane heads.
 *
 * The collapsed rail keeps its grid cell while .tracker-region expands to
 * grid-column 1/3 with z-index layering — without a clearing margin the rail
 * overlays the first 30px of every lane head and the ruler spacer, visually
 * clipping lane names ("Lane 1" renders as "e 1"). See index.css
 * `.tracker-view.recent-projects-collapsed .tracker-region`.
 */
import { test, expect } from './fixtures'

test('collapsed recents rail does not overlap the tracker lane heads', async ({ seededPage: page }) => {
  const start = page.getByRole('button', { name: 'Start New MixJam' })
  await expect(start).toBeEnabled()
  await start.click()
  await expect(page.getByText('Lane 1', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Collapse recent projects' }).click()

  const rail = page.locator('.recent-projects-rail')
  const firstHead = page.locator('.tracker-lane-head').first()
  const ruler = page.locator('.tracker-ruler')

  const railBox = await rail.boundingBox()
  const headBox = await firstHead.boundingBox()
  const rulerBox = await ruler.boundingBox()
  if (!railBox || !headBox || !rulerBox) throw new Error('tracker layout elements missing')

  const railRightEdge = railBox.x + railBox.width

  // The lane-head column must start at or after the rail's right edge —
  // any overlap hides the beginning of every lane name under the rail.
  expect(headBox.x).toBeGreaterThanOrEqual(railRightEdge)
  // The ruler (which shares the tracker region) must be clear of the rail too,
  // or bar numbers drift out of alignment with the lanes below.
  expect(rulerBox.x).toBeGreaterThanOrEqual(railRightEdge)

  // The full lane name stays visible: the text node's box must sit entirely
  // inside the visible (non-overlapped) part of the head.
  const nameBox = await page.locator('.tracker-lane-name').first().boundingBox()
  if (!nameBox) throw new Error('lane name missing')
  expect(nameBox.x).toBeGreaterThanOrEqual(railRightEdge)

  // Expanding again restores the two-column layout with the head to the
  // right of the full-width rail.
  await page.getByRole('button', { name: 'Expand recent projects' }).click()
  const expandedRail = await rail.boundingBox()
  const expandedHead = await firstHead.boundingBox()
  if (!expandedRail || !expandedHead) throw new Error('tracker layout elements missing after expand')
  expect(expandedHead.x).toBeGreaterThanOrEqual(expandedRail.x + expandedRail.width)
})
