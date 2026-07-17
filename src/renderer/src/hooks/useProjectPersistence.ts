import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  BackendAPI,
  FolderRef,
  MixJamFileContents,
  OpenedMixJamFileContents
} from '../../../shared/backend-api'
import { createDefaultLanes } from '../lib/arrangement'
import type { ChannelState } from './useMixer'
import { createDefaultChannels } from './useMixer'
import {
  parseProject,
  projectFingerprint,
  serializeProject,
  type ProjectData,
  type ProjectDocument,
  type ProjectGeneratorMetadata
} from '../project/project-file'
import { useSyncedRef } from './useSyncedRef'
import {
  createDefaultProjectSongState,
  type ProjectSongState,
  type ProjectTransportState
} from '../project/project-state'

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
  projectGenerator: ProjectGeneratorMetadata | null
}

export interface ProjectPersistenceActions {
  beginNewProject: () => void
  openProjectPicker: () => Promise<boolean>
  openProjectPath: (projectRelpath: string) => Promise<boolean>
  saveProject: () => Promise<boolean>
  saveProjectAs: () => Promise<boolean>
  saveGeneratedProject: (project: ProjectData, basename: string) => Promise<string | null>
  clearProjectNotice: () => void
}

export type ProjectPersistence = ProjectPersistenceState & ProjectPersistenceActions

interface UseProjectPersistenceParams {
  backendAPI: BackendAPI
  userFolder: FolderRef | null
  sampleFolder: FolderRef | null
  song: ProjectSongState
  lanes: ProjectTransportState['lanes']
  channels: ChannelState[]
  replaceTransportProject: (state: ProjectTransportState) => void
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
  song,
  channels,
  replaceTransportProject,
  replaceChannels,
  reloadMixJamFiles
}: UseProjectPersistenceParams): ProjectPersistence {
  const [projectGenerator, setProjectGenerator] = useState<ProjectGeneratorMetadata | null>(null)
  const currentProject = useMemo<ProjectData>(() => ({
    song,
    lanes,
    channels,
    ...(projectGenerator === null ? {} : { generator: projectGenerator })
  }), [channels, lanes, projectGenerator, song])
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

  const applyProject = useCallback((
    document: ProjectDocument,
    path: string | null,
    displayName: string
  ) => {
    const fingerprint = projectFingerprint(document)
    setReplacementTarget(fingerprint)
    setBaselineFingerprint(fingerprint)
    replaceTransportProject({
      lanes: document.lanes,
      song: document.song
    })
    replaceChannels(document.channels)
    setMetadata({
      path,
      displayName,
      createdAt: document.createdAt,
      modifiedAt: document.modifiedAt
    })
    setProjectGenerator(document.generator ?? null)
  }, [replaceChannels, replaceTransportProject])

  const finishOpen = useCallback(async (
    selection: MixJamFileContents | OpenedMixJamFileContents
  ): Promise<boolean> => {
    const document = parseProject(selection.contents)
    if (!sampleFolder) throw new Error('Select a Sample Folder before opening a project.')
    const missing = await backendAPI.findMissingSampleFiles(sampleFolder, allSampleRefs(document))
    if (selection.path !== null) {
      await backendAPI.recordRecentProject(selection.path)
    }
    const displayPath = selection.path ?? ('fileName' in selection ? selection.fileName : 'Untitled.mixjam')
    applyProject(document, selection.path, displayNameForPath(displayPath))
    const missingSet = new Set(missing)
    setProjectMissingSamplePaths(missingSet)
    setProjectWarning(missing.length === 0
      ? null
      : `${missing.length} referenced sample${missing.length === 1 ? '' : 's'} could not be found. Affected lanes are marked.`)
    if (selection.path !== null) {
      await reloadMixJamFiles()
    }
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

  const saveGeneratedProject = useCallback(async (
    project: ProjectData,
    basename: string
  ): Promise<string | null> => {
    if (!userFolder || !sampleFolder) {
      setProjectError('Select both folders before generating a MixJam.')
      return null
    }
    setOperation('saving')
    setProjectError(null)
    setProjectWarning(null)
    try {
      const missing = await backendAPI.findMissingSampleFiles(sampleFolder, allSampleRefs(project))
      if (missing.length > 0) {
        throw new Error(`${missing.length} selected sample${missing.length === 1 ? '' : 's'} changed or disappeared. Prepare the library and generate again.`)
      }
      const now = new Date().toISOString()
      const contents = serializeProject(project, {
        appVersion: await backendAPI.getVersion(),
        createdAt: now,
        modifiedAt: now
      })
      const saved = await backendAPI.createGeneratedMixJamFile(userFolder, basename, contents)
      const failedUpdates: string[] = []
      try {
        await backendAPI.recordRecentProject(saved.path)
      } catch {
        failedUpdates.push('add it to recent projects')
      }
      try {
        await reloadMixJamFiles()
      } catch {
        failedUpdates.push('refresh the project list')
      }
      if (failedUpdates.length > 0) {
        setProjectWarning(
          `MixJam was saved as "${saved.path}", but MixJam could not ${failedUpdates.join(' or ')}. You can still open the file from the User Folder.`
        )
      }
      return saved.path
    } catch (error) {
      setProjectError(errorMessage(error))
      return null
    } finally {
      setOperation('idle')
    }
  }, [backendAPI, reloadMixJamFiles, sampleFolder, userFolder])

  const beginNewProject = useCallback(() => {
    const project: ProjectData = {
      song: createDefaultProjectSongState(),
      lanes: createDefaultLanes(),
      channels: createDefaultChannels()
    }
    const fingerprint = projectFingerprint(project)
    setReplacementTarget(fingerprint)
    setBaselineFingerprint(fingerprint)
    replaceTransportProject({
      lanes: project.lanes,
      song: project.song
    })
    replaceChannels(project.channels)
    setMetadata({
      path: null,
      displayName: 'Untitled',
      createdAt: null,
      modifiedAt: null
    })
    setProjectGenerator(null)
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
    projectGenerator,
    beginNewProject,
    openProjectPicker,
    openProjectPath,
    saveProject,
    saveProjectAs,
    saveGeneratedProject,
    clearProjectNotice
  }
}
