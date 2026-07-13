import { act, renderHook, waitFor } from '@testing-library/react'
import { useCallback, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FolderRef } from '../../../shared/backend-api'
import { createBackendAPI } from '../test/backendApi'
import { createDefaultLanes, type LaneState } from '../lib/arrangement'
import { createDefaultChannels, type ChannelState } from './useMixer'
import { useProjectPersistence } from './useProjectPersistence'
import { parseProject, serializeProject, type ProjectData } from '../project/project-file'

const USER_FOLDER: FolderRef = { id: 'user-folder', name: 'MixJam' }
const SAMPLE_FOLDER: FolderRef = { id: 'sample-folder', name: 'Samples' }
const CREATED_AT = '2026-07-13T10:00:00.000Z'

function makeProject(bpm = 128, masterGain = 0.67): ProjectData {
  const lanes = createDefaultLanes()
  lanes[0] = {
    ...lanes[0]!,
    muted: true,
    pan: -0.3,
    placements: [{
      id: `placement-${bpm}`,
      samplePath: 'Loops/beat.wav',
      sampleName: 'beat.wav',
      nativeBPM: 128,
      startTick: 16,
      durationTicks: 32,
      durationSeconds: 2,
      slot: 4
    }]
  }
  const channels = createDefaultChannels()
  channels[0] = {
    ...channels[0]!,
    gain: 0.55,
    pan: 0.2,
    effects: [{
      id: `fx-${bpm}`,
      type: 'reverb',
      bypassed: false,
      roomSize: 0.6,
      decay: 0.4,
      mix: 0.25
    }]
  }
  return { song: { bpm, masterGain }, lanes, channels }
}

function projectText(project: ProjectData): string {
  return serializeProject(project, {
    appVersion: 'v0.test.0',
    createdAt: CREATED_AT,
    modifiedAt: CREATED_AT
  })
}

function useHarness(api: ReturnType<typeof createBackendAPI>) {
  const [lanes, setLanes] = useState<LaneState[]>(createDefaultLanes)
  const [bpm, setBpm] = useState(120)
  const [masterGain, setMasterGain] = useState(0.8)
  const [channels, setChannels] = useState<ChannelState[]>(createDefaultChannels)

  const replaceTransportProject = useCallback((state: {
    lanes: LaneState[]
    bpm: number
    masterGain: number
  }) => {
    setLanes(state.lanes)
    setBpm(state.bpm)
    setMasterGain(state.masterGain)
  }, [])
  const replaceChannels = useCallback((next: ChannelState[]) => setChannels(next), [])
  const reloadMixJamFiles = useCallback(async () => undefined, [])

  const project = useProjectPersistence({
    backendAPI: api,
    userFolder: USER_FOLDER,
    sampleFolder: SAMPLE_FOLDER,
    lanes,
    bpm,
    masterGain,
    channels,
    replaceTransportProject,
    replaceChannels,
    reloadMixJamFiles
  })

  return {
    project,
    lanes,
    bpm,
    masterGain,
    channels,
    setLanes,
    setBpm,
    setMasterGain,
    setChannels
  }
}

