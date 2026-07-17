import { useCallback, useMemo, useState } from 'react'
import type { BackendAPI, FolderRef } from '../../../shared/backend-api'
import { anyLaneSoloed } from '../engine/lane-evaluation'
import {
  type PlacementGroupEntry,
  type FooterSampleDetail,
  type LaneState,
  createDefaultLanes,
  duplicatePlacementGroup,
  duplicatePlacement,
  laneShouldDim,
  movePlacementGroup,
  movePlacement,
  placeSampleOnLane,
  removePlacementFromLane,
  removePlacements,
  renameLane,
  resolvePendingPlacementBpms,
  placementDurationTicks,
  setLanePan,
  songEndTick as deriveSongEndTick,
  toEngineLanes,
  toggleLaneMute,
  toggleLaneSolo
} from '../lib/arrangement'
import type { RuntimeTransportState } from './useTransportRuntime'
import { PlaybackEngine } from '../engine/playback-engine'
import { formatTimer } from '../lib/formatTimer'
import { useTransportRuntime } from './useTransportRuntime'
import { useUndoHistory } from './useUndoHistory'
import type { MasterMeterSnapshot } from '../engine/master-meter'
import type { ClipEdgeMicroFadeSettings } from '../engine/clip-edge-fades'
import {
  createDefaultProjectSongState,
  type ProjectSongState,
  type ProjectTransportState
} from '../project/project-state'

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
  timerText: string
  lanes: LaneState[]
  transportState: RuntimeTransportState
  currentTick: number
  songEndTick: number
  bpm: number
  masterGain: number
  clipEdgeMicroFades: ClipEdgeMicroFadeSettings
  song: ProjectSongState
  masterMeter: MasterMeterSnapshot
  elapsedMs: number
  canUndo: boolean
  canRedo: boolean
  playbackEngineRef: React.RefObject<PlaybackEngine | null>
}

export interface TransportEngineActions {
  setView: (view: View) => void
  replaceProjectState: (state: ProjectTransportState) => void
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
  setLanePan: (laneIndex: number, pan: number) => void
  renameLane: (laneIndex: number, name: string) => void
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
}

export type TransportEngine = TransportEngineState & TransportEngineActions

