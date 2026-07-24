import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MixJamGeneratorDialog from './MixJamGeneratorDialog'
import type { MixJamGeneratorParameters, MixJamGeneratorReadiness } from '../../../shared/backend-api'
import { MIXJAM_GENERATOR_INTENSITIES } from '../../../shared/backend-api'
import {
  MIXJAM_GENERATOR_DEFAULT_PROFILE_ID,
  MIXJAM_GENERATOR_PROFILE_IDS
} from '../../../shared/generator-templates'

const READY: MixJamGeneratorReadiness = {
  status: 'ready',
  analysisState: 'resolved',
  detectedBpm: 130,
  eligibleSamples: 12,
  tempoClusters: [{
    relpathPrefix: '', sampleCount: 12, bpm: 130, musicalKey: 'Am', confidence: 0.95
  }]
}

function renderDialog(overrides: Partial<Parameters<typeof MixJamGeneratorDialog>[0]> = {}) {
  const onGenerate = vi.fn()
  const onClose = vi.fn()
  const onOpenResult = vi.fn()
  const view = render(
    <MixJamGeneratorDialog
      open={true}
      readiness={READY}
      generating={false}
      result={null}
      error={null}
      onClose={onClose}
      onGenerate={onGenerate}
      onOpenResult={onOpenResult}
      {...overrides}
    />
  )
  return { ...view, onGenerate, onClose, onOpenResult }
}

