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
  placementDurationTicks,
  setLanePan,
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

const DEFAULT_BPM = 120

const UNDO_HISTORY_LIMIT = 100

type View = 'home' | 'player'

export interface TransportEngineState {
  view: View
  timerText: string
  lanes: LaneState[]
  transportState: RuntimeTransportState
  currentTick: number
  bpm: number
  masterGain: number
  masterMeter: MasterMeterSnapshot
  elapsedMs: number
  canUndo: boolean
  canRedo: boolean
  playbackEngineRef: React.RefObject<PlaybackEngine | null>
}

export interface TransportEngineActions {
  setView: (view: View) => void
  placeSampleDetailOnLane: (detail: FooterSampleDetail, laneIndex: number, startTick: number) => void
  movePlacement: (placementId: string, toLaneIndex: number, newStartTick: number) => void
  duplicatePlacement: (placementId: string, toLaneIndex: number, newStartTick: number) => void
  movePlacementGroup: (moves: PlacementGroupEntry[]) => void
  duplicatePlacementGroup: (sources: PlacementGroupEntry[]) => void
  removePlacementFromLane: (laneIndex: number, placementId: string) => void
  removePlacements: (placementIds: string[]) => void
  undo: () => void
  redo: () => void
  setLanePan: (laneIndex: number, pan: number) => void
  previewSample: (samplePath: string, nativeBPM?: number | null) => void
  getSampleBuffer: (samplePath: string) => Promise<AudioBuffer | null>
  toggleLaneMute: (laneIndex: number) => void
  toggleLaneSolo: (laneIndex: number) => void
  laneShouldDim: (lane: LaneState) => boolean
  transportPlay: () => void
  transportPause: () => void
  transportStop: () => void
  transportSkipBack: () => void
  transportSeek: (tick: number) => void
  setBpm: (bpm: number) => void
  setMasterGain: (value: number) => void
  resetMasterMeter: () => void
}

export type TransportEngine = TransportEngineState & TransportEngineActions

export function useTransportEngine(
  backendAPI: BackendAPI,
  sampleFolder: FolderRef | null,
  initialView: View = 'home'
): TransportEngine {
  const [view, setView] = useState<View>(initialView)
  const lanesHistory = useUndoHistory<LaneState[]>(createDefaultLanes(), UNDO_HISTORY_LIMIT)
  const getEngineLanes = useCallback(
    () => toEngineLanes(lanesHistory.currentRef.current),
    [lanesHistory.currentRef]
  )
  const runtime = useTransportRuntime({
    backendAPI,
    sampleFolder,
    active: view === 'player',
    getLanes: getEngineLanes,
    initialBpm: DEFAULT_BPM,
    initialMasterGain: 0.8
  })
  const {
    playbackEngineRef,
    transportState,
    currentTick,
    bpm,
    masterGain,
    elapsedMs,
    masterMeter,
    previewSample,
    getSampleBuffer,
    transportPlay,
    transportPause,
    transportStop,
    transportSkipBack,
    transportSeek,
    setBpm,
    setMasterGain,
    resetMasterMeter
  } = runtime

  const { pushEdit, undo, redo, setCurrent } = lanesHistory

  const placeSampleDetailOnLane = useCallback(
    (detail: FooterSampleDetail, laneIndex: number, startTick: number) => {
      const placementTicks = placementDurationTicks(detail.duration, bpm)
      pushEdit((current) =>
        placeSampleOnLane(current, laneIndex, detail.relpath, detail.name, startTick, placementTicks, detail.duration, detail.slot, detail.bpm)
      )
    },
    [bpm, pushEdit]
  )

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

  const timerText = useMemo(() => formatTimer(elapsedMs), [elapsedMs])
  const lanes = lanesHistory.current
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
    bpm,
    masterGain,
    masterMeter,
    elapsedMs,
    canUndo: lanesHistory.canUndo,
    canRedo: lanesHistory.canRedo,
    playbackEngineRef,
    setView,
    placeSampleDetailOnLane,
    movePlacement: handleMovePlacement,
    duplicatePlacement: handleDuplicatePlacement,
    movePlacementGroup: handleMovePlacementGroup,
    duplicatePlacementGroup: handleDuplicatePlacementGroup,
    removePlacementFromLane: handleRemovePlacementFromLane,
    removePlacements: handleRemovePlacements,
    undo,
    redo,
    setLanePan: handleSetLanePan,
    previewSample,
    getSampleBuffer,
    toggleLaneMute: handleToggleLaneMute,
    toggleLaneSolo: handleToggleLaneSolo,
    laneShouldDim: dimLane,
    transportPlay,
    transportPause,
    transportStop,
    transportSkipBack,
    transportSeek,
    setBpm,
    setMasterGain,
    resetMasterMeter
  }
}
