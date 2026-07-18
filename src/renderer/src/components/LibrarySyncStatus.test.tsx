import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import LibrarySyncStatus from './LibrarySyncStatus'

describe('LibrarySyncStatus', () => {
  it('hides unavailable state and optionally hides ready state', () => {
    const { rerender } = render(<LibrarySyncStatus state={{ status: 'unavailable' }} />)
    expect(document.querySelector('.library-sync-status')).toBeNull()
    rerender(<LibrarySyncStatus state={{ status: 'ready', rootKey: 'samples', lastCompletedAt: 4 }} showReady={false} />)
    expect(document.querySelector('.library-sync-status')).toBeNull()
  })

  it('renders unindexed, checking, and ready states', () => {
    const { rerender } = render(<LibrarySyncStatus state={{ status: 'unindexed', rootKey: 'samples' }} />)
    expect(screen.getByText('Library not indexed')).toBeInTheDocument()
    rerender(<LibrarySyncStatus state={{ status: 'checking', rootKey: 'samples', jobId: 'checking' }} />)
    expect(screen.getByText('Checking library')).toBeInTheDocument()
    rerender(<LibrarySyncStatus state={{ status: 'ready', rootKey: 'samples', lastCompletedAt: 3 }} />)
    expect(screen.getByText('Library ready')).toBeInTheDocument()
  })
  it('shows determinate file progress and supports cancellation', () => {
    const onCancel = vi.fn()
    render(
      <LibrarySyncStatus
        state={{
          status: 'syncing',
          rootKey: 'samples',
          jobId: 'job-1',
          hasUsableIndex: true,
          phase: 2,
          found: 20,
          processed: 5,
          total: 20
        }}
        onCancel={onCancel}
      />
    )

    expect(screen.getByText('Reading metadata')).toBeInTheDocument()
    expect(screen.getByText('5 of 20 files')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '5')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('uses indeterminate native progress until a total is known', () => {
    render(
      <LibrarySyncStatus
        state={{
          status: 'syncing',
          rootKey: 'samples',
          jobId: 'job-1',
          hasUsableIndex: false,
          phase: 1,
          found: 0,
          processed: 0,
          total: 0
        }}
      />
    )

    expect(screen.getByRole('progressbar')).not.toHaveAttribute('value')
    expect(screen.getByText('Preparing file list')).toBeInTheDocument()
  })

  it('shows found-file progress and the generic phase label', () => {
    render(<LibrarySyncStatus state={{
      status: 'syncing', rootKey: 'samples', jobId: 'job-2', hasUsableIndex: false,
      phase: null, found: 7, processed: -2, total: 0
    }} />)
    expect(screen.getByText('Syncing library')).toBeInTheDocument()
    expect(screen.getByText('7 files found')).toBeInTheDocument()
  })

  it('renders determinate and compact preparing analysis states', () => {
    const { rerender } = render(<LibrarySyncStatus state={{
      status: 'analyzing', rootKey: 'samples', jobId: 'a', lastCompletedAt: 1, analyzed: 12, total: 10
    }} />)
    expect(screen.getByText('12 of 10 samples')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '10')
    rerender(<LibrarySyncStatus compact state={{
      status: 'analyzing', rootKey: 'samples', jobId: 'b', lastCompletedAt: 1, analyzed: 0, total: 0
    }} />)
    expect(screen.queryByText('Preparing analysis')).toBeNull()
    expect(document.querySelector('.library-sync-compact')).toBeTruthy()
  })

  it('offers Retry only when a cancelled or failed first sync has no usable index', () => {
    const onRetry = vi.fn()
    const { rerender } = render(
      <LibrarySyncStatus
        state={{ status: 'cancelled', rootKey: 'samples', hasUsableIndex: false }}
        onRetry={onRetry}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Retry library sync' }))
    expect(onRetry).toHaveBeenCalledTimes(1)

    rerender(
      <LibrarySyncStatus
        state={{
          status: 'error',
          rootKey: 'samples',
          message: 'Drive unavailable',
          hasUsableIndex: true
        }}
        onRetry={onRetry}
      />
    )
    expect(screen.queryByRole('button', { name: 'Retry library sync' })).toBeNull()
    expect(screen.getByText('Drive unavailable')).toBeInTheDocument()
  })

  it('describes cancellation with an index and retries an unusable error', () => {
    const onRetry = vi.fn()
    const { rerender } = render(<LibrarySyncStatus
      state={{ status: 'cancelled', rootKey: 'samples', hasUsableIndex: true }} onRetry={onRetry}
    />)
    expect(screen.getByText('Existing samples are still available.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
    rerender(<LibrarySyncStatus
      state={{ status: 'error', rootKey: 'samples', message: 'No index', hasUsableIndex: false }} onRetry={onRetry}
    />)
    fireEvent.click(screen.getByRole('button', { name: 'Retry library sync' }))
    expect(onRetry).toHaveBeenCalledOnce()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
