import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BackendAPI, FolderRef } from '../../../shared/backend-api'
import { anyLaneSoloed } from '../engine/lane-evaluation'
import {
  type PlacementGroupEntry,
  type FooterSampleDetail,
  duplicatePlacementGroup,
  duplicatePlacement,
  laneShouldDim,
  movePlacementGroup,
  movePlacement,
  placeSampleOnLane,
  removePlacementFromLane,
  removePlacements,
  resolvePendingPlacementBpms,
  placementDurationTicks,
  songEndTick as deriveSongEndTick,
  toEngineLanes
} from '../lib/arrangement'
import type { RuntimeTransportState } from './useTransportRuntime'
import { PlaybackEngine } from '../engine/playback-engine'
import type { PlaybackReturnSnapshot } from '../engine/playback-engine'
import type { ValueStore } from '../lib/value-store'
import { useTransportRuntime } from './useTransportRuntime'
import { useUndoHistory } from './useUndoHistory'
import type { MasterMeterSnapshot } from '../engine/master-meter'
import type { MasterBusMeterSnapshot } from '../engine/masterbus/dsp/core'
import type { ClipEdgeMicroFadeSettings } from '../engine/clip-edge-fades'
import {
  addLane,
  applyMasterBusPreset,
  createDefaultProjectEditState,
  createDefaultProjectSongState,
  deleteEmptyLanes,
  deleteLane,
  MAX_LANE_COUNT,
  MIN_LANE_COUNT,
  projectEditStateFromProject,
  renameLane,
  reorderMasterBus,
  setLaneGain,
  setLanePan,
  setLaneSend,
  setMasterBusParam,
  toPlaybackProjectGraphSnapshot,
  toggleLaneMute,
  toggleLaneSolo,
  toggleMasterBusPower,
  type LaneState,
  type ProjectEditState,
  type ProjectFxBuses,
  type ProjectState,
  type ProjectSongState,
} from '../project/project-state'
import type { MasterBusParamId, ProcessorId } from '../engine/masterbus/params'
import type { MasterBusPresetName, MasterBusState } from '../engine/masterbus/presets'

const UNDO_HISTORY_LIMIT = 100

type View = 'home' | 'player'

function canonicalSampleDurationTicks(
  lanes: readonly LaneState[],
  samplePath: string
): number | null {
  let durationTicks: number | null = null
  for (const lane of lanes) {
    for (const placement of lane.placements) {
      if (placement.samplePath !== samplePath) continue
      if (durationTicks === null) durationTicks = placement.durationTicks
      else if (durationTicks !== placement.durationTicks) return null
    }
  }
  return durationTicks
}

export interface TransportEngineState {
  view: View
  lanes: LaneState[]
  fxBuses: ProjectFxBuses
  masterBus: MasterBusState
  transportState: RuntimeTransportState
  /** High-frequency playback telemetry lives in stores, not React state, so
   *  ticks and meter frames re-render only the leaves that subscribe. */
  tickStore: ValueStore<number>
  elapsedMsStore: ValueStore<number>
  masterMeterStore: ValueStore<MasterMeterSnapshot>
  songEndTick: number
  bpm: number
  masterGain: number
  clipEdgeMicroFades: ClipEdgeMicroFadeSettings
  song: ProjectSongState
  canUndo: boolean
  canRedo: boolean
  playbackEngineRef: React.RefObject<PlaybackEngine | null>
}

