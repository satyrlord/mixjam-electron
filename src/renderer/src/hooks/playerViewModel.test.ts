import { describe, expect, it, vi } from 'vitest'
import type { ProjectGeneratorMetadata } from '../project/project-file'
import { createPlayerViewModel } from './playerViewModel'
import type { AppState } from './useAppState'

const CURRENT_GENERATOR: ProjectGeneratorMetadata = {
  generatorVersion: 1,
  profileId: 'techno',
  profileVersion: 1,
  seed: 'coverage-seed',
  parameters: {
    bpmMode: 'fixed',
    resolvedBpm: 128,
    intensity: 'medium',
    durationSeconds: 120
  },
  corpusFingerprint: 'fingerprint',
  sampleFolderKey: 'sample-folder'
}

describe('createPlayerViewModel', () => {
  it('maps app state and updates both sides of the tag toggle', () => {
    let selectedTagIds = [1]
    const setSelectedTagIds = vi.fn((update: (current: number[]) => number[]) => {
      selectedTagIds = update(selectedTagIds)
    })
    const samples = [{ relpath: 'kick.wav' }]
    const app = {
      samples,
      selectedSampleDetail: null,
      selectedTagIds,
      setSelectedTagIds,
      projectGenerator: null,
      projectName: 'Coverage project',
      projectDirty: true,
      projectBusy: false
    } as unknown as AppState

    const viewModel = createPlayerViewModel(app)

    expect(viewModel.browser.samples).toBe(samples)
    expect(viewModel.browser.selectedSamplePath).toBeNull()
    expect(viewModel.project).toMatchObject({
      name: 'Coverage project',
      dirty: true,
      busy: false,
      canRegenerate: false
    })

    viewModel.browser.onToggleTagFilter(2)
    expect(selectedTagIds).toEqual([1, 2])
    viewModel.browser.onToggleTagFilter(1)
    expect(selectedTagIds).toEqual([2])
    viewModel.project.onRegenerateExact?.()
    viewModel.project.onRegenerateCurrent?.()
  })

  it('selects a sample path and recognizes only current generator metadata', () => {
    const current = createPlayerViewModel({
      selectedSampleDetail: { relpath: 'Drums/Kick.wav' },
      selectedTagIds: [],
      projectGenerator: CURRENT_GENERATOR
    } as unknown as AppState)
    const stale = createPlayerViewModel({
      selectedSampleDetail: null,
      selectedTagIds: [],
      projectGenerator: { ...CURRENT_GENERATOR, profileVersion: 2 }
    } as unknown as AppState)

    expect(current.browser.selectedSamplePath).toBe('Drums/Kick.wav')
    expect(current.project.canRegenerate).toBe(true)
    expect(stale.project.canRegenerate).toBe(false)
  })
})