describe('MixJamGeneratorDialog', () => {
  it('blocks Player shortcuts while open and restores focus when closed', () => {
    const opener = document.createElement('button')
    opener.textContent = 'Open generator'
    document.body.append(opener)
    opener.focus()

    const { rerender } = renderDialog()
    expect(document.body.dataset.mixjamModalBlocking).toBe('1')

    rerender(
      <MixJamGeneratorDialog
        open={false}
        readiness={READY}
        generating={false}
        result={null}
        error={null}
        onClose={vi.fn()}
        onGenerate={vi.fn()}
        onOpenResult={vi.fn()}
      />
    )

    expect(document.body.dataset.mixjamModalBlocking).toBeUndefined()
    expect(opener).toHaveFocus()
    opener.remove()
  })

  it('renders the six shipped profiles in registry order with Techno selected', () => {
    renderDialog()
    const select = screen.getByLabelText<HTMLSelectElement>('Profile')
    const options = [...select.querySelectorAll('option')]
    expect(options).toHaveLength(MIXJAM_GENERATOR_PROFILE_IDS.length)
    expect(options.map((option) => option.value)).toEqual([
      'techno',
      'trance',
      'house',
      'tropical-house',
      'ambient-house',
      'melodic-techno'
    ])
    expect(options.map((option) => option.textContent)).toEqual([
      'Techno',
      'Trance',
      'House',
      'Tropical House',
      'Ambient House',
      'Melodic Techno'
    ])
    expect(select).toHaveValue(MIXJAM_GENERATOR_DEFAULT_PROFILE_ID)
  })

  it('renders all intensity options from constants', () => {
    renderDialog()
    const select = screen.getByLabelText('Intensity')
    expect(select.querySelectorAll('option')).toHaveLength(MIXJAM_GENERATOR_INTENSITIES.length)
  })

  it('disables generate when seed is invalid', () => {
    renderDialog()
    const seedInput = screen.getByLabelText('Seed')
    fireEvent.change(seedInput, { target: { value: 'bad seed!' } })
    expect(screen.getByRole('button', { name: 'Generate and Save' })).toBeDisabled()
  })

  it('enables generate when seed is valid and readiness is ready', () => {
    renderDialog()
    const seedInput = screen.getByLabelText('Seed')
    fireEvent.change(seedInput, { target: { value: 'valid-seed_42' } })
    expect(screen.getByRole('button', { name: 'Generate and Save' })).toBeEnabled()
  })

  it('resets parameters when initialParameters changes while open', () => {
    const initial: MixJamGeneratorParameters = {
      profileId: 'trance',
      bpmMode: 'fixed',
      bpm: 128,
      intensity: 'high',
      durationSeconds: 240,
      seed: 'trance-seed'
    }
    const { rerender } = renderDialog({ initialParameters: initial })

    const seedInput = screen.getByLabelText('Seed')
    expect(seedInput).toHaveValue('trance-seed')

    const next: MixJamGeneratorParameters = {
      ...initial,
      seed: 'updated-seed',
      intensity: 'low'
    }
    rerender(
      <MixJamGeneratorDialog
        open={true}
        readiness={READY}
        initialParameters={next}
        generating={false}
        result={null}
        error={null}
        onClose={vi.fn()}
        onGenerate={vi.fn()}
        onOpenResult={vi.fn()}
      />
    )

    expect(screen.getByLabelText('Seed')).toHaveValue('updated-seed')
    expect(screen.getByLabelText('Intensity')).toHaveValue('low')
  })

  it('resets edited parameters when a new-generator dialog is reopened', () => {
    const props = {
      readiness: READY,
      generating: false,
      result: null,
      error: null,
      onClose: vi.fn(),
      onGenerate: vi.fn(),
      onOpenResult: vi.fn()
    }
    const { rerender } = render(<MixJamGeneratorDialog open={true} {...props} />)
    fireEvent.change(screen.getByLabelText('Seed'), { target: { value: 'edited-seed' } })

    rerender(<MixJamGeneratorDialog open={false} {...props} />)
    rerender(<MixJamGeneratorDialog open={true} {...props} />)

    expect(screen.getByLabelText('Seed')).not.toHaveValue('edited-seed')
    expect(screen.getByLabelText('Profile')).toHaveValue('techno')
    expect(screen.getByLabelText('Intensity')).toHaveValue('medium')
  })

  it('calls onGenerate with current parameters when submitted', async () => {
    const onGenerate = vi.fn()
    renderDialog({ onGenerate, initialParameters: { profileId: 'house', bpmMode: 'follow-detected', intensity: 'medium', durationSeconds: 180, seed: 'house-seed' } })

    fireEvent.click(screen.getByRole('button', { name: 'Generate and Save' }))

    await waitFor(() => {
      expect(onGenerate).toHaveBeenCalledWith(expect.objectContaining({ seed: 'house-seed' }))
    })
  })

  it('shows result and open button when generation completes', () => {
    renderDialog({ result: { path: 'club-night.mixjam', summary: 'Summary text' } })
    expect(screen.getByRole('button', { name: 'Open in Player' })).toBeEnabled()
    expect(screen.getByText('Summary text')).toBeInTheDocument()
  })

  it('shows cancellable typed progress while planning', () => {
    renderDialog({ generating: true })
    expect(screen.getByRole('heading', { name: 'Arranging song' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel generation' })).toBeEnabled()
  })

  it('routes the close button through planning cancellation', async () => {
    const { onClose } = renderDialog({ generating: true })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  })

  it('routes Escape through planning cancellation', async () => {
    const { onClose } = renderDialog({ generating: true })
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  })

  it('routes backdrop dismissal through planning cancellation', () => {
    const { container, onClose } = renderDialog({ generating: true })
    const overlay = container.ownerDocument.querySelector('.mixjam-dialog-overlay')!
    fireEvent.pointerDown(overlay)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('disables cancellation once the transactional save starts', () => {
    const { container, onClose } = renderDialog({ generating: true, saving: true })
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled()
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.pointerDown(container.ownerDocument.querySelector('.mixjam-dialog-overlay')!)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('edits every parameter and generates a fixed-BPM request', () => {
    const { onGenerate } = renderDialog()
    fireEvent.change(screen.getByLabelText('Profile'), { target: { value: 'house' } })
    fireEvent.change(screen.getByLabelText('BPM source'), { target: { value: 'fixed' } })
    fireEvent.change(screen.getByLabelText('BPM'), { target: { value: '125' } })
    fireEvent.change(screen.getByLabelText('Intensity'), { target: { value: 'high' } })
    fireEvent.change(screen.getByLabelText('Duration (seconds)'), { target: { value: '300' } })
    fireEvent.change(screen.getByLabelText('Seed'), { target: { value: 'fixed-seed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generate and Save' }))
    expect(onGenerate).toHaveBeenCalledWith({
      profileId: 'house', bpmMode: 'fixed', bpm: 125,
      intensity: 'high', durationSeconds: 300, seed: 'fixed-seed', tempoClusterPrefix: ''
    })
  })

  it('requires an explicit analyzer group for a mixed Sample Folder', () => {
    const onGenerate = vi.fn()
    const readiness: MixJamGeneratorReadiness = {
      status: 'ready',
      analysisState: 'mixed',
      detectedBpm: null,
      eligibleSamples: 20,
      tempoClusters: [
        { relpathPrefix: 'Dance', sampleCount: 8, bpm: 140, musicalKey: 'Am', confidence: 0.9 },
        { relpathPrefix: 'Techno', sampleCount: 12, bpm: 128, musicalKey: 'Cm', confidence: 0.92 }
      ]
    }
    renderDialog({ readiness, onGenerate })

    expect(screen.getByRole('button', { name: 'Generate and Save' })).toBeDisabled()
    expect(screen.getByRole('option', { name: /Techno.*92% confidence/ })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Analyzer group'), { target: { value: 'Techno' } })
    expect(screen.getByRole('button', { name: 'Generate and Save' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Generate and Save' }))
    expect(onGenerate).toHaveBeenCalledWith(expect.objectContaining({ tempoClusterPrefix: 'Techno' }))
  })

  it('clears a saved analyzer group that is absent from refreshed readiness', async () => {
    const readiness: MixJamGeneratorReadiness = {
      status: 'ready',
      analysisState: 'mixed',
      detectedBpm: null,
      eligibleSamples: 8,
      tempoClusters: [
        { relpathPrefix: 'Dance', sampleCount: 8, bpm: 140, musicalKey: 'Am', confidence: 0.9 }
      ]
    }
    renderDialog({
      readiness,
      initialParameters: {
        profileId: 'techno', bpmMode: 'follow-detected', bpm: 140,
        intensity: 'medium', durationSeconds: 180, seed: 'saved-seed', tempoClusterPrefix: 'Techno'
      }
    })

    await waitFor(() => expect(screen.getByLabelText('Analyzer group')).toHaveValue('__unselected__'))
    expect(screen.getByRole('button', { name: 'Generate and Save' })).toBeDisabled()
  })

  it('requires Fixed BPM when the analyzer has no confident tempo', () => {
    const readiness: MixJamGeneratorReadiness = {
      status: 'ready',
      analysisState: 'resolved',
      detectedBpm: null,
      eligibleSamples: 12,
      tempoClusters: []
    }
    renderDialog({ readiness })

    expect(screen.getByRole('button', { name: 'Generate and Save' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('BPM source'), { target: { value: 'fixed' } })
    expect(screen.getByRole('button', { name: 'Generate and Save' })).toBeEnabled()
  })

  it('creates a safe random seed', () => {
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      ;(array as Uint8Array).fill(15)
      return array
    })
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'New' }))
    expect(screen.getByLabelText('Seed')).toHaveValue('0f0f0f0f0f0f0f0f')
  })

  it('shows readiness checking, blocked readiness, and errors', () => {
    const { rerender } = renderDialog({ readiness: null, error: 'Generation failed' })
    expect(screen.getByText('Checking library…')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Generation failed')
    expect(screen.getByRole('button', { name: 'Generate and Save' })).toBeDisabled()
    rerender(<MixJamGeneratorDialog
      open readiness={{ status: 'needs-preparation', message: 'Analyze samples first' }}
      generating={false} result={null} error={null}
      onClose={vi.fn()} onGenerate={vi.fn()} onOpenResult={vi.fn()}
    />)
    expect(screen.getByText('Analyze samples first')).toBeInTheDocument()
  })

  it('runs result actions', () => {
    const { onOpenResult, onClose } = renderDialog({
      result: { path: 'club-night.mixjam', summary: 'Summary text' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Open in Player' }))
    expect(onOpenResult).toHaveBeenCalledWith('club-night.mixjam')
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalled()
  })

  it.each([
    ['shortlisting', 'Shortlisting samples'],
    ['analyzing', 'Analyzing samples'],
    ['arranging', 'Arranging song']
  ] as const)('renders %s progress with counts', (phase, heading) => {
    renderDialog({ generating: true, progress: {
      identity: { rootKey: 'samples', jobId: 'job' }, status: 'running', phase, completed: 2, total: 5
    } })
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
    expect(screen.getByText('2 of 5')).toBeInTheDocument()
  })

  it('renders preparing and saving progress copy', () => {
    const { rerender } = renderDialog({
      generating: true, progress: {
        identity: { rootKey: 'samples', jobId: 'job' }, status: 'running',
        phase: 'arranging', completed: 0, total: 0
      }
    })
    expect(screen.getByText('Preparing the musical plan.')).toBeInTheDocument()
    rerender(<MixJamGeneratorDialog
      open readiness={READY} generating saving result={null} error={null}
      onClose={vi.fn()} onGenerate={vi.fn()} onOpenResult={vi.fn()}
    />)
    expect(screen.getByRole('heading', { name: 'Saving project' })).toBeInTheDocument()
    expect(screen.getByText('The project is being committed to your User Folder.')).toBeInTheDocument()
  })

  it('calls Cancel from the parameter form', () => {
    const { onClose } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