export interface TransportEngineActions {
  setView: (view: View) => void
  replaceProjectState: (state: ProjectState) => void
  placeSampleDetailOnLane: (detail: FooterSampleDetail, laneIndex: number, startTick: number) => void
  resolvePendingPlacementBpms: (sampleBpms: ReadonlyMap<string, number>) => void
  movePlacement: (placementId: string, toLaneIndex: number, newStartTick: number) => void
  duplicatePlacement: (placementId: string, toLaneIndex: number, newStartTick: number) => void
  movePlacementGroup: (moves: PlacementGroupEntry[]) => void
  duplicatePlacementGroup: (sources: PlacementGroupEntry[]) => void
  removePlacementFromLane: (laneIndex: number, placementId: string) => void
  removePlacements: (placementIds: string[]) => void
  undo: () => void
  redo: () => void
  beginMixerGesture: () => void
  commitMixerGesture: () => void
  setLanePan: (laneIndex: number, pan: number) => void
  setLaneGain: (laneIndex: number, gain: number) => void
  setLaneSend: (laneIndex: number, sendIndex: number, value: number) => void
  setReturnBus: (bus: PlaybackReturnSnapshot) => void
  setMasterBusParam: (id: MasterBusParamId, value: number) => void
  toggleMasterBusPower: (id: ProcessorId) => void
  reorderMasterBus: (order: ProcessorId[]) => void
  applyMasterBusPreset: (name: MasterBusPresetName) => void
  renameLane: (laneIndex: number, name: string) => void
  addLane: () => void
  deleteLane: (laneIndex: number) => void
  deleteEmptyLanes: () => void
  previewSample: (samplePath: string, nativeBPM?: number | null) => void
  getSampleBuffer: (samplePath: string) => Promise<AudioBuffer | null>
  toggleLaneMute: (laneIndex: number) => void
  toggleLaneSolo: (laneIndex: number) => void
  laneShouldDim: (lane: LaneState) => boolean
  transportPlay: () => void
  transportPause: () => void
  transportStop: () => void
  transportSkipBack: () => void
  transportJumpToEnd: () => void
  transportSeek: (tick: number) => void
  setBpm: (bpm: number) => void
  setMasterGain: (value: number) => void
  setClipEdgeMicroFades: (settings: ClipEdgeMicroFadeSettings) => void
  resetMasterMeter: () => void
  getMasterBusMeterSnapshot: () => MasterBusMeterSnapshot | null
  setMasterBusMetersActive: (active: boolean) => void
}

export type TransportEngine = TransportEngineState & TransportEngineActions

