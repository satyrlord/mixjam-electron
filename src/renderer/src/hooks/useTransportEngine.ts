import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { type Transport, createTransport, TICKS_PER_BEAT } from '../engine/transport'
import { Player } from '../engine/player'
import { formatTimer } from '../lib/formatTimer'
import { useSyncedRef } from './useSyncedRef'
import { useUndoHistory } from './useUndoHistory'

const DEFAULT_BPM = 120

// Cap on undo history depth. Snapshots are structurally shared immutable lane
// arrays, so each entry costs one array of lane references, not a deep copy.
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
  /** Ref to the Player instance for hooks that need engine access (e.g. useMixer). */
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
  const [elapsedMs, setElapsedMs] = useState(0)
  const lanesHistory = useUndoHistory<LaneState[]>(createDefaultLanes(), UNDO_HISTORY_LIMIT)
  const transportRef = useRef<Transport | null>(null)
  const playerRef = useRef<Player | null>(null)
  const sampleFolderRef = useSyncedRef(sampleFolder)
  const [transportState, setTransportState] = useState<Transport['state']>('stopped')
  const [currentTick, setCurrentTick] = useState(0)
  // Mirrors currentTick so transport callbacks can read the latest playhead
  // (driven by the audio clock) without re-subscribing.
  const currentTickRef = useSyncedRef(currentTick)
  const [bpm, setBpmState] = useState(DEFAULT_BPM)
  const [masterGain, setMasterGainState] = useState(0.8)
  const [masterLevelDb, setMasterLevelDb] = useState(-100)
  const bpmRef = useRef(bpm)
  const masterGainRef = useRef(masterGain)
  const timerRef = useRef<number | null>(null)
  const startRef = useRef<number>(0)
  // Accumulated elapsed ms captured at the moment the current play segment
  // began, so pause→resume continues the timer instead of restarting it.
  const elapsedBaseRef = useRef(0)

  // Elapsed-time display timer — only runs while playing
  useEffect(() => {
    if (view !== 'tracker') {
      // Leaving the tracker fully resets the elapsed display.
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current)
        timerRef.current = null
      }
      elapsedBaseRef.current = 0
      setElapsedMs(0)
      return
    }
    if (transportState !== 'playing') {
      // Pause: stop ticking but remember how much has elapsed so resume continues.
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current)
        timerRef.current = null
        elapsedBaseRef.current += Date.now() - startRef.current
      }
      return
    }
    if (timerRef.current !== null) return
    // Resume/start: continue from the accumulated base.
    startRef.current = Date.now()
    timerRef.current = window.setInterval(() => {
      setElapsedMs(elapsedBaseRef.current + (Date.now() - startRef.current))
    }, 100)
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [view, transportState])

  // Transport + Player lifecycle — created when entering tracker, destroyed on
  // leaving.
  useEffect(() => {
    if (view !== 'tracker') return

    const transport = createTransport(bpmRef.current)
    // The visual playhead is derived from the Player's audio clock (see the
    // meter interval below) so it stays in lock-step with the audible
    // scheduling; the transport timer is kept only for transport state.
    transportRef.current = transport

    const player = new Player({
      bpm: bpmRef.current,
      getLanes: () => toEngineLanes(lanesHistory.currentRef.current),
      loadSampleBytes: (samplePath) => {
        const folder = sampleFolderRef.current
        if (!folder) return Promise.resolve(null)
        return backendAPI.readSampleBytes(folder.id, samplePath)
      }
    })
    player.setMasterGain(masterGainRef.current)
    playerRef.current = player

    const meterTimer = window.setInterval(() => {
      setMasterLevelDb(player.getMasterLevelDb())
      // Drive the visual playhead from the audio clock so it never drifts from
      // the sound (it advances only while the scheduler is running).
      setCurrentTick(player.currentTick)
    }, 100)

    return () => {
      window.clearInterval(meterTimer)
      transport.destroy()
      transportRef.current = null
      void player.close()
      playerRef.current = null
      setTransportState('stopped')
      setCurrentTick(0)
      setMasterLevelDb(-100)
    }
  }, [view, backendAPI, sampleFolderRef, lanesHistory.currentRef])

  // Undo/redo via useUndoHistory — clip edits (place, move, duplicate, remove)
  // push through pushEdit; mute/solo/pan bypass undo via setCurrent.
  const { pushEdit, undo, redo, setCurrent } = lanesHistory

  const placeSampleDetailOnLane = useCallback(
    (detail: FooterSampleDetail, laneIndex: number, startTick: number) => {
      const clipTicks = sampleDurationTicks(detail.duration, bpmRef.current)
      pushEdit((current) =>
        placeClipOnLane(current, laneIndex, detail.relpath, detail.name, startTick, clipTicks, detail.duration, detail.slot)
      )
    },
    [pushEdit]
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
    [setCurrent, lanesHistory.currentRef]
  )

  // Monophonic preview with transport-aware scheduling.
  // When the transport is playing, the preview is delayed until the next
  // downbeat (every TICKS_PER_BEAT ticks = one beat).  When stopped, the
  // preview plays immediately.  Clicking the same sample again stops it.
  const handlePreviewSample = useCallback(
    (samplePath: string) => {
      const player = playerRef.current
      const transport = transportRef.current
      if (!player) return

      // If transport is playing, schedule at the next downbeat. The playhead is
      // read from the Player's audio clock so the quantisation reference matches
      // the scheduler that will actually start the voice.
      if (transport && transport.state === 'playing') {
        const now = player.audioEngine.currentTime
        const currentTick = player.currentTick
        const nextDownbeat = Math.ceil((currentTick + 1) / TICKS_PER_BEAT) * TICKS_PER_BEAT
        const when = transport.tickToTime(nextDownbeat, currentTick, now)
        void player.previewSample(samplePath, when)
      } else {
        void player.previewSample(samplePath)
      }
    },
    []
  )

  const getSampleBuffer = useCallback(
    (samplePath: string) => playerRef.current?.getSampleBuffer(samplePath) ?? Promise.resolve(null),
    []
  )

  const transportPlay = useCallback(() => {
    const transport = transportRef.current
    if (!transport) return
    // Resume from the current audio-clock playhead so pause→play continues
    // rather than restarting. Read the player directly — the mirrored state in
    // currentTickRef is sampled at 10Hz and can lag the real playhead.
    const fromTick = playerRef.current?.currentTick ?? currentTickRef.current
    transport.play()
    void playerRef.current?.start(fromTick)
    setTransportState(transport.state)
  }, [currentTickRef])

  const transportPause = useCallback(() => {
    transportRef.current?.pause()
    playerRef.current?.pause()
    setTransportState(transportRef.current?.state ?? 'stopped')
  }, [])

  const transportStop = useCallback(() => {
    transportRef.current?.stop()
    playerRef.current?.stop()
    setTransportState('stopped')
    setCurrentTick(0)
    currentTickRef.current = 0
    elapsedBaseRef.current = 0
    setElapsedMs(0)
  }, [currentTickRef])

  const transportSkipBack = useCallback(() => {
    const transport = transportRef.current
    const player = playerRef.current
    transport?.skipBack()
    // Reset the scheduler's playhead, not just the UI mirror — otherwise the
    // 10Hz meter interval immediately restores the old position from the
    // scheduler, and play would resume from there instead of the start.
    if (player) {
      player.stop()
      // Keep playing from the top when skip-back is hit mid-playback.
      if (transport?.state === 'playing') void player.start(0)
    }
    setCurrentTick(0)
    currentTickRef.current = 0
  }, [currentTickRef])

  const setBpm = useCallback((nextBpm: number) => {
    setBpmState(nextBpm)
    bpmRef.current = nextBpm
    transportRef.current?.setBpm(nextBpm)
    playerRef.current?.setBpm(nextBpm)
  }, [])

  const setMasterGain = useCallback((value: number) => {
    setMasterGainState(value)
    masterGainRef.current = value
    playerRef.current?.setMasterGain(value)
  }, [])

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
    previewSample: handlePreviewSample,
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
