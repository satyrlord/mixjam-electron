import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SampleAnalysisManagement from './SampleAnalysisManagement'

const IDLE = { identity: null, status: 'idle', analyzed: 0, total: 0 } as const

describe('SampleAnalysisManagement', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('requires explicit confirmation before starting calibration', () => {
    const onStart = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(
      <SampleAnalysisManagement
        librarySyncState={{ status: 'ready', rootKey: 'samples', lastCompletedAt: 1 }}
        progress={IDLE}
        onStart={onStart}
        onCancel={vi.fn()}
      />
    )

    fireEvent.click(screen.getByText('Analysis'))
    fireEvent.click(screen.getByRole('button', { name: 'Start Uniform Folder Calibration' }))
    expect(onStart).not.toHaveBeenCalled()

    vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Start Uniform Folder Calibration' }))
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('keeps calibration separate and disabled while library sync is active', () => {
    render(
      <SampleAnalysisManagement
        librarySyncState={{
          status: 'syncing',
          rootKey: 'samples',
          jobId: 'sync-1',
          hasUsableIndex: true,
          phase: 1,
          found: 10,
          processed: 2,
          total: 10
        }}
        progress={IDLE}
        onStart={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    fireEvent.click(screen.getByText('Analysis'))
    expect(screen.getByRole('button', {
      name: 'Start Uniform Folder Calibration'
    })).toBeDisabled()
  })

  it('reports calibration progress and cancels its own job', () => {
    const onCancel = vi.fn()
    render(
      <SampleAnalysisManagement
        librarySyncState={{ status: 'ready', rootKey: 'samples', lastCompletedAt: 1 }}
        progress={{
          identity: { rootKey: 'samples', jobId: 'calibration-1' },
          status: 'calibrating',
          analyzed: 5,
          total: 20
        }}
        onStart={vi.fn()}
        onCancel={onCancel}
      />
    )

    fireEvent.click(screen.getByText('Analysis'))
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '5')
    expect(screen.getByText('5 of 20 samples')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel calibration' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('reports indeterminate calibration progress while preparing', () => {
    render(
      <SampleAnalysisManagement
        librarySyncState={{ status: 'ready', rootKey: 'samples', lastCompletedAt: 1 }}
        progress={{
          identity: { rootKey: 'samples', jobId: 'calibration-1' },
          status: 'calibrating',
          analyzed: 0,
          total: 0
        }}
        onStart={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    fireEvent.click(screen.getByText('Analysis'))
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('value')
    expect(screen.getByText('Preparing calibration')).toBeInTheDocument()
  })

  it('reports cancellation and falls back to a generic failure message', () => {
    const props = {
      librarySyncState: { status: 'cancelled', rootKey: 'samples', hasUsableIndex: false } as const,
      onStart: vi.fn(),
      onCancel: vi.fn()
    }
    const { rerender } = render(
      <SampleAnalysisManagement
        {...props}
        progress={{ identity: null, status: 'cancelled', analyzed: 0, total: 0 }}
      />
    )

    fireEvent.click(screen.getByText('Analysis'))
    expect(screen.getByText('Calibration cancelled.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start Uniform Folder Calibration' })).toBeDisabled()

    rerender(
      <SampleAnalysisManagement
        {...props}
        progress={{ identity: null, status: 'error', analyzed: 0, total: 0 }}
      />
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Calibration failed.')
  })
})
