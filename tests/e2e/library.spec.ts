import { test, expect } from './fixtures'

test.describe('Library', () => {
  test.beforeEach(async ({ seededPage }) => {
    await seededPage.getByRole('button', { name: 'Start New MixJam' }).click()
    await expect(seededPage.locator('.home-setup')).not.toBeVisible({ timeout: 5_000 })
    await seededPage.getByRole('tab', { name: 'Samples' }).click()
  })

  test('sample browser shows sample tiles', async ({ seededPage }) => {
    const bubbles = seededPage.locator('.tiles .sample-bubble')
    await expect(bubbles).toHaveCount(5)
    await expect(bubbles.filter({ hasText: 'kick_808' })).toBeVisible()
  })

  test('tag navigator is flat and searchable', async ({ seededPage }) => {
    const navigator = seededPage.getByRole('list', { name: 'Sample tags' })
    await expect(navigator.getByRole('button', { name: 'Bass', exact: true })).toBeVisible()
    await expect(navigator.getByRole('button', { name: 'Hard Trance', exact: true })).toBeVisible()
    await expect(navigator.getByRole('button', { name: 'House', exact: true })).toBeVisible()
    await expect(navigator.getByRole('button', { name: 'Unsorted', exact: true })).toBeVisible()

    await seededPage.getByRole('searchbox', { name: 'Search tags', exact: true }).fill('trance')
    await expect(navigator.getByRole('button', { name: 'Hard Trance', exact: true })).toBeVisible()
    await expect(navigator.getByRole('button', { name: 'House', exact: true })).toHaveCount(0)
  })

  test('shared folder names use one tag and selected tags match all', async ({ seededPage }) => {
    const sampleTiles = seededPage.locator('.tiles .sample-bubble')
    const navigator = seededPage.getByRole('list', { name: 'Sample tags' })

    await navigator.getByRole('button', { name: 'Bass', exact: true }).click()
    await expect(sampleTiles).toHaveCount(2)
    await expect(sampleTiles.filter({ hasText: 'kick_808' })).toBeVisible()
    await expect(sampleTiles.filter({ hasText: 'snare_clap' })).toBeVisible()

    await navigator.getByRole('button', { name: 'Hard Trance', exact: true }).click()
    await expect(sampleTiles).toHaveCount(1)
    await expect(sampleTiles.filter({ hasText: 'kick_808' })).toBeVisible()
    await expect(seededPage.getByRole('button', { name: 'Remove Bass filter' })).toBeVisible()
    await expect(seededPage.getByRole('button', { name: 'Remove Hard Trance filter' })).toBeVisible()
  })

  test('tag navigator splitter and management actions use the selected UI Size targets', async ({ seededPage }) => {
    const navigator = seededPage.locator('.tag-navigator')
    const initialWidth = await navigator.evaluate((element) => element.getBoundingClientRect().width)
    const splitter = seededPage.getByRole('separator', { name: 'Resize tag navigator' })
    await splitter.focus()
    await splitter.press('ArrowLeft')
    await expect.poll(() => navigator.evaluate((element) => element.getBoundingClientRect().width))
      .toBeLessThan(initialWidth)

    await seededPage.getByRole('button', { name: 'Manage tags and libraries' }).click()
    const actions = seededPage.locator('.subcat, .sort-btn, .manage-action')
    await expect(actions.first()).toBeVisible()
    const boxes = await actions.evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect()
      return { width: rect.width, height: rect.height }
    }))
    const selectedSize = await seededPage.evaluate(() => Number.parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--ui-size'),
      10
    ))

    expect(boxes.length).toBeGreaterThan(0)
    for (const box of boxes) {
      expect(box.width).toBeGreaterThanOrEqual(selectedSize)
      expect(box.height).toBeGreaterThanOrEqual(selectedSize)
    }
  })

  test('tag management searches and persists create, rename, and delete', async ({ seededPage }) => {
    await seededPage.getByRole('button', { name: 'Manage tags and libraries' }).click()
    const panel = seededPage.locator('#sample-browser-manage-panel')

    await panel.getByRole('searchbox', { name: 'Search managed tags' }).fill('bass')
    const bass = panel.locator('.manage-list-item').filter({ hasText: 'Bass' })
    await expect(bass).toBeVisible()
    await expect(bass.getByText('From folder', { exact: true })).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Delete tag Bass' })).toHaveCount(0)

    await panel.getByRole('searchbox', { name: 'Search managed tags' }).fill('')
    await panel.getByRole('textbox', { name: 'New tag name' }).fill('Punchy')
    await panel.getByRole('button', { name: 'Create tag' }).click()
    await expect(panel.getByText('Punchy', { exact: true })).toBeVisible()

    await panel.getByRole('button', { name: 'Rename tag Punchy' }).click()
    await panel.getByRole('textbox', { name: 'Rename tag Punchy' }).fill('Focused')
    await panel.getByRole('button', { name: 'Confirm rename' }).click()
    await expect(panel.getByText('Focused', { exact: true })).toBeVisible()

    await panel.getByRole('button', { name: 'Delete tag Focused' }).click()
    await expect(panel.getByText('Focused', { exact: true })).toHaveCount(0)
  })

  test('per-sample tag assignment is searchable and folder assignments are read-only', async ({ seededPage }) => {
    const kick = seededPage.locator('.sample-bubble').filter({ hasText: 'kick_808' }).locator('..')
    await kick.click({ button: 'right' })
    await seededPage.getByRole('menuitem', { name: 'Edit tags…' }).click()

    const editor = seededPage.getByRole('dialog', { name: 'Tags for kick_808.wav' })
    await expect(editor).toBeVisible()
    const search = editor.getByRole('searchbox', { name: 'Search tags to assign' })
    await search.fill('bass')
    await expect(editor.getByRole('button', { name: 'Bass, assigned from folder' })).toBeDisabled()

    await search.fill('review')
    const review = editor.getByRole('button', { name: 'Review' })
    await expect(review).toHaveAttribute('aria-pressed', 'false')
    await review.click()
    await expect(review).toHaveAttribute('aria-pressed', 'true')
    await seededPage.keyboard.press('Escape')

    await seededPage.getByRole('list', { name: 'Sample tags' })
      .getByRole('button', { name: 'Review', exact: true }).click()
    await expect(seededPage.locator('.tiles .sample-bubble')).toHaveCount(1)
    await expect(seededPage.locator('.tiles .sample-bubble').filter({ hasText: 'kick_808' })).toBeVisible()
  })

  test('a promoted folder tag can be pinned as independent user provenance', async ({ seededPage }) => {
    await seededPage.getByRole('button', { name: 'Manage tags and libraries' }).click()
    const panel = seededPage.locator('#sample-browser-manage-panel')
    await panel.getByRole('textbox', { name: 'New tag name' }).fill('Bass')
    await panel.getByRole('button', { name: 'Create tag' }).click()
    await expect(panel.getByRole('button', { name: 'Delete tag Bass' })).toBeVisible()
    await seededPage.getByRole('button', { name: 'Close manage panel' }).click()

    const kick = seededPage.locator('.sample-bubble').filter({ hasText: 'kick_808' }).locator('..')
    await kick.click({ button: 'right' })
    await seededPage.getByRole('menuitem', { name: 'Edit tags…' }).click()
    const editor = seededPage.getByRole('dialog', { name: 'Tags for kick_808.wav' })
    const bass = editor.getByRole('button', { name: 'Bass, from folder, activate to keep after move' })
    await expect(bass).toBeEnabled()
    await expect(editor.getByText('From folder · Keep after move')).toBeVisible()
    await bass.click()
    await expect(editor.getByRole('button', { name: 'Bass, kept after move' }))
      .toHaveAttribute('data-user-assigned', 'true')
    await expect(editor.getByText('From folder · Kept after move')).toBeVisible()
  })

  test('back button returns to home screen', async ({ seededPage }) => {
    await seededPage.getByRole('button', { name: /Return to Main Menu/ }).click()
    await expect(seededPage.locator('.home-setup')).toBeVisible({ timeout: 5_000 })
  })
})
