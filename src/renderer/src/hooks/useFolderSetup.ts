import { useCallback, useEffect, useRef, useState } from 'react'
import type { BackendAPI, FolderRef, FolderRole, FolderSelections } from '../../../shared/backend-api'

export type FolderCardStatus =
  | 'empty'
  | 'set'
  | 'pick-error'
  | 'restore-error'
  // The stored handle exists but needs a user-gesture permission re-grant
  // (browser host only — the Electron shell auto-grants file system access).
  | 'needs-permission'

export interface FolderView {
  ref: FolderRef | null
  status: FolderCardStatus
}

interface FolderSetupState {
  user: FolderView
  sample: FolderView
}

const EMPTY: FolderView = { ref: null, status: 'empty' }
const INITIAL: FolderSetupState = { user: EMPTY, sample: EMPTY }

function setFolder(state: FolderSetupState, role: FolderRole, folder: FolderView): FolderSetupState {
  return role === 'user' ? { ...state, user: folder } : { ...state, sample: folder }
}

function toFolderSelections(state: FolderSetupState): FolderSelections {
  return {
    userFolder: state.user.status === 'set' ? state.user.ref : null,
    sampleFolder: state.sample.status === 'set' ? state.sample.ref : null
  }
}

async function restoreFolder(
  backendAPI: BackendAPI,
  ref: FolderRef,
  role: FolderRole
): Promise<FolderView> {
  const validation = await backendAPI.validateFolder(ref, role)
  if (validation === 'ok') return { ref, status: 'set' }
  if (validation === 'needs-permission') return { ref, status: 'needs-permission' }
  return { ref, status: 'restore-error' }
}

async function restoreFolderSetup(backendAPI: BackendAPI): Promise<FolderSetupState> {
  const selections = await backendAPI.loadFolderSelections()
  const [user, sample] = await Promise.all([
    selections.userFolder
      ? restoreFolder(backendAPI, selections.userFolder, 'user')
      : Promise.resolve(EMPTY),
    selections.sampleFolder
      ? restoreFolder(backendAPI, selections.sampleFolder, 'sample')
      : Promise.resolve(EMPTY)
  ])

  return { user, sample }
}

export interface FolderSetup {
  userFolder: FolderView
  sampleFolder: FolderView
  canStart: boolean
  pickUser: () => Promise<void>
  pickSample: () => Promise<void>
  /** Re-requests permission on the stored handle (user gesture required). */
  restoreUser: () => Promise<void>
  restoreSample: () => Promise<void>
}

export function useFolderSetup(backendAPI: BackendAPI): FolderSetup {
  const [state, setState] = useState<FolderSetupState>(INITIAL)
  const stateRef = useRef(INITIAL)

  const commitState = useCallback((next: FolderSetupState) => {
    stateRef.current = next
    setState(next)
  }, [])

  useEffect(() => {
    let active = true

    void restoreFolderSetup(backendAPI).then((next) => {
      if (active) {
        commitState(next)
      }
    })

    return () => {
      active = false
    }
  }, [commitState, backendAPI])

  const pick = useCallback(
    async (role: FolderRole) => {
      const ref = await backendAPI.pickFolder(role)
      if (ref === null) return
      const validation = await backendAPI.validateFolder(ref, role)
      const card: FolderView = { ref, status: validation === 'ok' ? 'set' : 'pick-error' }
      const next = setFolder(stateRef.current, role, card)
      commitState(next)
      if (validation === 'ok') void backendAPI.saveFolderSelections(toFolderSelections(next))
    },
    [commitState, backendAPI]
  )

  const restore = useCallback(
    async (role: FolderRole) => {
      const current = role === 'user' ? stateRef.current.user : stateRef.current.sample
      if (!current.ref || current.status !== 'needs-permission') return
      const granted = await backendAPI.requestFolderAccess(current.ref, role)
      const card: FolderView = granted
        ? await restoreFolder(backendAPI, current.ref, role)
        : { ref: current.ref, status: 'needs-permission' }
      const next = setFolder(stateRef.current, role, card)
      commitState(next)
      if (card.status === 'set') void backendAPI.saveFolderSelections(toFolderSelections(next))
    },
    [commitState, backendAPI]
  )

  const pickUser = useCallback(() => pick('user'), [pick])
  const pickSample = useCallback(() => pick('sample'), [pick])
  const restoreUser = useCallback(() => restore('user'), [restore])
  const restoreSample = useCallback(() => restore('sample'), [restore])

  return {
    userFolder: state.user,
    sampleFolder: state.sample,
    canStart: state.user.status === 'set' && state.sample.status === 'set',
    pickUser,
    pickSample,
    restoreUser,
    restoreSample
  }
}
