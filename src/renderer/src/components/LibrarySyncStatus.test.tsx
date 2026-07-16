import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import LibrarySyncStatus from './LibrarySyncStatus'

describe('LibrarySyncStatus', () => {
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
})
