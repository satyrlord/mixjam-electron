import { useCallback, useEffect, useRef, useState } from 'react'
import type { BackendAPI, FolderRef, FolderRole, SessionPaths } from '../../../shared/backend-api'

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

interface SessionState {
  user: FolderView
  sample: FolderView
}

const EMPTY: FolderView = { ref: null, status: 'empty' }
const INITIAL: SessionState = { user: EMPTY, sample: EMPTY }

function setFolder(state: SessionState, role: FolderRole, folder: FolderView): SessionState {
  return role === 'user' ? { ...state, user: folder } : { ...state, sample: folder }
}

function toPaths(state: SessionState): SessionPaths {
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

async function restoreState(backendAPI: BackendAPI): Promise<SessionState> {
  const session = await backendAPI.loadSession()
  const [user, sample] = await Promise.all([
    session.userFolder
      ? restoreFolder(backendAPI, session.userFolder, 'user')
      : Promise.resolve(EMPTY),
    session.sampleFolder
      ? restoreFolder(backendAPI, session.sampleFolder, 'sample')
      : Promise.resolve(EMPTY)
  ])

  return { user, sample }
}

export interface FolderSession {
  userFolder: FolderView
  sampleFolder: FolderView
  canStart: boolean
  pickUser: () => Promise<void>
  pickSample: () => Promise<void>
  /** Re-requests permission on the stored handle (user gesture required). */
  restoreUser: () => Promise<void>
  restoreSample: () => Promise<void>
}

export function useFolderSession(backendAPI: BackendAPI): FolderSession {
  const [state, setState] = useState<SessionState>(INITIAL)
  const stateRef = useRef(INITIAL)

  const commitState = useCallback((next: SessionState) => {
    stateRef.current = next
    setState(next)
  }, [])

  useEffect(() => {
    let active = true

    void restoreState(backendAPI).then((next) => {
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
      if (validation === 'ok') void backendAPI.saveSession(toPaths(next))
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
      if (card.status === 'set') void backendAPI.saveSession(toPaths(next))
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
