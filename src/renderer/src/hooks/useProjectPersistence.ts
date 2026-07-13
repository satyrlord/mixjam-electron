import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BackendAPI, FolderRef, MixJamFileContents } from '../../../shared/backend-api'
import type { LaneState } from '../lib/arrangement'
import { createDefaultLanes } from '../lib/arrangement'
import type { ChannelState } from './useMixer'
import { createDefaultChannels } from './useMixer'
import { DEFAULT_BPM, DEFAULT_MASTER_GAIN } from './useTransportEngine'
import {
  parseProject,
  projectFingerprint,
  serializeProject,
  type ProjectData,
  type ProjectDocument
} from '../project/project-file'
import { useSyncedRef } from './useSyncedRef'

interface ProjectMetadata {
  path: string | null
  displayName: string
  createdAt: string | null
  modifiedAt: string | null
}

export interface ProjectPersistenceState {
  projectPath: string | null
  projectName: string
  projectDirty: boolean
  projectBusy: boolean
  projectError: string | null
  projectWarning: string | null
  projectMissingSamplePaths: ReadonlySet<string>
}

export interface ProjectPersistenceActions {
  beginNewProject: () => void
  openProjectPicker: () => Promise<boolean>
  openProjectPath: (projectRelpath: string) => Promise<boolean>
  saveProject: () => Promise<boolean>
  saveProjectAs: () => Promise<boolean>
  clearProjectNotice: () => void
}

export type ProjectPersistence = ProjectPersistenceState & ProjectPersistenceActions

interface UseProjectPersistenceParams {
  backendAPI: BackendAPI
  userFolder: FolderRef | null
  sampleFolder: FolderRef | null
  lanes: LaneState[]
  bpm: number
  masterGain: number
  channels: ChannelState[]
  replaceTransportProject: (state: {
    lanes: LaneState[]
    bpm: number
    masterGain: number
  }) => void
  replaceChannels: (channels: ChannelState[]) => void
  reloadMixJamFiles: () => Promise<void>
}

function displayNameForPath(relpath: string): string {
  const filename = relpath.split('/').pop() ?? relpath
  return filename.toLowerCase().endsWith('.mixjam')
    ? filename.slice(0, -'.mixjam'.length)
    : filename
}

