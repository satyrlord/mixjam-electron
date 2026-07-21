import { test, expect } from './fixtures'

interface ProjectFileHarness {
  __mixjamProjectFiles: Record<string, string>
}

test.describe('Project save and load', () => {
  test('loads Song, Mixer, return FX, and lane state from a recent project', async ({ seededPage }) => {
    await seededPage.getByRole('button', { name: /club-night/ }).click()

    await expect(seededPage.locator('.player-view')).toBeVisible()
    await expect(seededPage.getByLabel('club-night')).toBeVisible()
    await expect(seededPage.getByRole('button', { name: '138 BPM, Master 70%' })).toBeVisible()
    await expect(seededPage.locator('[data-placement-count="1"]')).toHaveCount(1)

    await seededPage.getByRole('tab', { name: 'Mixer' }).click()
    await expect(seededPage.getByRole('slider', { name: 'Channel 1 Volume' })).toHaveAttribute('aria-valuenow', '64')

    await expect(seededPage.getByRole('button', { name: 'FX 1 Echoform Delay', exact: true })).toContainText('Echoform Delay')
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

    expect(saved.formatVersion).toBe(6)
    expect(saved.song).toEqual({
      bpm: 126,
      masterGain: 1,
      clipEdgeMicroFades: { enabled: true, fadeInMs: 2, fadeOutMs: 4 }
    })
    expect(saved.lanes).toHaveLength(8)
    expect(saved.channels).toBeUndefined()
    expect(saved.masterBus.order).toEqual([
      'clip', 'tube', 'subeq', 'comp', 'max', 'addeq', 'tape', 'width', 'mbc', 'lim'
    ])
    expect(saved.masterBus.power).not.toHaveProperty('gain')
    expect(saved.masterBus.preset).toBe('Cheat Sheet')
    expect(saved.fxBuses).toHaveLength(4)
    expect(saved.fxBuses.every((bus: { module: { type: string } }) => bus.module.type === 'empty')).toBe(true)
  })

  test('renames a lane from its context menu and saves the edited name', async ({ seededPage }) => {
    await seededPage.getByRole('button', { name: 'Start New MixJam' }).click()

    await seededPage.locator('.tracker-lane-name').first().click({ button: 'right' })
    await seededPage.getByRole('menuitem', { name: 'Rename lane' }).click()
    const renameInput = seededPage.getByRole('textbox', { name: 'Rename Lane 1' })
    await renameInput.fill('Kick Phrase')
    await renameInput.press('Enter')

    await expect(seededPage.locator('.tracker-lane-name').first()).toHaveText('Kick Phrase')
    await expect(seededPage.getByRole('button', { name: 'Mute Kick Phrase' })).toBeVisible()
    await expect(seededPage.getByLabel('Untitled, unsaved changes')).toBeVisible()

    await seededPage.keyboard.press('Control+Shift+S')
    const savedName = await seededPage.evaluate(() => {
      const harness = window as unknown as ProjectFileHarness
      return JSON.parse(harness.__mixjamProjectFiles['saved-project.mixjam']).lanes[0].name
    })
    expect(savedName).toBe('Kick Phrase')
  })

  test('starting a new project does not reuse the previous project state', async ({ seededPage }) => {
    await seededPage.getByRole('button', { name: /club-night/ }).click()
    await expect(seededPage.getByRole('button', { name: '138 BPM, Master 70%' })).toBeVisible()

    await seededPage.getByRole('button', { name: /club-night, project menu/ }).click()
    await seededPage.getByRole('menuitem', { name: 'New' }).click()

    await expect(seededPage.getByLabel('Untitled')).toBeVisible()
    await expect(seededPage.getByRole('button', { name: '120 BPM, Master 100%' })).toBeVisible()
    await seededPage.getByRole('tab', { name: 'Mixer' }).click()
    await expect(seededPage.getByRole('slider', { name: 'Channel 1 Volume' })).toHaveAttribute('aria-valuenow', '80')
    await expect(seededPage.getByRole('button', { name: 'FX 1 Empty', exact: true })).toContainText('Empty')
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
