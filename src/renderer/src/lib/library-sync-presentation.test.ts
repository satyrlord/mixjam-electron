import { describe, expect, it } from 'vitest'
import { getLibrarySyncPresentation } from './library-sync-presentation'

describe('getLibrarySyncPresentation', () => {
  it('exposes active capabilities and preparation copy from one lifecycle state', () => {
    expect(getLibrarySyncPresentation({ status: 'syncing', rootKey: 'samples', jobId: 'job', hasUsableIndex: true, phase: 2, found: 3, processed: 1, total: 3 }))
      .toEqual(expect.objectContaining({ active: true, canCancel: true, canRetry: false, hasStatus: true, preparationMessage: 'Available when library sync finishes.' }))
  })

  it('only enables retry when failure leaves no browseable index', () => {
    expect(getLibrarySyncPresentation({ status: 'error', rootKey: 'samples', message: 'nope', hasUsableIndex: false }).canRetry).toBe(true)
    expect(getLibrarySyncPresentation({ status: 'cancelled', rootKey: 'samples', hasUsableIndex: true }).canRetry).toBe(false)
  })
})
