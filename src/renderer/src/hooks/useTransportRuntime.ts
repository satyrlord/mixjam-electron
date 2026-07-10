import { useCallback, useEffect, useRef, useState } from 'react'
import type { BackendAPI, FolderRef } from '../../../shared/backend-api'
import { type Transport, createTransport, TICKS_PER_BEAT } from '../engine/transport'
import { Player } from '../engine/player'
import type { EngineLane } from '../engine/lane-evaluation'
import { useSyncedRef } from './useSyncedRef'

type TransportState = Transport['state']

interface UseTransportRuntimeParams {
  backendAPI: BackendAPI
  sampleFolder: FolderRef | null
  active: boolean
  getLanes: () => EngineLane[]
  initialBpm: number
  initialMasterGain: number
}

export interface TransportRuntime {
  playerRef: React.RefObject<Player | null>
  transportState: TransportState
  currentTick: number
  bpm: number
  masterGain: number
  elapsedMs: number
  masterLevelDb: number
  transportPlay: () => void
  transportPause: () => void
  transportStop: () => void
  transportSkipBack: () => void
  previewSample: (samplePath: string) => void
  getSampleBuffer: (samplePath: string) => Promise<AudioBuffer | null>
  setBpm: (nextBpm: number) => void
  setMasterGain: (value: number) => void
}

export function useTransportRuntime({
  backendAPI,
  sampleFolder,
  active,
  getLanes,
  initialBpm,
  initialMasterGain
}: UseTransportRuntimeParams): TransportRuntime {
  const transportRef = useRef<Transport | null>(null)
  const playerRef = useRef<Player | null>(null)
  const [transportState, setTransportState] = useState<TransportState>('stopped')
  const [currentTick, setCurrentTick] = useState(0)
  const [bpm, setBpmState] = useState(initialBpm)
  const [masterGain, setMasterGainState] = useState(initialMasterGain)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [masterLevelDb, setMasterLevelDb] = useState(-100)
  const currentTickRef = useSyncedRef(currentTick)
  const activeRef = useSyncedRef(active)
  const bpmRef = useRef(initialBpm)
  const masterGainRef = useRef(initialMasterGain)
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

  useEffect(() => {
    if (!active) return
    const transport = createTransport(bpmRef.current)
    const player = new Player({
      bpm: bpmRef.current,
      getLanes,
      loadSampleBytes: (samplePath) => {
        if (!sampleFolder) return Promise.resolve(null)
        return backendAPI.readSampleBytes(sampleFolder.id, samplePath)
      }
    })
    player.setMasterGain(masterGainRef.current)
    transportRef.current = transport
    playerRef.current = player
    setTransportState(transport.state)

    const meterTimer = window.setInterval(() => {
      setMasterLevelDb(player.getMasterLevelDb())
      const nextTick = player.currentTick
      currentTickRef.current = nextTick
      setCurrentTick(nextTick)
    }, 100)

    return () => {
      window.clearInterval(meterTimer)
      resetElapsedTimer()
      transport.destroy()
      void player.close()
      transportRef.current = null
      playerRef.current = null
      currentTickRef.current = 0
      setTransportState('stopped')
      setCurrentTick(0)
      setMasterLevelDb(-100)
    }
  }, [active, backendAPI, sampleFolder, getLanes, currentTickRef, resetElapsedTimer])

  const transportPlay = useCallback(() => {
    if (!activeRef.current) return
    const transport = transportRef.current
    if (!transport) return
    const fromTick = playerRef.current?.currentTick ?? currentTickRef.current
    transport.play()
    void playerRef.current?.start(fromTick)
    startElapsedTimer()
    setTransportState(transport.state)
  }, [activeRef, currentTickRef, startElapsedTimer])

  const transportPause = useCallback(() => {
    transportRef.current?.pause()
    playerRef.current?.pause()
    pauseElapsedTimer()
    setTransportState(transportRef.current?.state ?? 'stopped')
  }, [pauseElapsedTimer])

  const transportStop = useCallback(() => {
    transportRef.current?.stop()
    playerRef.current?.stop()
    currentTickRef.current = 0
    resetElapsedTimer()
    setTransportState('stopped')
    setCurrentTick(0)
  }, [currentTickRef, resetElapsedTimer])

  const transportSkipBack = useCallback(() => {
    if (!activeRef.current) return
    const transport = transportRef.current
    const player = playerRef.current
    transport?.skipBack()
    if (player) {
      player.stop()
      if (transport?.state === 'playing') void player.start(0)
    }
    currentTickRef.current = 0
    setCurrentTick(0)
  }, [activeRef, currentTickRef])

  const previewSample = useCallback((samplePath: string) => {
    const player = playerRef.current
    const transport = transportRef.current
    if (!player) return
    if (transport?.state === 'playing') {
      const tick = player.currentTick
      const downbeat = Math.ceil((tick + 1) / TICKS_PER_BEAT) * TICKS_PER_BEAT
      const when = transport.tickToTime(downbeat, tick, player.audioEngine.currentTime)
      void player.previewSample(samplePath, when)
    } else {
      void player.previewSample(samplePath)
    }
  }, [])

  const getSampleBuffer = useCallback(
    (samplePath: string) => playerRef.current?.getSampleBuffer(samplePath) ?? Promise.resolve(null),
    []
  )

  const setBpm = useCallback((nextBpm: number) => {
    bpmRef.current = nextBpm
    setBpmState(nextBpm)
    transportRef.current?.setBpm(nextBpm)
    playerRef.current?.setBpm(nextBpm)
  }, [])

  const setMasterGain = useCallback((value: number) => {
    masterGainRef.current = value
    setMasterGainState(value)
    playerRef.current?.setMasterGain(value)
  }, [])

  return {
    playerRef,
    transportState,
    currentTick,
    bpm,
    masterGain,
    elapsedMs,
    masterLevelDb,
    transportPlay,
    transportPause,
    transportStop,
    transportSkipBack,
    previewSample,
    getSampleBuffer,
    setBpm,
    setMasterGain
  }
}