function allSampleRefs(project: ProjectData): string[] {
  return project.lanes.flatMap((lane) => lane.placements.map((placement) => placement.samplePath))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function useProjectPersistence({
  backendAPI,
  userFolder,
  sampleFolder,
  lanes,
  bpm,
  masterGain,
  channels,
  replaceTransportProject,
  replaceChannels,
  reloadMixJamFiles
}: UseProjectPersistenceParams): ProjectPersistence {
  const currentProject = useMemo<ProjectData>(() => ({
    song: { bpm, masterGain },
    lanes,
    channels
  }), [bpm, channels, lanes, masterGain])
  const currentFingerprint = useMemo(
    () => projectFingerprint(currentProject),
    [currentProject]
  )
  const currentProjectRef = useSyncedRef(currentProject)

  const [metadata, setMetadata] = useState<ProjectMetadata>({
    path: null,
    displayName: 'Untitled',
    createdAt: null,
    modifiedAt: null
  })
  const metadataRef = useSyncedRef(metadata)
  const [baselineFingerprint, setBaselineFingerprint] = useState(currentFingerprint)
  const [replacementTarget, setReplacementTarget] = useState<string | null>(null)
  const [operation, setOperation] = useState<'idle' | 'loading' | 'saving'>('idle')
  const [projectError, setProjectError] = useState<string | null>(null)
  const [projectWarning, setProjectWarning] = useState<string | null>(null)
  const [projectMissingSamplePaths, setProjectMissingSamplePaths] =
    useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    if (replacementTarget === null || currentFingerprint !== replacementTarget) return
    setBaselineFingerprint(replacementTarget)
    setReplacementTarget(null)
  }, [currentFingerprint, replacementTarget])

  const clearProjectNotice = useCallback(() => {
    setProjectError(null)
    setProjectWarning(null)
  }, [])

  const applyProject = useCallback((document: ProjectDocument, path: string) => {
    const fingerprint = projectFingerprint(document)
    setReplacementTarget(fingerprint)
    setBaselineFingerprint(fingerprint)
    replaceTransportProject({
      lanes: document.lanes,
      bpm: document.song.bpm,
      masterGain: document.song.masterGain
    })
    replaceChannels(document.channels)
    setMetadata({
      path,
      displayName: displayNameForPath(path),
      createdAt: document.createdAt,
      modifiedAt: document.modifiedAt
    })
  }, [replaceChannels, replaceTransportProject])

  const finishOpen = useCallback(async (selection: MixJamFileContents): Promise<boolean> => {
    const document = parseProject(selection.contents)
    if (!sampleFolder) throw new Error('Select a Sample Folder before opening a project.')
    const missing = await backendAPI.findMissingSampleFiles(sampleFolder, allSampleRefs(document))
    await backendAPI.recordRecentProject(selection.path)
    applyProject(document, selection.path)
    const missingSet = new Set(missing)
    setProjectMissingSamplePaths(missingSet)
    setProjectWarning(missing.length === 0
      ? null
      : `${missing.length} referenced sample${missing.length === 1 ? '' : 's'} could not be found. Affected lanes are marked.`)
    await reloadMixJamFiles()
    return true
  }, [applyProject, backendAPI, reloadMixJamFiles, sampleFolder])

  const openProjectPicker = useCallback(async (): Promise<boolean> => {
    if (!userFolder) {
      setProjectError('Select a User Folder before opening a project.')
      return false
    }
    setOperation('loading')
    setProjectError(null)
    setProjectWarning(null)
    try {
      const selection = await backendAPI.openMixJamFile(userFolder)
      return selection ? await finishOpen(selection) : false
    } catch (error) {
      setProjectError(errorMessage(error))
      return false
    } finally {
      setOperation('idle')
    }
  }, [backendAPI, finishOpen, userFolder])

  const openProjectPath = useCallback(async (projectRelpath: string): Promise<boolean> => {
    if (!userFolder) {
      setProjectError('Select a User Folder before opening a project.')
      return false
    }
    setOperation('loading')
    setProjectError(null)
    setProjectWarning(null)
    try {
      return await finishOpen(await backendAPI.readMixJamFile(userFolder, projectRelpath))
    } catch (error) {
      setProjectError(errorMessage(error))
      return false
    } finally {
      setOperation('idle')
    }
  }, [backendAPI, finishOpen, userFolder])

  const commitSavedProject = useCallback(async (
    path: string,
    createdAt: string,
    modifiedAt: string,
    fingerprint: string
  ) => {
    setMetadata({
      path,
      displayName: displayNameForPath(path),
      createdAt,
      modifiedAt
    })
    setBaselineFingerprint(fingerprint)
    setReplacementTarget(null)
    await backendAPI.recordRecentProject(path)
    await reloadMixJamFiles()
  }, [backendAPI, reloadMixJamFiles])

  const saveProjectAs = useCallback(async (): Promise<boolean> => {
    if (!userFolder) {
      setProjectError('Select a User Folder before saving a project.')
      return false
    }
    setOperation('saving')
    setProjectError(null)
    try {
      const now = new Date().toISOString()
      const current = currentProjectRef.current
      const meta = metadataRef.current
      const createdAt = meta.createdAt ?? now
      const contents = serializeProject(current, {
        appVersion: await backendAPI.getVersion(),
        createdAt,
        modifiedAt: now
      })
      const saved = await backendAPI.saveMixJamFileAs(
        userFolder,
        `${meta.displayName || 'Untitled'}.mixjam`,
        contents
      )
      if (!saved) return false
      await commitSavedProject(saved.path, createdAt, now, projectFingerprint(current))
      return true
    } catch (error) {
      setProjectError(errorMessage(error))
      return false
    } finally {
      setOperation('idle')
    }
  }, [backendAPI, commitSavedProject, currentProjectRef, metadataRef, userFolder])

  const saveProject = useCallback(async (): Promise<boolean> => {
    const meta = metadataRef.current
    if (meta.path === null) return saveProjectAs()
    if (!userFolder) {
      setProjectError('Select a User Folder before saving a project.')
      return false
    }
    setOperation('saving')
    setProjectError(null)
    try {
      const now = new Date().toISOString()
      const current = currentProjectRef.current
      const createdAt = meta.createdAt ?? now
      const contents = serializeProject(current, {
        appVersion: await backendAPI.getVersion(),
        createdAt,
        modifiedAt: now
      })
      await backendAPI.writeMixJamFile(userFolder, meta.path, contents)
      await commitSavedProject(meta.path, createdAt, now, projectFingerprint(current))
      return true
    } catch (error) {
      setProjectError(errorMessage(error))
      return false
    } finally {
      setOperation('idle')
    }
  }, [backendAPI, commitSavedProject, currentProjectRef, metadataRef, saveProjectAs, userFolder])

  const beginNewProject = useCallback(() => {
    const project: ProjectData = {
      song: { bpm: DEFAULT_BPM, masterGain: DEFAULT_MASTER_GAIN },
      lanes: createDefaultLanes(),
      channels: createDefaultChannels()
    }
    const fingerprint = projectFingerprint(project)
    setReplacementTarget(fingerprint)
    setBaselineFingerprint(fingerprint)
    replaceTransportProject({
      lanes: project.lanes,
      bpm: project.song.bpm,
      masterGain: project.song.masterGain
    })
    replaceChannels(project.channels)
    setMetadata({
      path: null,
      displayName: 'Untitled',
      createdAt: null,
      modifiedAt: null
    })
    setProjectMissingSamplePaths(new Set())
    setProjectError(null)
    setProjectWarning(null)
  }, [replaceChannels, replaceTransportProject])

  return {
    projectPath: metadata.path,
    projectName: metadata.displayName,
    projectDirty: replacementTarget === null && currentFingerprint !== baselineFingerprint,
    projectBusy: operation !== 'idle' || replacementTarget !== null,
    projectError,
    projectWarning,
    projectMissingSamplePaths,
    beginNewProject,
    openProjectPicker,
    openProjectPath,
    saveProject,
    saveProjectAs,
    clearProjectNotice
  }
}
