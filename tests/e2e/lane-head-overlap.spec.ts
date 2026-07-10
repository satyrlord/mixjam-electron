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

  expect(headBox.x).toBeGreaterThanOrEqual(railRightEdge)
  expect(rulerBox.x).toBeGreaterThanOrEqual(railRightEdge)

  const nameBox = await page.locator('.tracker-lane-name').first().boundingBox()
  if (!nameBox) throw new Error('lane name missing')
  expect(nameBox.x).toBeGreaterThanOrEqual(railRightEdge)

  await page.getByRole('button', { name: 'Expand recent projects' }).click()
  const expandedRail = await rail.boundingBox()
  const expandedHead = await firstHead.boundingBox()
  if (!expandedRail || !expandedHead) throw new Error('tracker layout elements missing after expand')
  expect(expandedHead.x).toBeGreaterThanOrEqual(expandedRail.x + expandedRail.width)
})
