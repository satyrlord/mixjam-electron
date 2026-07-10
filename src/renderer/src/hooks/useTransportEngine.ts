import { useCallback, useMemo, useState } from 'react'
import type { BackendAPI, FolderRef } from '../../../shared/backend-api'
import { anyLaneSoloed } from '../engine/lane-evaluation'
import {
  type ClipGroupEntry,
  type FooterSampleDetail,
  type LaneState,
  createDefaultLanes,
  duplicateClipGroup,
  duplicateClipOnLane,
  laneShouldDim,
  moveClipGroup,
  moveClipOnLane,
  placeClipOnLane,
  removeClipFromLane,
  removeClips,
  sampleDurationTicks,
  setLanePan,
  toEngineLanes,
  toggleLaneMute,
  toggleLaneSolo
} from '../lib/playerShell'
import type { Transport } from '../engine/transport'
import { Player } from '../engine/player'
import { formatTimer } from '../lib/formatTimer'
import { useTransportRuntime } from './useTransportRuntime'
import { useUndoHistory } from './useUndoHistory'

const DEFAULT_BPM = 120

const UNDO_HISTORY_LIMIT = 100

type View = 'home' | 'tracker'

export interface TransportEngineState {
  view: View
  timerText: string
  lanes: LaneState[]
  transportState: Transport['state']
  currentTick: number
  bpm: number
  masterGain: number
  masterLevelDb: number
  elapsedMs: number
  canUndo: boolean
  canRedo: boolean
  playerRef: React.RefObject<Player | null>
}

export interface TransportEngineActions {
  setView: (view: View) => void
  placeSampleDetailOnLane: (detail: FooterSampleDetail, laneIndex: number, startTick: number) => void
  moveClipOnLane: (clipId: string, toLaneIndex: number, newStartTick: number) => void
  duplicateClipOnLane: (clipId: string, toLaneIndex: number, newStartTick: number) => void
  moveClipGroup: (moves: ClipGroupEntry[]) => void
  duplicateClipGroup: (sources: ClipGroupEntry[]) => void
  removeClipFromLane: (laneIndex: number, clipId: string) => void
  removeClips: (clipIds: string[]) => void
  undo: () => void
  redo: () => void
  setLanePan: (laneIndex: number, pan: number) => void
  previewSample: (samplePath: string) => void
  getSampleBuffer: (samplePath: string) => Promise<AudioBuffer | null>
  toggleLaneMute: (laneIndex: number) => void
  toggleLaneSolo: (laneIndex: number) => void
  laneShouldDim: (lane: LaneState) => boolean
  transportPlay: () => void
  transportPause: () => void
  transportStop: () => void
  transportSkipBack: () => void
  setBpm: (bpm: number) => void
  setMasterGain: (value: number) => void
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
    active: view === 'tracker',
    getLanes: getEngineLanes,
    initialBpm: DEFAULT_BPM,
    initialMasterGain: 0.8
  })
  const {
    playerRef,
    transportState,
    currentTick,
    bpm,
    masterGain,
    elapsedMs,
    masterLevelDb,
    previewSample,
    getSampleBuffer,
    transportPlay,
    transportPause,
    transportStop,
    transportSkipBack,
    setBpm,
    setMasterGain
  } = runtime

  const { pushEdit, undo, redo, setCurrent } = lanesHistory

  const placeSampleDetailOnLane = useCallback(
    (detail: FooterSampleDetail, laneIndex: number, startTick: number) => {
      const clipTicks = sampleDurationTicks(detail.duration, bpm)
      pushEdit((current) =>
        placeClipOnLane(current, laneIndex, detail.relpath, detail.name, startTick, clipTicks, detail.duration, detail.slot)
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

  const handleMoveClipOnLane = useCallback(
    (clipId: string, toLaneIndex: number, newStartTick: number) => {
      pushEdit((current) => moveClipOnLane(current, clipId, toLaneIndex, newStartTick))
    },
    [pushEdit]
  )

  const handleDuplicateClipOnLane = useCallback(
    (clipId: string, toLaneIndex: number, newStartTick: number) => {
      pushEdit((current) => duplicateClipOnLane(current, clipId, toLaneIndex, newStartTick))
    },
    [pushEdit]
  )

  const handleMoveClipGroup = useCallback(
    (moves: ClipGroupEntry[]) => {
      pushEdit((current) => moveClipGroup(current, moves))
    },
    [pushEdit]
  )

  const handleDuplicateClipGroup = useCallback(
    (sources: ClipGroupEntry[]) => {
      pushEdit((current) => duplicateClipGroup(current, sources))
    },
    [pushEdit]
  )

  const handleRemoveClipFromLane = useCallback(
    (laneIndex: number, clipId: string) => {
      pushEdit((current) => removeClipFromLane(current, laneIndex, clipId))
    },
    [pushEdit]
  )

  const handleRemoveClips = useCallback(
    (clipIds: string[]) => {
      pushEdit((current) => removeClips(current, clipIds))
    },
    [pushEdit]
  )

  const handleSetLanePan = useCallback(
    (laneIndex: number, pan: number) => {
      setCurrent(setLanePan(lanesHistory.currentRef.current, laneIndex, pan))
      // Update the per-lane persistent panner directly so live knob changes
      // affect already-sounding voices without waiting for the next trigger.
      playerRef.current?.setLanePan(laneIndex, pan)
    },
    [setCurrent, lanesHistory.currentRef, playerRef]
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
    masterLevelDb,
    elapsedMs,
    canUndo: lanesHistory.canUndo,
    canRedo: lanesHistory.canRedo,
    playerRef,
    setView,
    placeSampleDetailOnLane,
    moveClipOnLane: handleMoveClipOnLane,
    duplicateClipOnLane: handleDuplicateClipOnLane,
    moveClipGroup: handleMoveClipGroup,
    duplicateClipGroup: handleDuplicateClipGroup,
    removeClipFromLane: handleRemoveClipFromLane,
    removeClips: handleRemoveClips,
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
    setBpm,
    setMasterGain
  }
}
