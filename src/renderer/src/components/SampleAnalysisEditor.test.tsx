import { fireEvent, render, screen, waitFor } from '../test/render'
import { describe, expect, it, vi } from 'vitest'
import type { SampleListItem } from '../../../shared/backend-api'
import SampleAnalysisEditor from './SampleAnalysisEditor'

const SAMPLE_WITHOUT_ANALYSIS: SampleListItem = {
  id: 'sample.wav',
  dbId: 1,
  name: 'sample.wav',
  relpath: 'sample.wav',
  sourceGroup: 'Unsorted',
  durationSeconds: 1,
  bpm: null,
  bpmSource: null,
  musicalKey: null,
  musicalKeySource: null,
  sampleType: null,
  sampleTypeSource: null,
  tags: [],
  tagIds: [],
  folderTagIds: [],
  userTagIds: []
}

describe('SampleAnalysisEditor', () => {
  it('renders blank controls and unset sources when analysis metadata is absent', () => {
    render(
      <SampleAnalysisEditor
        sample={SAMPLE_WITHOUT_ANALYSIS}
        onClose={vi.fn()}
        onUpdate={vi.fn()}
        onReanalyze={vi.fn()}
      />
    )

    expect(screen.getByRole('spinbutton', { name: 'Sample BPM' })).toHaveValue(null)
    expect(screen.getByRole('textbox', { name: 'Sample musical key' })).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Sample type' })).toHaveValue('')
    expect(screen.getAllByText('unset')).toHaveLength(3)
  })

  it('keeps the editor open and shows an individual analysis failure', async () => {
    const onClose = vi.fn()
    render(
      <SampleAnalysisEditor
        sample={SAMPLE_WITHOUT_ANALYSIS}
        onClose={onClose}
        onUpdate={vi.fn()}
        onReanalyze={vi.fn().mockRejectedValue(new Error('Sample decode failed'))}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Analyze blank fields' }))

    expect(await screen.findByText('Sample decode failed')).toBeVisible()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes immediately when save has no changes and does not call onUpdate', () => {
    const onClose = vi.fn()
    const onUpdate = vi.fn()
    render(
      <SampleAnalysisEditor
        sample={SAMPLE_WITHOUT_ANALYSIS}
        onClose={onClose}
        onUpdate={onUpdate}
        onReanalyze={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save overrides' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('disables buttons while an operation is in progress', async () => {
    const onUpdate = vi.fn().mockImplementation(
      () => new Promise(() => { /* never resolves */ })
    )
    render(
      <SampleAnalysisEditor
        sample={{ ...SAMPLE_WITHOUT_ANALYSIS, bpm: 140 }}
        onClose={vi.fn()}
        onUpdate={onUpdate}
        onReanalyze={vi.fn()}
      />
    )

    const bpmInput = screen.getByRole('spinbutton', { name: 'Sample BPM' })
    fireEvent.change(bpmInput, { target: { value: '128' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save overrides' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save overrides' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Analyze blank fields' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    })
  })

  it('calls onUpdate with overridden BPM and closes on success', async () => {
    const onClose = vi.fn()
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    render(
      <SampleAnalysisEditor
        sample={SAMPLE_WITHOUT_ANALYSIS}
        onClose={onClose}
        onUpdate={onUpdate}
        onReanalyze={vi.fn()}
      />
    )

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Sample BPM' }), { target: { value: '128' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save overrides' }))

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith(SAMPLE_WITHOUT_ANALYSIS, { bpm: 128 })
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('calls onUpdate with overridden musical key', async () => {
    const onClose = vi.fn()
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    render(
      <SampleAnalysisEditor
        sample={SAMPLE_WITHOUT_ANALYSIS}
        onClose={onClose}
        onUpdate={onUpdate}
        onReanalyze={vi.fn()}
      />
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'Sample musical key' }), { target: { value: 'Cm' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save overrides' }))

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith(SAMPLE_WITHOUT_ANALYSIS, { musicalKey: 'Cm' })
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('calls onUpdate with overridden sample type', async () => {
    const onClose = vi.fn()
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    render(
      <SampleAnalysisEditor
        sample={SAMPLE_WITHOUT_ANALYSIS}
        onClose={onClose}
        onUpdate={onUpdate}
        onReanalyze={vi.fn()}
      />
    )

    fireEvent.change(screen.getByRole('combobox', { name: 'Sample type' }), { target: { value: 'Kick' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save overrides' }))

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith(SAMPLE_WITHOUT_ANALYSIS, { sampleType: 'Kick' })
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('shows save error without closing the editor', async () => {
    const onClose = vi.fn()
    const onUpdate = vi.fn().mockRejectedValue(new Error('Save failed'))
    render(
      <SampleAnalysisEditor
        sample={SAMPLE_WITHOUT_ANALYSIS}
        onClose={onClose}
        onUpdate={onUpdate}
        onReanalyze={vi.fn()}
      />
    )

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Sample BPM' }), { target: { value: '128' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save overrides' }))

    expect(await screen.findByText('Save failed')).toBeVisible()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onReanalyze and closes on success', async () => {
    const onClose = vi.fn()
    const onReanalyze = vi.fn().mockResolvedValue(undefined)
    render(
      <SampleAnalysisEditor
        sample={SAMPLE_WITHOUT_ANALYSIS}
        onClose={onClose}
        onUpdate={vi.fn()}
        onReanalyze={onReanalyze}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Analyze blank fields' }))

    await waitFor(() => {
      expect(onReanalyze).toHaveBeenCalledWith(SAMPLE_WITHOUT_ANALYSIS)
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('clears a previously set value to null in the patch', async () => {
    const onClose = vi.fn()
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    render(
      <SampleAnalysisEditor
        sample={{ ...SAMPLE_WITHOUT_ANALYSIS, bpm: 140, musicalKey: 'Am', sampleType: 'Kick' }}
        onClose={onClose}
        onUpdate={onUpdate}
        onReanalyze={vi.fn()}
      />
    )

    // Clear BPM by setting to empty
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Sample BPM' }), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save overrides' }))

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ bpm: 140, musicalKey: 'Am', sampleType: 'Kick' }),
        { bpm: null }
      )
    })
  })
})
