import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ElectronAPI } from '../../../shared/ipc'
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
  sampleDurationTicks,
  setLanePan,
  toEngineLanes,
  toggleLaneMute,
  toggleLaneSolo
} from '../lib/playerShell'
import { type Transport, createTransport, TICKS_PER_BEAT } from '../engine/transport'
import { Player } from '../engine/player'
import { formatTimer } from '../lib/formatTimer'

const DEFAULT_BPM = 120

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
}

export interface TransportEngineActions {
  setView: (view: View) => void
  placeSampleDetailOnLane: (detail: FooterSampleDetail, laneIndex: number, startTick: number) => void
  moveClipOnLane: (clipId: string, toLaneIndex: number, newStartTick: number) => void
  duplicateClipOnLane: (clipId: string, toLaneIndex: number, newStartTick: number) => void
  moveClipGroup: (moves: ClipGroupEntry[]) => void
  duplicateClipGroup: (sources: ClipGroupEntry[]) => void
  removeClipFromLane: (laneIndex: number, clipId: string) => void
  setLanePan: (laneIndex: number, pan: number) => void
  previewSample: (samplePath: string) => void
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
  electronAPI: ElectronAPI,
  sampleFolder: string | null,
  initialView: View = 'home'
): TransportEngine {
  const [view, setView] = useState<View>(initialView)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [lanes, setLanes] = useState<LaneState[]>(() => createDefaultLanes())
  const transportRef = useRef<Transport | null>(null)
  const playerRef = useRef<Player | null>(null)
  const lanesRef = useRef<LaneState[]>(lanes)
  const sampleFolderRef = useRef<string | null>(sampleFolder)
  const [transportState, setTransportState] = useState<Transport['state']>('stopped')
  const [currentTick, setCurrentTick] = useState(0)
  // Mirrors currentTick so transport callbacks can read the latest playhead
  // (driven by the audio clock) without re-subscribing.
  const currentTickRef = useRef(0)
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

  // Sync refs to state
  useEffect(() => { lanesRef.current = lanes }, [lanes])
  useEffect(() => { sampleFolderRef.current = sampleFolder }, [sampleFolder])
  useEffect(() => { currentTickRef.current = currentTick }, [currentTick])

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
      getLanes: () => toEngineLanes(lanesRef.current),
      loadSampleBytes: (samplePath) => {
        const folder = sampleFolderRef.current
        if (!folder) return Promise.resolve(null)
        return electronAPI.readSampleBytes(folder, samplePath)
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
  }, [view, electronAPI])

  const placeSampleDetailOnLane = useCallback(
    (detail: FooterSampleDetail, laneIndex: number, startTick: number) => {
      const clipTicks = sampleDurationTicks(detail.duration, bpmRef.current)
      setLanes((current) =>
        placeClipOnLane(current, laneIndex, detail.filepath, detail.name, startTick, clipTicks, detail.duration, detail.color)
      )
    },
    []
  )

  const handleToggleLaneMute = useCallback((laneIndex: number) => {
    setLanes((current) => toggleLaneMute(current, laneIndex))
  }, [])

  const handleToggleLaneSolo = useCallback((laneIndex: number) => {
    setLanes((current) => toggleLaneSolo(current, laneIndex))
  }, [])

  const handleMoveClipOnLane = useCallback(
    (clipId: string, toLaneIndex: number, newStartTick: number) => {
      setLanes((current) => moveClipOnLane(current, clipId, toLaneIndex, newStartTick))
    },
    []
  )

  const handleDuplicateClipOnLane = useCallback(
    (clipId: string, toLaneIndex: number, newStartTick: number) => {
      setLanes((current) => duplicateClipOnLane(current, clipId, toLaneIndex, newStartTick))
    },
    []
  )

  const handleMoveClipGroup = useCallback(
    (moves: ClipGroupEntry[]) => {
      setLanes((current) => moveClipGroup(current, moves))
    },
    []
  )

  const handleDuplicateClipGroup = useCallback(
    (sources: ClipGroupEntry[]) => {
      setLanes((current) => duplicateClipGroup(current, sources))
    },
    []
  )

  const handleRemoveClipFromLane = useCallback(
    (laneIndex: number, clipId: string) => {
      setLanes((current) => removeClipFromLane(current, laneIndex, clipId))
    },
    []
  )

  const handleSetLanePan = useCallback(
    (laneIndex: number, pan: number) => {
      setLanes((current) => setLanePan(current, laneIndex, pan))
      const player = playerRef.current
      if (player) player.setChannelPan(laneIndex, pan)
    },
    []
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

  const transportPlay = useCallback(() => {
    const transport = transportRef.current
    if (!transport) return
    // Resume from the current audio-clock playhead so pause→play continues
    // rather than restarting.
    const fromTick = currentTickRef.current
    transport.play()
    void playerRef.current?.start(fromTick)
    setTransportState(transport.state)
  }, [])

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
  }, [])

  const transportSkipBack = useCallback(() => {
    transportRef.current?.skipBack()
    setCurrentTick(0)
    currentTickRef.current = 0
  }, [])

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
    setView,
    placeSampleDetailOnLane,
    moveClipOnLane: handleMoveClipOnLane,
    duplicateClipOnLane: handleDuplicateClipOnLane,
    moveClipGroup: handleMoveClipGroup,
    duplicateClipGroup: handleDuplicateClipGroup,
    removeClipFromLane: handleRemoveClipFromLane,
    setLanePan: handleSetLanePan,
    previewSample: handlePreviewSample,
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
