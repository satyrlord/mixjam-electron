import { useCallback, useEffect, useRef, useState } from 'react'
import type { ElectronAPI, FolderRole, SessionPaths } from '../../../shared/ipc'

export type FolderCardStatus = 'empty' | 'set' | 'pick-error' | 'restore-error'

export interface FolderView {
  path: string | null
  status: FolderCardStatus
}

interface SessionState {
  user: FolderView
  sample: FolderView
}

const EMPTY: FolderView = { path: null, status: 'empty' }
const INITIAL: SessionState = { user: EMPTY, sample: EMPTY }

function setFolder(state: SessionState, role: FolderRole, folder: FolderView): SessionState {
  return role === 'user' ? { ...state, user: folder } : { ...state, sample: folder }
}

function toPaths(state: SessionState): SessionPaths {
  return {
    userFolder: state.user.status === 'set' ? state.user.path : null,
    sampleFolder: state.sample.status === 'set' ? state.sample.path : null
  }
}

async function restoreFolder(
  electronAPI: ElectronAPI,
  path: string,
  role: FolderRole
): Promise<FolderView> {
  const ok = await electronAPI.validateFolder(path, role)
  return { path, status: ok ? 'set' : 'restore-error' }
}

async function restoreState(electronAPI: ElectronAPI): Promise<SessionState> {
  const session = await electronAPI.loadSession()
  const [user, sample] = await Promise.all([
    session.userFolder ? restoreFolder(electronAPI, session.userFolder, 'user') : Promise.resolve(EMPTY),
    session.sampleFolder
      ? restoreFolder(electronAPI, session.sampleFolder, 'sample')
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
}

export function useFolderSession(electronAPI: ElectronAPI): FolderSession {
  const [state, setState] = useState<SessionState>(INITIAL)
  const stateRef = useRef(INITIAL)

  const commitState = useCallback((next: SessionState) => {
    stateRef.current = next
    setState(next)
  }, [])

  useEffect(() => {
    let active = true

    void restoreState(electronAPI).then((next) => {
      if (active) {
        commitState(next)
      }
    })

    return () => {
      active = false
    }
  }, [commitState, electronAPI])

  const pick = useCallback(
    async (role: FolderRole) => {
      const path = await electronAPI.pickFolder(role)
      if (path === null) return
      const ok = await electronAPI.validateFolder(path, role)
      const card: FolderView = { path, status: ok ? 'set' : 'pick-error' }
      const next = setFolder(stateRef.current, role, card)
      commitState(next)
      if (ok) void electronAPI.saveSession(toPaths(next))
    },
    [commitState, electronAPI]
  )

  const pickUser = useCallback(() => pick('user'), [pick])
  const pickSample = useCallback(() => pick('sample'), [pick])

  return {
    userFolder: state.user,
    sampleFolder: state.sample,
    canStart: state.user.status === 'set' && state.sample.status === 'set',
    pickUser,
    pickSample
  }
}