export function useTransportEngine(
  backendAPI: BackendAPI,
  sampleFolder: FolderRef | null,
  initialView: View = 'home'
): TransportEngine {
  const [view, setView] = useState<View>(initialView)
  const defaultSong = useMemo(createDefaultProjectSongState, [])
  const projectHistory = useUndoHistory<ProjectEditState>(
    createDefaultProjectEditState(),
    UNDO_HISTORY_LIMIT
  )
  const { lanes, fxBuses, masterBus } = projectHistory.current
  const songEndTick = useMemo(() => deriveSongEndTick(lanes), [lanes])
  const getEngineLanes = useCallback(
    () => toEngineLanes(projectHistory.currentRef.current.lanes),
    [projectHistory.currentRef]
  )
  const getProjectGraphSnapshot = useCallback(
    () => toPlaybackProjectGraphSnapshot(projectHistory.currentRef.current),
    [projectHistory.currentRef]
  )
  const runtime = useTransportRuntime({
    backendAPI,
    sampleFolder,
    active: view === 'player',
    getLanes: getEngineLanes,
    getProjectGraphSnapshot,
    songEndTick,
    initialBpm: defaultSong.bpm,
    initialMasterGain: defaultSong.masterGain,
    initialClipEdgeMicroFades: defaultSong.clipEdgeMicroFades
  })
  const {
    playbackEngineRef,
    transportState,
    tickStore,
    bpm,
    masterGain,
    clipEdgeMicroFades,
    elapsedMsStore,
    masterMeterStore,
    previewSample,
    getSampleBuffer,
    transportPlay,
    transportPause,
    transportStop,
    transportSkipBack,
    transportJumpToEnd,
    transportSeek,
    setBpm,
    setMasterGain,
    setClipEdgeMicroFades,
    replaceSongState,
    resetMasterMeter,
    getMasterBusMeterSnapshot,
    setMasterBusMetersActive
  } = runtime

  const { pushEdit, undo, redo, setCurrent, reset } = projectHistory
  const mixerGestureStartRef = useRef<ProjectEditState | null>(null)

  const beginMixerGesture = useCallback(() => {
    mixerGestureStartRef.current ??= projectHistory.currentRef.current
  }, [projectHistory.currentRef])

  const commitMixerGesture = useCallback(() => {
    const start = mixerGestureStartRef.current
    if (!start) return
    mixerGestureStartRef.current = null
    const final = projectHistory.currentRef.current
    if (final === start) return
    // useUndoHistory records the value present when pushEdit starts. Restore
    // that reference synchronously, then publish the gesture's final snapshot
    // as one command without exposing the restore to a React render.
    setCurrent(start)
    pushEdit(() => final)
  }, [projectHistory.currentRef, pushEdit, setCurrent])

  const applyMixerEdit = useCallback((edit: (current: ProjectEditState) => ProjectEditState) => {
    if (mixerGestureStartRef.current) {
      const current = projectHistory.currentRef.current
      const next = edit(current)
      if (next !== current) setCurrent(next)
      return
    }
    pushEdit(edit)
  }, [projectHistory.currentRef, pushEdit, setCurrent])

  const handleUndo = useCallback(() => {
    commitMixerGesture()
    undo()
  }, [commitMixerGesture, undo])

  const handleRedo = useCallback(() => {
    commitMixerGesture()
    redo()
  }, [commitMixerGesture, redo])

  const song = useMemo<ProjectSongState>(() => ({
    bpm,
    masterGain,
    clipEdgeMicroFades
  }), [bpm, clipEdgeMicroFades, masterGain])

  const replaceProjectState = useCallback((state: ProjectState) => {
    mixerGestureStartRef.current = null
    transportStop()
    const editState = projectEditStateFromProject(state)
    reset(editState)
    replaceSongState(state.song)
    playbackEngineRef.current?.applyProjectGraphSnapshot(
      toPlaybackProjectGraphSnapshot(editState),
      'replace-project'
    )
  }, [playbackEngineRef, replaceSongState, reset, transportStop])

  const placeSampleDetailOnLane = useCallback(
    (detail: FooterSampleDetail, laneIndex: number, startTick: number) => {
      pushEdit((current) => {
        const referenceBpm = detail.bpm !== null && Number.isFinite(detail.bpm) && detail.bpm > 0
          ? detail.bpm
          : bpm
        const placementTicks = canonicalSampleDurationTicks(current.lanes, detail.relpath) ??
          placementDurationTicks(detail.duration, referenceBpm)
        const lanes = placeSampleOnLane(
          current.lanes,
          laneIndex,
          detail.relpath,
          detail.name,
          startTick,
          placementTicks,
          detail.duration,
          detail.slot,
          detail.bpm
        )
        return lanes === current.lanes ? current : { ...current, lanes }
      })
    },
    [bpm, pushEdit]
  )

  const handleResolvePendingPlacementBpms = useCallback((sampleBpms: ReadonlyMap<string, number>) => {
    const current = projectHistory.currentRef.current
    const lanes = resolvePendingPlacementBpms(current.lanes, sampleBpms)
    if (lanes !== current.lanes) setCurrent({ ...current, lanes })
  }, [projectHistory.currentRef, setCurrent])

  const handleToggleLaneMute = useCallback((laneIndex: number) => {
    applyMixerEdit((current) => ({ ...current, lanes: toggleLaneMute(current.lanes, laneIndex) }))
  }, [applyMixerEdit])

  const handleToggleLaneSolo = useCallback((laneIndex: number) => {
    applyMixerEdit((current) => ({ ...current, lanes: toggleLaneSolo(current.lanes, laneIndex) }))
  }, [applyMixerEdit])

  const handleMovePlacement = useCallback(
    (placementId: string, toLaneIndex: number, newStartTick: number) => {
      pushEdit((current) => ({ ...current, lanes: movePlacement(current.lanes, placementId, toLaneIndex, newStartTick) }))
    },
    [pushEdit]
  )

  const handleDuplicatePlacement = useCallback(
    (placementId: string, toLaneIndex: number, newStartTick: number) => {
      pushEdit((current) => ({ ...current, lanes: duplicatePlacement(current.lanes, placementId, toLaneIndex, newStartTick) }))
    },
    [pushEdit]
  )

  const handleMovePlacementGroup = useCallback(
    (moves: PlacementGroupEntry[]) => {
      pushEdit((current) => ({ ...current, lanes: movePlacementGroup(current.lanes, moves) }))
    },
    [pushEdit]
  )

  const handleDuplicatePlacementGroup = useCallback(
    (sources: PlacementGroupEntry[]) => {
      pushEdit((current) => ({ ...current, lanes: duplicatePlacementGroup(current.lanes, sources) }))
    },
    [pushEdit]
  )

  const handleRemovePlacementFromLane = useCallback(
    (laneIndex: number, placementId: string) => {
      pushEdit((current) => ({ ...current, lanes: removePlacementFromLane(current.lanes, laneIndex, placementId) }))
    },
    [pushEdit]
  )

  const handleRemovePlacements = useCallback(
    (placementIds: string[]) => {
      pushEdit((current) => ({ ...current, lanes: removePlacements(current.lanes, placementIds) }))
    },
    [pushEdit]
  )

  const handleSetLanePan = useCallback(
    (laneIndex: number, pan: number) => {
      applyMixerEdit((current) => ({ ...current, lanes: setLanePan(current.lanes, laneIndex, pan) }))
    },
    [applyMixerEdit]
  )

  const handleSetLaneGain = useCallback((laneIndex: number, gain: number) => {
    applyMixerEdit((current) => ({ ...current, lanes: setLaneGain(current.lanes, laneIndex, gain) }))
  }, [applyMixerEdit])
  const handleSetLaneSend = useCallback((laneIndex: number, sendIndex: number, value: number) => {
    applyMixerEdit((current) => {
      const lanes = setLaneSend(current.lanes, laneIndex, sendIndex, value)
      return lanes === current.lanes ? current : { ...current, lanes }
    })
  }, [applyMixerEdit])

  const handleSetReturnBus = useCallback((bus: PlaybackReturnSnapshot) => {
    if (!Number.isInteger(bus.index) || bus.index < 0 || bus.index >= 4) return
    applyMixerEdit((current) => {
      const fxBuses = current.fxBuses.map((candidate) => candidate.index === bus.index
        ? {
            ...candidate,
            module: { ...bus.module },
            powered: bus.powered,
            returnLevel: bus.returnLevel,
            limiterEnabled: bus.limiterEnabled
          }
        : candidate) as ProjectFxBuses
      return { ...current, fxBuses }
    })
  }, [applyMixerEdit])

  const handleSetMasterBusParam = useCallback((id: MasterBusParamId, value: number) => {
    applyMixerEdit((current) => ({ ...current, masterBus: setMasterBusParam(current.masterBus, id, value) }))
  }, [applyMixerEdit])

  const handleToggleMasterBusPower = useCallback((id: ProcessorId) => {
    applyMixerEdit((current) => ({ ...current, masterBus: toggleMasterBusPower(current.masterBus, id) }))
  }, [applyMixerEdit])

  const handleReorderMasterBus = useCallback((order: ProcessorId[]) => {
    applyMixerEdit((current) => {
      const next = reorderMasterBus(current.masterBus, order)
      return next === current.masterBus ? current : { ...current, masterBus: next }
    })
  }, [applyMixerEdit])

  const handleApplyMasterBusPreset = useCallback((name: MasterBusPresetName) => {
    applyMixerEdit((current) => ({ ...current, masterBus: applyMasterBusPreset(current.masterBus, name) }))
  }, [applyMixerEdit])

  // Live strip edits (including undo/redo restores) reconcile into the
  // running audio graph; the worklet crossfades topology changes and
  // smooths parameter moves. Project replacement snaps separately.
  useEffect(() => {
    playbackEngineRef.current?.applyMasterBusState(masterBus, 'reconcile')
  }, [masterBus, playbackEngineRef])

  const handleRenameLane = useCallback(
    (laneIndex: number, name: string) => {
      applyMixerEdit((current) => ({ ...current, lanes: renameLane(current.lanes, laneIndex, name) }))
    },
    [applyMixerEdit]
  )

  const handleAddLane = useCallback(() => {
    if (projectHistory.currentRef.current.lanes.length >= MAX_LANE_COUNT) return
    transportStop()
    pushEdit((current) => ({ ...current, lanes: addLane(current.lanes) }))
  }, [projectHistory.currentRef, pushEdit, transportStop])

  const handleDeleteLane = useCallback((laneIndex: number) => {
    if (projectHistory.currentRef.current.lanes.length <= MIN_LANE_COUNT) return
    transportStop()
    pushEdit((current) => ({ ...current, lanes: deleteLane(current.lanes, laneIndex) }))
  }, [projectHistory.currentRef, pushEdit, transportStop])

  const handleDeleteEmptyLanes = useCallback(() => {
    transportStop()
    pushEdit((current) => ({ ...current, lanes: deleteEmptyLanes(current.lanes) }))
  }, [pushEdit, transportStop])

  const anySoloed = useMemo(() => anyLaneSoloed(lanes), [lanes])
  const dimLane = useCallback(
    (lane: LaneState) => laneShouldDim(lane, anySoloed),
    [anySoloed]
  )

  return {
    view,
    lanes,
    fxBuses,
    masterBus,
    transportState,
    tickStore,
    elapsedMsStore,
    masterMeterStore,
    songEndTick,
    bpm,
    masterGain,
    clipEdgeMicroFades,
    song,
    canUndo: projectHistory.canUndo,
    canRedo: projectHistory.canRedo,
    playbackEngineRef,
    setView,
    replaceProjectState,
    placeSampleDetailOnLane,
    resolvePendingPlacementBpms: handleResolvePendingPlacementBpms,
    movePlacement: handleMovePlacement,
    duplicatePlacement: handleDuplicatePlacement,
    movePlacementGroup: handleMovePlacementGroup,
    duplicatePlacementGroup: handleDuplicatePlacementGroup,
    removePlacementFromLane: handleRemovePlacementFromLane,
    removePlacements: handleRemovePlacements,
    undo: handleUndo,
    redo: handleRedo,
    beginMixerGesture,
    commitMixerGesture,
    setLanePan: handleSetLanePan,
    setLaneGain: handleSetLaneGain,
    setLaneSend: handleSetLaneSend,
    setReturnBus: handleSetReturnBus,
    setMasterBusParam: handleSetMasterBusParam,
    toggleMasterBusPower: handleToggleMasterBusPower,
    reorderMasterBus: handleReorderMasterBus,
    applyMasterBusPreset: handleApplyMasterBusPreset,
    renameLane: handleRenameLane,
    addLane: handleAddLane,
    deleteLane: handleDeleteLane,
    deleteEmptyLanes: handleDeleteEmptyLanes,
    previewSample,
    getSampleBuffer,
    toggleLaneMute: handleToggleLaneMute,
    toggleLaneSolo: handleToggleLaneSolo,
    laneShouldDim: dimLane,
    transportPlay,
    transportPause,
    transportStop,
    transportSkipBack,
    transportJumpToEnd,
    transportSeek,
    setBpm,
    setMasterGain,
    setClipEdgeMicroFades,
    resetMasterMeter,
    getMasterBusMeterSnapshot,
    setMasterBusMetersActive
  }
}