export function useTransportEngine(
  backendAPI: BackendAPI,
  sampleFolder: FolderRef | null,
  initialView: View = 'home'
): TransportEngine {
  const [view, setView] = useState<View>(initialView)
  const defaultSong = useMemo(createDefaultProjectSongState, [])
  const lanesHistory = useUndoHistory<LaneState[]>(createDefaultLanes(), UNDO_HISTORY_LIMIT)
  const lanes = lanesHistory.current
  const songEndTick = useMemo(() => deriveSongEndTick(lanes), [lanes])
  const getEngineLanes = useCallback(
    () => toEngineLanes(lanesHistory.currentRef.current),
    [lanesHistory.currentRef]
  )
  const runtime = useTransportRuntime({
    backendAPI,
    sampleFolder,
    active: view === 'player',
    getLanes: getEngineLanes,
    songEndTick,
    initialBpm: defaultSong.bpm,
    initialMasterGain: defaultSong.masterGain,
    initialClipEdgeMicroFades: defaultSong.clipEdgeMicroFades
  })
  const {
    playbackEngineRef,
    transportState,
    currentTick,
    bpm,
    masterGain,
    clipEdgeMicroFades,
    elapsedMs,
    masterMeter,
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
    resetMasterMeter
  } = runtime

  const { pushEdit, undo, redo, setCurrent, reset } = lanesHistory

  const song = useMemo<ProjectSongState>(() => ({
    bpm,
    masterGain,
    clipEdgeMicroFades
  }), [bpm, clipEdgeMicroFades, masterGain])

  const replaceProjectState = useCallback((state: ProjectTransportState) => {
    transportStop()
    const lanes = state.lanes.map((lane) => ({
      ...lane,
      placements: lane.placements.map((placement) => ({ ...placement }))
    }))
    reset(lanes)
    setBpm(state.song.bpm)
    setMasterGain(state.song.masterGain)
    setClipEdgeMicroFades(state.song.clipEdgeMicroFades)
    const playbackEngine = playbackEngineRef.current
    if (playbackEngine) {
      for (const lane of lanes) playbackEngine.setLanePan(lane.index, lane.pan)
    }
  }, [playbackEngineRef, reset, setBpm, setClipEdgeMicroFades, setMasterGain, transportStop])

  const placeSampleDetailOnLane = useCallback(
    (detail: FooterSampleDetail, laneIndex: number, startTick: number) => {
      pushEdit((current) => {
        const referenceBpm = detail.bpm !== null && Number.isFinite(detail.bpm) && detail.bpm > 0
          ? detail.bpm
          : bpm
        const placementTicks = canonicalSampleDurationTicks(current, detail.relpath) ??
          placementDurationTicks(detail.duration, referenceBpm)
        return placeSampleOnLane(
          current,
          laneIndex,
          detail.relpath,
          detail.name,
          startTick,
          placementTicks,
          detail.duration,
          detail.slot,
          detail.bpm
        )
      })
    },
    [bpm, pushEdit]
  )

  const handleResolvePendingPlacementBpms = useCallback((sampleBpms: ReadonlyMap<string, number>) => {
    const current = lanesHistory.currentRef.current
    const next = resolvePendingPlacementBpms(current, sampleBpms)
    if (next !== current) setCurrent(next)
  }, [lanesHistory.currentRef, setCurrent])

  const handleToggleLaneMute = useCallback((laneIndex: number) => {
    setCurrent(toggleLaneMute(lanesHistory.currentRef.current, laneIndex))
  }, [setCurrent, lanesHistory.currentRef])

  const handleToggleLaneSolo = useCallback((laneIndex: number) => {
    setCurrent(toggleLaneSolo(lanesHistory.currentRef.current, laneIndex))
  }, [setCurrent, lanesHistory.currentRef])

  const handleMovePlacement = useCallback(
    (placementId: string, toLaneIndex: number, newStartTick: number) => {
      pushEdit((current) => movePlacement(current, placementId, toLaneIndex, newStartTick))
    },
    [pushEdit]
  )

  const handleDuplicatePlacement = useCallback(
    (placementId: string, toLaneIndex: number, newStartTick: number) => {
      pushEdit((current) => duplicatePlacement(current, placementId, toLaneIndex, newStartTick))
    },
    [pushEdit]
  )

  const handleMovePlacementGroup = useCallback(
    (moves: PlacementGroupEntry[]) => {
      pushEdit((current) => movePlacementGroup(current, moves))
    },
    [pushEdit]
  )

  const handleDuplicatePlacementGroup = useCallback(
    (sources: PlacementGroupEntry[]) => {
      pushEdit((current) => duplicatePlacementGroup(current, sources))
    },
    [pushEdit]
  )

  const handleRemovePlacementFromLane = useCallback(
    (laneIndex: number, placementId: string) => {
      pushEdit((current) => removePlacementFromLane(current, laneIndex, placementId))
    },
    [pushEdit]
  )

  const handleRemovePlacements = useCallback(
    (placementIds: string[]) => {
      pushEdit((current) => removePlacements(current, placementIds))
    },
    [pushEdit]
  )

  const handleSetLanePan = useCallback(
    (laneIndex: number, pan: number) => {
      setCurrent(setLanePan(lanesHistory.currentRef.current, laneIndex, pan))
      // Update the per-lane persistent panner directly so live knob changes
      // affect already-sounding voices without waiting for the next trigger.
      playbackEngineRef.current?.setLanePan(laneIndex, pan)
    },
    [setCurrent, lanesHistory.currentRef, playbackEngineRef]
  )

  const handleRenameLane = useCallback(
    (laneIndex: number, name: string) => {
      setCurrent(renameLane(lanesHistory.currentRef.current, laneIndex, name))
    },
    [lanesHistory.currentRef, setCurrent]
  )

  const timerText = useMemo(() => formatTimer(elapsedMs), [elapsedMs])
  const anySoloed = useMemo(() => anyLaneSoloed(lanes), [lanes])
  const dimLane = useCallback(
    (lane: LaneState) => laneShouldDim(lane, anySoloed),
    [anySoloed]
  )

  return {
    view,
    timerText,
    lanes,
    transportState,
    currentTick,
    songEndTick,
    bpm,
    masterGain,
    clipEdgeMicroFades,
    song,
    masterMeter,
    elapsedMs,
    canUndo: lanesHistory.canUndo,
    canRedo: lanesHistory.canRedo,
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
    undo,
    redo,
    setLanePan: handleSetLanePan,
    renameLane: handleRenameLane,
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
    resetMasterMeter
  }
}
