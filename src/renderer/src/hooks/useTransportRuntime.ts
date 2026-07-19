import { useCallback, useEffect, useRef, useState } from 'react'
import type { BackendAPI, FolderRef } from '../../../shared/backend-api'
import { type Transport, type TransportState, createTransport, TICKS_PER_BEAT } from '../engine/transport'
import { PlaybackEngine, type PlaybackProjectGraphSnapshot } from '../engine/playback-engine'
import type { EngineLane } from '../engine/lane-evaluation'
import { useSyncedRef } from './useSyncedRef'
import {
  emptyMasterMeterSnapshot,
  masterMeterSnapshotsEqual,
  type MasterMeterSnapshot
} from '../engine/master-meter'
import {
  DEFAULT_CLIP_EDGE_MICRO_FADES,
  normalizeClipEdgeMicroFades,
  type ClipEdgeMicroFadeSettings
} from '../engine/clip-edge-fades'
import type { ProjectSongState } from '../project/project-state'

export type RuntimeTransportState = TransportState | 'preparing'

interface UseTransportRuntimeParams {
  backendAPI: BackendAPI
  sampleFolder: FolderRef | null
  active: boolean
  getLanes: () => EngineLane[]
  getProjectGraphSnapshot: () => PlaybackProjectGraphSnapshot
  songEndTick: number
  initialBpm: number
  initialMasterGain: number
  initialClipEdgeMicroFades?: ClipEdgeMicroFadeSettings
}

export interface TransportRuntime {
  playbackEngineRef: React.RefObject<PlaybackEngine | null>
  transportState: RuntimeTransportState
  currentTick: number
  bpm: number
  masterGain: number
  clipEdgeMicroFades: ClipEdgeMicroFadeSettings
  elapsedMs: number
  masterMeter: MasterMeterSnapshot
  transportPlay: () => void
  transportPause: () => void
  transportStop: () => void
  transportSkipBack: () => void
  transportJumpToEnd: () => void
  transportSeek: (tick: number) => void
  previewSample: (samplePath: string, nativeBPM?: number | null) => void
  getSampleBuffer: (samplePath: string) => Promise<AudioBuffer | null>
  setBpm: (nextBpm: number) => void
  setMasterGain: (value: number) => void
  setClipEdgeMicroFades: (settings: ClipEdgeMicroFadeSettings) => void
  replaceSongState: (song: ProjectSongState) => void
  resetMasterMeter: () => void
}

