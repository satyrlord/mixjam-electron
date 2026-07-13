import { test, expect } from './fixtures'

interface ProjectFileHarness {
  __mixjamProjectFiles: Record<string, string>
}

test.describe('Project save and load', () => {
  test('loads Song, Mixer, FX, and lane state from a recent project', async ({ seededPage }) => {
    await seededPage.getByRole('button', { name: /club-night/ }).click()

    await expect(seededPage.locator('.player-view')).toBeVisible()
    await expect(seededPage.getByLabel('club-night')).toBeVisible()
    await expect(seededPage.getByRole('button', { name: '138 BPM, Master 70%' })).toBeVisible()
    await expect(seededPage.locator('[data-placement-count="1"]')).toHaveCount(1)

    await seededPage.getByRole('tab', { name: 'Mixer' }).click()
    await expect(seededPage.getByRole('slider', { name: 'Channel 1 Volume' })).toHaveAttribute('aria-valuenow', '64')

    await seededPage.getByRole('tab', { name: 'FX' }).click()
    await expect(seededPage.locator('.effect-card-name', { hasText: 'Delay' })).toBeVisible()
  })

  test('marks edits dirty and Save As writes the complete current project', async ({ seededPage }) => {
    await seededPage.getByRole('button', { name: 'Start New MixJam' }).click()
    const bpmInput = seededPage.getByRole('textbox', { name: 'BPM value' })
    await bpmInput.fill('126')
    await bpmInput.press('Enter')

    await expect(seededPage.getByLabel('Untitled, unsaved changes')).toBeVisible()
    await seededPage.keyboard.press('Control+Shift+S')
    await expect(seededPage.getByLabel('saved-project')).toBeVisible()

    const saved = await seededPage.evaluate(() => {
      const harness = window as unknown as ProjectFileHarness
      return JSON.parse(harness.__mixjamProjectFiles['saved-project.mixjam'])
    })

    expect(saved.formatVersion).toBe(1)
    expect(saved.song).toEqual({ bpm: 126, masterGain: 0.8 })
    expect(saved.lanes).toHaveLength(16)
    expect(saved.channels).toHaveLength(16)
    expect(saved.channels[0].fx).toEqual([])
  })

  test('starting a new project does not reuse the previous project state', async ({ seededPage }) => {
    await seededPage.getByRole('button', { name: /club-night/ }).click()
    await expect(seededPage.getByRole('button', { name: '138 BPM, Master 70%' })).toBeVisible()

    await seededPage.getByRole('button', { name: /Return to Main Menu/ }).click()
    await seededPage.getByRole('button', { name: 'Start New MixJam' }).click()

    await expect(seededPage.getByLabel('Untitled')).toBeVisible()
    await expect(seededPage.getByRole('button', { name: '120 BPM, Master 80%' })).toBeVisible()
    await seededPage.getByRole('tab', { name: 'Mixer' }).click()
    await expect(seededPage.getByRole('slider', { name: 'Channel 1 Volume' })).toHaveAttribute('aria-valuenow', '80')
    await seededPage.getByRole('tab', { name: 'FX' }).click()
    await expect(seededPage.locator('.effect-card')).toHaveCount(0)
  })

  test('loads a project with missing samples and marks the affected lane', async ({ seededPage }) => {
    await seededPage.evaluate(() => {
      const harness = window as unknown as ProjectFileHarness
      const project = JSON.parse(harness.__mixjamProjectFiles['club-night.mixjam'])
      project.lanes[0].placements[0].sampleRef = 'Missing/kick.wav'
      harness.__mixjamProjectFiles['club-night.mixjam'] = JSON.stringify(project)
    })

    await seededPage.getByRole('button', { name: /club-night/ }).click()

    await expect(seededPage.getByText('1 referenced sample could not be found. Affected lanes are marked.')).toBeVisible()
    await expect(seededPage.getByRole('img', { name: 'Lane 1 contains a missing sample' })).toBeVisible()
  })
})
