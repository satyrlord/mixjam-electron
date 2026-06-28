export type TransportState = 'stopped' | 'playing' | 'paused'

export interface TransportTickEvent {
  currentTick: number
}

export interface TransportScheduler {
  setInterval(callback: () => void, intervalMs: number): number
  clearInterval(handle: number): void
}

function defaultScheduler(): TransportScheduler {
  return {
    setInterval: (callback, intervalMs) => window.setInterval(callback, intervalMs),
    clearInterval: (handle) => window.clearInterval(handle)
  }
}

export interface Transport {
  readonly state: TransportState
  readonly currentTick: number
  readonly bpm: number

  play(): void
  pause(): void
  stop(): void
  skipBack(): void
  setBpm(bpm: number): void
  setOnTick(callback: ((event: TransportTickEvent) => void) | null): void
  destroy(): void
}

const TICKS_PER_BEAT = 8

function tickIntervalMs(bpm: number): number {
  return 60000 / bpm / TICKS_PER_BEAT
}

export function createTransport(bpm = 120, scheduler: TransportScheduler = defaultScheduler()): Transport {
  let state: TransportState = 'stopped'
  let currentTick = 0
  let currentBpm = bpm
  let timerHandle: number | null = null
  let onTick: ((event: TransportTickEvent) => void) | null = null

  function clearTimer(): void {
    if (timerHandle !== null) {
      scheduler.clearInterval(timerHandle)
      timerHandle = null
    }
  }

  function advance(): void {
    currentTick += 1
    onTick?.({ currentTick })
  }

  function startTimer(): void {
    clearTimer()
    timerHandle = scheduler.setInterval(advance, tickIntervalMs(currentBpm))
  }

  const transport: Transport = {
    get state() {
      return state
    },

    get currentTick() {
      return currentTick
    },

    get bpm() {
      return currentBpm
    },

    play(): void {
      if (state === 'playing') return
      state = 'playing'
      startTimer()
    },

    pause(): void {
      if (state !== 'playing') return
      state = 'paused'
      clearTimer()
    },

    stop(): void {
      state = 'stopped'
      clearTimer()
      currentTick = 0
    },

    skipBack(): void {
      currentTick = 0
    },

    setBpm(newBpm: number): void {
      currentBpm = newBpm
      if (state === 'playing') {
        startTimer()
      }
    },

    setOnTick(callback: ((event: TransportTickEvent) => void) | null): void {
      onTick = callback
    },

    destroy(): void {
      clearTimer()
      onTick = null
    }
  }

  return transport
}

