import { test, expect } from './fixtures'

test('collapsed MixJam Browser does not overlap the Tracker lane heads', async ({ seededPage: page }) => {
  const start = page.getByRole('button', { name: 'Start New MixJam' })
  await expect(start).toBeEnabled()
  await start.click()
  await expect(page.locator('.tracker-lane-name').first()).toHaveText('Lane 1')

  await page.getByRole('button', { name: 'Collapse MixJam Browser' }).click()

  const mixJamBrowser = page.locator('.mixjam-browser')
  const firstHead = page.locator('.tracker-lane-head').first()
  const ruler = page.locator('.tracker-ruler')

  const browserBox = await mixJamBrowser.boundingBox()
  const headBox = await firstHead.boundingBox()
  const rulerBox = await ruler.boundingBox()
  if (!browserBox || !headBox || !rulerBox) throw new Error('Player layout elements missing')

  const browserRightEdge = browserBox.x + browserBox.width

  expect(headBox.x).toBeGreaterThanOrEqual(browserRightEdge)
  expect(rulerBox.x).toBeGreaterThanOrEqual(browserRightEdge)

  const nameBox = await page.locator('.tracker-lane-name').first().boundingBox()
  if (!nameBox) throw new Error('lane name missing')
  expect(nameBox.x).toBeGreaterThanOrEqual(browserRightEdge)

  await page.getByRole('button', { name: 'Expand MixJam Browser' }).click()
  const expandedBrowser = await mixJamBrowser.boundingBox()
  const expandedHead = await firstHead.boundingBox()
  if (!expandedBrowser || !expandedHead) throw new Error('Player layout elements missing after expand')
  expect(expandedHead.x).toBeGreaterThanOrEqual(expandedBrowser.x + expandedBrowser.width)
})
