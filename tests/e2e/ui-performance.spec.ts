import { test, expect } from './fixtures'

test.describe('UI performance invariants', () => {
  test('keeps the hidden Samples panel virtualized and stops background paging', async ({ seededPage }) => {
    await seededPage.getByRole('button', { name: 'Start New MixJam' }).click()
    await expect(seededPage.locator('.player-view')).toBeVisible()

    await seededPage.evaluate(() => {
      const rows = Array.from({ length: 1_200 }, (_, index) => {
        const id = index + 1
        return {
          id,
          relpath: `Performance/perf-sample-${id}.wav`,
          filename: `perf-sample-${id}.wav`,
          ext: 'wav',
          sizeBytes: 1024 + id,
          duration: 0.5,
          sampleRate: 44_100,
          channels: 1,
          bpm: null,
          bpmSource: null,
          musicalKey: null,
          musicalKeySource: null,
          sampleType: null,
          sampleTypeSource: null,
          dateAdded: id,
          scanState: 1,
          categoryId: 1,
          tagIds: [],
          tags: []
        }
      })
      const auditWindow = window as typeof window & {
        __perfQueryCount: number
        __perfQueryRequests: Array<{ offset: number, limit: number }>
      }
      auditWindow.__perfQueryCount = 0
      auditWindow.__perfQueryRequests = []
      window.backendAPI.querySamples = async (request) => {
        auditWindow.__perfQueryCount += 1
        const offset = request.offset ?? 0
        const limit = request.limit ?? 500
        auditWindow.__perfQueryRequests.push({ offset, limit })
        return { rows: rows.slice(offset, offset + limit), total: rows.length }
      }
    })

    await seededPage.getByRole('searchbox', { name: 'Search samples' }).fill('perf-sample')
    await seededPage.waitForFunction(() => {
      const auditWindow = window as typeof window & { __perfQueryCount?: number }
      return (auditWindow.__perfQueryCount ?? 0) >= 1
    })
    await seededPage.waitForTimeout(500)

    const hiddenSamples = seededPage.locator('[data-panel-name="samples"][hidden]')
    await expect(hiddenSamples.locator('.tiles')).toHaveAttribute('data-active', 'false')
    await expect(hiddenSamples.locator('.tiles .sample-bubble')).toHaveCount(0)
    expect(await seededPage.evaluate(() => {
      const auditWindow = window as typeof window & { __perfQueryCount?: number }
      return auditWindow.__perfQueryCount
    })).toBe(1)

    await seededPage.getByRole('tab', { name: 'Samples', exact: true }).click()
    await expect(seededPage.locator('.tiles .sample-bubble').first()).toBeVisible()
    const tiles = seededPage.locator('.tiles')
    const virtualRows = tiles.locator('.tiles-row')
    expect(await virtualRows.count()).toBeGreaterThan(0)
    expect(await virtualRows.count()).toBeLessThan(40)

    const mountedPages: string[][] = []
    for (const expectedQueryCount of [2, 3]) {
      await tiles.evaluate((element) => { element.scrollTop = element.scrollHeight })
      await seededPage.waitForFunction((minimum) => {
        const auditWindow = window as typeof window & { __perfQueryCount?: number }
        return (auditWindow.__perfQueryCount ?? 0) >= minimum
      }, expectedQueryCount)
      await expect(virtualRows.first()).toBeVisible()
      expect(await virtualRows.count()).toBeLessThan(40)
      mountedPages.push(await tiles.locator('.sample-bubble b').allTextContents())
    }

    expect(await seededPage.evaluate(() => {
      const auditWindow = window as typeof window & {
        __perfQueryRequests?: Array<{ offset: number, limit: number }>
      }
      return auditWindow.__perfQueryRequests
    })).toEqual([
      { offset: 0, limit: 500 },
      { offset: 500, limit: 500 },
      { offset: 1_000, limit: 500 }
    ])
    expect(mountedPages[0]).not.toEqual(mountedPages[1])

    await tiles.evaluate((element) => { element.scrollTop = element.scrollHeight })
    await expect(tiles.locator('.sample-bubble').filter({ hasText: 'perf-sample-1200' })).toBeVisible()
    expect(await virtualRows.count()).toBeGreaterThan(0)
    expect(await virtualRows.count()).toBeLessThan(40)
    expect(await tiles.locator('.sample-bubble').count()).toBeLessThan(400)

    await seededPage.getByRole('tab', { name: 'Master', exact: true }).click()
    await expect(hiddenSamples.locator('.tiles .sample-bubble')).toHaveCount(0)
  })
})
