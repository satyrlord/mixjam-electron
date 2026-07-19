import type { LibrarySyncState } from '../../../shared/backend-api'

export interface LibrarySyncPresentation {
  active: boolean
  canCancel: boolean
  canRetry: boolean
  hasStatus: boolean
  preparationMessage: string | null
}

/** Shared UI capabilities derived from library lifecycle state. Copy remains local to each view. */
export function getLibrarySyncPresentation(state: LibrarySyncState): LibrarySyncPresentation {
  const active = state.status === 'checking' || state.status === 'syncing' || state.status === 'analyzing'
  return {
    active,
    canCancel: active,
    canRetry: (state.status === 'cancelled' || state.status === 'error') && !state.hasUsableIndex,
    hasStatus: state.status !== 'unavailable',
    preparationMessage: state.status === 'checking'
      ? 'Available when the library check finishes.'
      : state.status === 'syncing'
        ? 'Available when library sync finishes.'
        : state.status === 'analyzing'
          ? 'Available when library analysis finishes.'
          : null
  }
}