export function useTransportRuntime({
  backendAPI,
  sampleFolder,
  active,
  getLanes,
  getProjectGraphSnapshot,
  songEndTick,
  initialBpm,
  initialMasterGain,
  initialClipEdgeMicroFades
}: UseTransportRuntimeParams): TransportRuntime {
  const transportRef = useRef<Transport | null>(null)
  const playbackEngineRef = useRef<PlaybackEngine | null>(null)
  const [transportState, setTransportState] = useState<RuntimeTransportState>('stopped')
  const [currentTick, setCurrentTick] = useState(0)
  const [bpm, setBpmState] = useState(initialBpm)
  const [masterGain, setMasterGainState] = useState(initialMasterGain)
  const initialFades = initialClipEdgeMicroFades ?? DEFAULT_CLIP_EDGE_MICRO_FADES
  const [clipEdgeMicroFades, setClipEdgeMicroFadesState] = useState(initialFades)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [masterMeter, setMasterMeter] = useState<MasterMeterSnapshot>(
    emptyMasterMeterSnapshot()
  )
  const currentTickRef = useSyncedRef(currentTick)
  const songEndTickRef = useSyncedRef(songEndTick)
  const activeRef = useSyncedRef(active)
  const getLanesRef = useSyncedRef(getLanes)
  const projectGraphSnapshotRef = useSyncedRef(getProjectGraphSnapshot)
  const bpmRef = useRef(initialBpm)
  const masterGainRef = useRef(initialMasterGain)
  const clipEdgeMicroFadesRef = useRef(initialFades)
  const runtimeStateRef = useRef<RuntimeTransportState>('stopped')
  const startRequestRef = useRef<number | null>(null)
  const nextStartRequestRef = useRef(0)
  const timerRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const elapsedBaseRef = useRef(0)

  const clearElapsedTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const startElapsedTimer = useCallback(() => {
    if (timerRef.current !== null) return
    startedAtRef.current = Date.now()
    timerRef.current = window.setInterval(() => {
      setElapsedMs(elapsedBaseRef.current + Date.now() - startedAtRef.current)
    }, 100)
  }, [])

  const pauseElapsedTimer = useCallback(() => {
    if (timerRef.current === null) return
    elapsedBaseRef.current += Date.now() - startedAtRef.current
    setElapsedMs(elapsedBaseRef.current)
    clearElapsedTimer()
  }, [clearElapsedTimer])

  const resetElapsedTimer = useCallback(() => {
    clearElapsedTimer()
    elapsedBaseRef.current = 0
    setElapsedMs(0)
  }, [clearElapsedTimer])

  const commitTransportState = useCallback((state: RuntimeTransportState) => {
    runtimeStateRef.current = state
    setTransportState(state)
  }, [])

  const cancelPendingStart = useCallback(() => {
    nextStartRequestRef.current += 1
    startRequestRef.current = null
  }, [])

  const prepareAndStart = useCallback((fromTick: number) => {
    if (!activeRef.current || startRequestRef.current !== null) return
    const transport = transportRef.current
    const playbackEngine = playbackEngineRef.current
    if (!transport || !playbackEngine) return

    const requestId = ++nextStartRequestRef.current
    startRequestRef.current = requestId
    commitTransportState('preparing')

    void playbackEngine.start(fromTick)
      .then((started) => {
        if (startRequestRef.current !== requestId || !activeRef.current) return
        startRequestRef.current = null
        if (!started) {
          commitTransportState(transport.state)
          return
        }
        transport.play()
        startElapsedTimer()
        commitTransportState('playing')
      })
      .catch((error: unknown) => {
        if (startRequestRef.current !== requestId) return
        startRequestRef.current = null
        commitTransportState(transport.state)
        console.error('Failed to prepare playback:', error)
      })
  }, [activeRef, commitTransportState, startElapsedTimer])

  const restartAfterPreparation = useCallback((fromTick: number) => {
    const transport = transportRef.current
    const playbackEngine = playbackEngineRef.current
    if (!transport || !playbackEngine) return

    cancelPendingStart()
    pauseElapsedTimer()
    if (transport.state === 'playing') transport.pause()
    playbackEngine.seek(fromTick)
    prepareAndStart(fromTick)
  }, [cancelPendingStart, pauseElapsedTimer, prepareAndStart])

  const stopAndReset = useCallback(() => {
    cancelPendingStart()
    transportRef.current?.stop()
    playbackEngineRef.current?.stop()
    currentTickRef.current = 0
    resetElapsedTimer()
    commitTransportState('stopped')
    setCurrentTick(0)
  }, [cancelPendingStart, commitTransportState, currentTickRef, resetElapsedTimer])

  useEffect(() => {
    if (!active) return
    const transport = createTransport(bpmRef.current)
    const playbackEngine = new PlaybackEngine({
      bpm: bpmRef.current,
      getLanes: () => getLanesRef.current(),
      loadSampleBytes: (samplePath) => {
        if (!sampleFolder) return Promise.resolve(null)
        return backendAPI.readSampleBytes(sampleFolder.id, samplePath)
      },
      clipEdgeMicroFades: clipEdgeMicroFadesRef.current
    })
    playbackEngine.setMasterGain(masterGainRef.current)
    playbackEngine.applyProjectGraphSnapshot(projectGraphSnapshotRef.current())
    transportRef.current = transport
    playbackEngineRef.current = playbackEngine
    commitTransportState(transport.state)

    const meterTimer = window.setInterval(() => {
      const nextMeter = playbackEngine.getMasterMeterSnapshot()
      setMasterMeter((current) => masterMeterSnapshotsEqual(current, nextMeter) ? current : nextMeter)
      const nextTick = playbackEngine.currentTick
      if ((runtimeStateRef.current === 'playing' || runtimeStateRef.current === 'preparing') &&
          nextTick >= songEndTickRef.current) {
        stopAndReset()
        return
      }
      currentTickRef.current = nextTick
      setCurrentTick(nextTick)
    }, 100)

    return () => {
      window.clearInterval(meterTimer)
      resetElapsedTimer()
      cancelPendingStart()
      void playbackEngine.close()
      transportRef.current = null
      playbackEngineRef.current = null
      currentTickRef.current = 0
      commitTransportState('stopped')
      setCurrentTick(0)
      setMasterMeter(emptyMasterMeterSnapshot())
    }
  }, [active, backendAPI, sampleFolder, getLanesRef, projectGraphSnapshotRef, currentTickRef, songEndTickRef, resetElapsedTimer, cancelPendingStart, commitTransportState, stopAndReset])

  const transportPlay = useCallback(() => {
    if (!activeRef.current) return
    if (runtimeStateRef.current === 'playing' || runtimeStateRef.current === 'preparing') return
    const endTick = songEndTickRef.current
    if (endTick <= 0) return
    const playbackEngine = playbackEngineRef.current
    const requestedTick = playbackEngine?.currentTick ?? currentTickRef.current
    const replayFromStart = requestedTick >= endTick
    const fromTick = replayFromStart ? 0 : requestedTick
    if (replayFromStart) {
      playbackEngine?.seek(0)
      currentTickRef.current = 0
      setCurrentTick(0)
    }
    prepareAndStart(fromTick)
  }, [activeRef, currentTickRef, prepareAndStart, songEndTickRef])

  const transportPause = useCallback(() => {
    cancelPendingStart()
    transportRef.current?.pause()
    playbackEngineRef.current?.pause()
    pauseElapsedTimer()
    commitTransportState(transportRef.current?.state ?? 'stopped')
  }, [cancelPendingStart, commitTransportState, pauseElapsedTimer])

  const transportStop = stopAndReset

  const transportSkipBack = useCallback(() => {
    if (!activeRef.current) return
    const playbackEngine = playbackEngineRef.current
    const shouldResume = runtimeStateRef.current === 'playing' || runtimeStateRef.current === 'preparing'
    if (playbackEngine) {
      if (shouldResume) restartAfterPreparation(0)
      else playbackEngine.seek(0)
    }
    currentTickRef.current = 0
    setCurrentTick(0)
  }, [activeRef, currentTickRef, restartAfterPreparation])

  const transportJumpToEnd = useCallback(() => {
    if (!activeRef.current) return
    const endTick = songEndTickRef.current
    if (endTick <= 0) return
    cancelPendingStart()
    transportRef.current?.stop()
    const playbackEngine = playbackEngineRef.current
    playbackEngine?.stop()
    playbackEngine?.seek(endTick)
    currentTickRef.current = endTick
    resetElapsedTimer()
    commitTransportState('stopped')
    setCurrentTick(endTick)
  }, [activeRef, cancelPendingStart, commitTransportState, currentTickRef, resetElapsedTimer, songEndTickRef])

  const transportSeek = useCallback((tick: number) => {
    if (!activeRef.current) return
    const nextTick = Math.max(0, Math.floor(tick))
    const playbackEngine = playbackEngineRef.current
    const shouldResume = runtimeStateRef.current === 'playing' || runtimeStateRef.current === 'preparing'
    if (playbackEngine) {
      if (shouldResume) restartAfterPreparation(nextTick)
      else playbackEngine.seek(nextTick)
    }
    currentTickRef.current = nextTick
    setCurrentTick(nextTick)
  }, [activeRef, currentTickRef, restartAfterPreparation])

  useEffect(() => {
    const tick = currentTickRef.current
    const isRunning = runtimeStateRef.current === 'playing' || runtimeStateRef.current === 'preparing'
    if (isRunning && tick >= songEndTick) {
      stopAndReset()
      return
    }
    if (!isRunning && tick > songEndTick) {
      playbackEngineRef.current?.seek(songEndTick)
      currentTickRef.current = songEndTick
      setCurrentTick(songEndTick)
    }
  }, [currentTickRef, songEndTick, stopAndReset])

  const previewSample = useCallback((samplePath: string, nativeBPM: number | null = null) => {
    const playbackEngine = playbackEngineRef.current
    const transport = transportRef.current
    if (!playbackEngine) return
    if (transport?.state === 'playing') {
      const tick = playbackEngine.currentTick
      const downbeat = Math.ceil((tick + 1) / TICKS_PER_BEAT) * TICKS_PER_BEAT
      const when = transport.tickToTime(downbeat, tick, playbackEngine.audioEngine.currentTime)
      void playbackEngine.previewSample(samplePath, nativeBPM, when)
    } else {
      void playbackEngine.previewSample(samplePath, nativeBPM)
    }
  }, [])

  const getSampleBuffer = useCallback(
    (samplePath: string) => playbackEngineRef.current?.getSampleBuffer(samplePath) ?? Promise.resolve(null),
    []
  )

  const setBpm = useCallback((nextBpm: number) => {
    bpmRef.current = nextBpm
    setBpmState(nextBpm)
    transportRef.current?.setBpm(nextBpm)
    playbackEngineRef.current?.setBpm(nextBpm)
    const playbackEngine = playbackEngineRef.current
    if (!playbackEngine) return
    if (runtimeStateRef.current === 'playing' || runtimeStateRef.current === 'preparing') {
      restartAfterPreparation(playbackEngine.currentTick)
    }
  }, [restartAfterPreparation])

  const setMasterGain = useCallback((value: number) => {
    masterGainRef.current = value
    setMasterGainState(value)
    playbackEngineRef.current?.setMasterGain(value)
  }, [])

  const setClipEdgeMicroFades = useCallback((settings: ClipEdgeMicroFadeSettings) => {
    const normalized = normalizeClipEdgeMicroFades(settings)
    clipEdgeMicroFadesRef.current = normalized
    setClipEdgeMicroFadesState(normalized)
    playbackEngineRef.current?.setClipEdgeMicroFades(normalized)
  }, [])

  const replaceSongState = useCallback((song: ProjectSongState) => {
    setBpm(song.bpm)
    setMasterGain(song.masterGain)
    setClipEdgeMicroFades(song.clipEdgeMicroFades)
  }, [setBpm, setClipEdgeMicroFades, setMasterGain])

  const resetMasterMeter = useCallback(() => {
    const playbackEngine = playbackEngineRef.current
    if (!playbackEngine) return
    playbackEngine.resetMasterMeter()
    setMasterMeter(playbackEngine.getMasterMeterSnapshot())
  }, [])

  return {
    playbackEngineRef,
    transportState,
    currentTick,
    bpm,
    masterGain,
    clipEdgeMicroFades,
    elapsedMs,
    masterMeter,
    transportPlay,
    transportPause,
    transportStop,
    transportSkipBack,
    transportJumpToEnd,
    transportSeek,
    previewSample,
    getSampleBuffer,
    setBpm,
    setMasterGain,
    setClipEdgeMicroFades,
    replaceSongState,
    resetMasterMeter
  }
}
