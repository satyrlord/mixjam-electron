import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SampleListItem } from '../../../shared/backend-api'
import SampleAnalysisEditor from './SampleAnalysisEditor'

const SAMPLE_WITHOUT_ANALYSIS: SampleListItem = {
  id: 'sample.wav',
  dbId: 1,
  name: 'sample.wav',
  relpath: 'sample.wav',
  category: 'Unsorted',
  durationSeconds: 1,
  bpm: null,
  bpmSource: null,
  musicalKey: null,
  musicalKeySource: null,
  sampleType: null,
  sampleTypeSource: null,
  tags: [],
  categoryId: null,
  tagIds: []
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
})