describe('useProjectPersistence', () => {
  let api: ReturnType<typeof createBackendAPI>

  beforeEach(() => {
    api = createBackendAPI()
  })

  it('marks every project-owned edit dirty and clears dirty state after Save As', async () => {
    vi.mocked(api.saveMixJamFileAs).mockImplementation(async (_folder, _name, contents) => ({
      path: 'sets/new-song.mixjam',
      contents
    }))
    const { result } = renderHook(() => useHarness(api))

    act(() => result.current.setBpm(132))
    await waitFor(() => expect(result.current.project.projectDirty).toBe(true))

    let saved = false
    await act(async () => {
      saved = await result.current.project.saveProjectAs()
    })

    expect(saved).toBe(true)
    expect(result.current.project.projectName).toBe('new-song')
    expect(result.current.project.projectDirty).toBe(false)
    const contents = vi.mocked(api.saveMixJamFileAs).mock.calls[0]![2]
    expect(parseProject(contents).song.bpm).toBe(132)
    expect(api.recordRecentProject).toHaveBeenCalledWith('sets/new-song.mixjam')
  })

  it('loads and fully replaces arrangement, Song, Mixer, routing, and FX state', async () => {
    const loaded = makeProject(140, 0.61)
    vi.mocked(api.readMixJamFile).mockResolvedValue({
      path: 'sets/loaded.mixjam',
      contents: projectText(loaded)
    })
    vi.mocked(api.findMissingSampleFiles).mockResolvedValue(['Loops/beat.wav'])
    const { result } = renderHook(() => useHarness(api))

    let opened = false
    await act(async () => {
      opened = await result.current.project.openProjectPath('sets/loaded.mixjam')
    })

    expect(opened).toBe(true)
    await waitFor(() => expect(result.current.project.projectBusy).toBe(false))
    expect(result.current.bpm).toBe(140)
    expect(result.current.masterGain).toBe(0.61)
    expect(result.current.lanes[0]).toMatchObject({ muted: true, pan: -0.3 })
    expect(result.current.channels[0]).toMatchObject({
      gain: 0.55,
      pan: 0.2,
      effects: [{ id: 'fx-140', type: 'reverb' }]
    })
    expect(result.current.project.projectDirty).toBe(false)
    expect(result.current.project.projectMissingSamplePaths.has('Loops/beat.wav')).toBe(true)
    expect(result.current.project.projectWarning).toContain('1 referenced sample')
    expect(api.recordRecentProject).toHaveBeenCalledWith('sets/loaded.mixjam')
  })

  it('saves an opened project back to its current path', async () => {
    vi.mocked(api.readMixJamFile).mockResolvedValue({
      path: 'sets/current.mixjam',
      contents: projectText(makeProject(118))
    })
    const { result } = renderHook(() => useHarness(api))
    await act(async () => { await result.current.project.openProjectPath('sets/current.mixjam') })
    act(() => result.current.setBpm(119))
    await waitFor(() => expect(result.current.project.projectDirty).toBe(true))

    let saved = false
    await act(async () => { saved = await result.current.project.saveProject() })

    expect(saved).toBe(true)
    expect(api.writeMixJamFile).toHaveBeenCalledWith(
      USER_FOLDER,
      'sets/current.mixjam',
      expect.any(String)
    )
    const contents = vi.mocked(api.writeMixJamFile).mock.calls[0]![2]
    expect(parseProject(contents).song.bpm).toBe(119)
    expect(result.current.project.projectDirty).toBe(false)
    expect(api.saveMixJamFileAs).not.toHaveBeenCalled()
  })

  it('loading project B after project A does not merge state from A', async () => {
    const projectA = makeProject(128)
    projectA.channels = projectA.channels.slice(0, 2)
    const projectB = makeProject(96)
    projectB.channels = createDefaultChannels()
    projectB.lanes[0] = { ...projectB.lanes[0]!, placements: [] }
    vi.mocked(api.readMixJamFile).mockImplementation(async (_folder, path) => ({
      path,
      contents: projectText(path.startsWith('a') ? projectA : projectB)
    }))
    const { result } = renderHook(() => useHarness(api))

    await act(async () => { await result.current.project.openProjectPath('a.mixjam') })
    expect(result.current.channels).toHaveLength(2)
    expect(result.current.lanes[0]!.placements).toHaveLength(1)

    await act(async () => { await result.current.project.openProjectPath('b.mixjam') })
    expect(result.current.bpm).toBe(96)
    expect(result.current.channels).toHaveLength(16)
    expect(result.current.lanes[0]!.placements).toHaveLength(0)
    expect(result.current.project.projectDirty).toBe(false)
  })

  it('does not replace live state when a newer project version is rejected', async () => {
    const newer = JSON.parse(projectText(makeProject())) as Record<string, unknown>
    newer.formatVersion = 99
    vi.mocked(api.readMixJamFile).mockResolvedValue({
      path: 'future.mixjam',
      contents: JSON.stringify(newer)
    })
    const { result } = renderHook(() => useHarness(api))

    await act(async () => { await result.current.project.openProjectPath('future.mixjam') })

    expect(result.current.bpm).toBe(120)
    expect(result.current.channels).toHaveLength(16)
    expect(result.current.project.projectError).toBe(
      'This project was created with a newer version of MixJam. Please update the app.'
    )
    expect(api.recordRecentProject).not.toHaveBeenCalled()
  })

  it('restores the last saved file rather than later unsaved changes', async () => {
    const savedProject = makeProject(124)
    vi.mocked(api.readMixJamFile).mockResolvedValue({
      path: 'saved.mixjam',
      contents: projectText(savedProject)
    })
    const { result } = renderHook(() => useHarness(api))

    await act(async () => { await result.current.project.openProjectPath('saved.mixjam') })
    act(() => result.current.setBpm(175))
    await waitFor(() => expect(result.current.project.projectDirty).toBe(true))
    await act(async () => { await result.current.project.openProjectPath('saved.mixjam') })

    expect(result.current.bpm).toBe(124)
    expect(result.current.project.projectDirty).toBe(false)
  })

  it('starts a new project from defaults without retaining the previous project', async () => {
    const { result } = renderHook(() => useHarness(api))
    act(() => {
      result.current.setBpm(150)
      result.current.setMasterGain(0.2)
      result.current.setChannels([])
    })

    act(() => result.current.project.beginNewProject())

    await waitFor(() => expect(result.current.project.projectBusy).toBe(false))
    expect(result.current.bpm).toBe(120)
    expect(result.current.masterGain).toBe(0.8)
    expect(result.current.channels).toHaveLength(16)
    expect(result.current.lanes.every((lane) => lane.placements.length === 0)).toBe(true)
    expect(result.current.project.projectName).toBe('Untitled')
    expect(result.current.project.projectDirty).toBe(false)
  })
})
