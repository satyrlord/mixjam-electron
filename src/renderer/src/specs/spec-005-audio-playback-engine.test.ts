import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createTransport, tickDurationSeconds } from '../engine/transport'
import { PlaybackEngine } from '../engine/playback-engine'
import { type EngineLane } from '../engine/lane-evaluation'
import { MockAudioContext, MockBufferSourceNode, createMockContext } from '../test/mockAudioContext'
import type { SchedulerClock } from '../engine/scheduler'

function mockClock(): SchedulerClock & { fire: () => void } {
  let pending: (() => void) | null = null
  return {
    fire: () => pending?.(),
    setInterval: vi.fn((cb: () => void) => {
      pending = cb
      return 1
    }),
    clearInterval: vi.fn(() => {
      pending = null
    })
  }
}

// Drain pending microtasks plus one macrotask so fire-and-forget triggerLane
// chains (sample load + decode) settle before assertions.
function flushAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('spec-005 audio playback engine', () => {
  describe('transport (US-001..US-004)', () => {
    // The playhead lives on the audio-clock Scheduler now, so playhead ACs are
    // exercised through PlaybackEngine.currentTick with a mutable mock audio clock.
    function makePlaybackEngine(audioTimeRef: { value: number }): PlaybackEngine {
      return new PlaybackEngine({
        createContext: () => createMockContext() as unknown as AudioContext,
        clock: mockClock(),
        now: () => audioTimeRef.value,
        getLanes: () => [],
        loadSampleBytes: async () => new ArrayBuffer(0),
        bpm: 120
      })
    }

    // AC-001
    it('AC-001: play() transitions to playing and advances the playhead', async () => {
      const transport = createTransport(120)
      transport.play()
      expect(transport.state).toBe('playing')

      const audioTime = { value: 0 }
      const playbackEngine = makePlaybackEngine(audioTime)
      await playbackEngine.start(0)
      expect(playbackEngine.currentTick).toBe(0)
      audioTime.value = tickDurationSeconds(120) * 3 + 0.0001
      expect(playbackEngine.currentTick).toBe(3)
      await playbackEngine.close()
    })

    // AC-002
    it('AC-002: pause() holds the tick and play() resumes from it', async () => {
      const transport = createTransport(120)
      const audioTime = { value: 0 }
      const playbackEngine = makePlaybackEngine(audioTime)

      transport.play()
      await playbackEngine.start(0)
      audioTime.value = tickDurationSeconds(120) * 2 + 0.0001
      transport.pause()
      playbackEngine.pause()
      expect(transport.state).toBe('paused')
      // The playhead is frozen at the paused position even as the clock advances.
      expect(playbackEngine.currentTick).toBe(2)
      audioTime.value = 100
      expect(playbackEngine.currentTick).toBe(2)

      // Resume from the held tick.
      transport.play()
      await playbackEngine.start(playbackEngine.currentTick)
      expect(playbackEngine.currentTick).toBe(2)
      await playbackEngine.close()
    })

    // AC-003
    it('AC-003: stop() resets playhead to 0 and state to stopped', async () => {
      const transport = createTransport(120)
      const audioTime = { value: 0 }
      const playbackEngine = makePlaybackEngine(audioTime)

      transport.play()
      await playbackEngine.start(0)
      audioTime.value = tickDurationSeconds(120) * 4
      transport.stop()
      playbackEngine.stop()
      expect(transport.state).toBe('stopped')
      expect(playbackEngine.currentTick).toBe(0)
      await playbackEngine.close()
    })

    // AC-004
    it('AC-004: BPM 120 -> 62.5ms/step, 140 -> ~53.6ms/step', () => {
      expect(tickDurationSeconds(120) * 1000).toBeCloseTo(62.5, 3)
      expect(tickDurationSeconds(140) * 1000).toBeCloseTo(53.571, 2)
    })

    it('tickToTime converts ticks to absolute audio time at the current tempo', () => {
      const transport = createTransport(120)
      // tick 4 is 4 * 62.5ms = 250ms after the reference at tick 0 / time 10.
      expect(transport.tickToTime(4, 0, 10)).toBeCloseTo(10.25, 5)
    })
  })

  describe('end-to-end playback (US-001, US-005)', () => {
    it('loads a sample, places it on a lane, plays, and triggers a voice', async () => {
      const context = createMockContext()
      const clock = mockClock()
      const audioTime = 0
      const lanes: EngineLane[] = [
        { index: 0, muted: false, solo: false, pan: 0, channelIndex: 0, placements: [{ startTick: 0, durationTicks: 16, samplePath: 'kick.wav' }] }
      ]
      const loadSampleBytes = vi.fn(async () => new ArrayBuffer(16))

      const playbackEngine = new PlaybackEngine({
        createContext: () => context as unknown as AudioContext,
        clock,
        now: () => audioTime,
        getLanes: () => lanes,
        loadSampleBytes,
        bpm: 120
      })

      await playbackEngine.start(0)
      // Let the async triggerLane (sample load + decode) settle.
      await flushAsync()

      expect(loadSampleBytes).toHaveBeenCalledWith('kick.wav')
      expect(context.created.sources.length).toBeGreaterThanOrEqual(1)
      expect(context.created.sources[0].started).toBe(true)
      expect(playbackEngine.audioEngine.activeVoiceCount).toBe(1)

      await playbackEngine.close()
    })

    it('monophonic lane: a new trigger cuts off the previous voice on the same lane', async () => {
      const context = createMockContext()
      const clock = mockClock()
      const audioTime = 0
      const lanes: EngineLane[] = [
        {
          index: 0,
          muted: false,
          solo: false,
          pan: 0,
          channelIndex: 0,
          placements: [
            { startTick: 0, durationTicks: 8, samplePath: 's.wav' },
            { startTick: 1, durationTicks: 8, samplePath: 's.wav' }
          ]
        }
      ]

      const playbackEngine = new PlaybackEngine({
        createContext: () => context as unknown as AudioContext,
        clock,
        now: () => audioTime,
        getLanes: () => lanes,
        loadSampleBytes: async () => new ArrayBuffer(8),
        bpm: 120
      })

      await playbackEngine.start(0)
      // Drain across both triggers.
      await flushAsync()

      const sources = context.created.sources as MockBufferSourceNode[]
      expect(sources.length).toBe(2)
      // The first voice was stopped when the second triggered on the same lane.
      expect(sources[0].stopped).toBe(true)
      await playbackEngine.close()
    })

    it('stop() halts all voices and resets', async () => {
      const context = createMockContext()
      const lanes: EngineLane[] = [
        { index: 0, muted: false, solo: false, pan: 0, channelIndex: 0, placements: [{ startTick: 0, durationTicks: 8, samplePath: 's.wav' }] }
      ]
      const playbackEngine = new PlaybackEngine({
        createContext: () => context as unknown as AudioContext,
        clock: mockClock(),
        now: () => 0,
        getLanes: () => lanes,
        loadSampleBytes: async () => new ArrayBuffer(8),
        bpm: 120
      })
      await playbackEngine.start(0)
      await flushAsync()
      expect(playbackEngine.audioEngine.activeVoiceCount).toBe(1)

      playbackEngine.stop()
      expect(playbackEngine.audioEngine.activeVoiceCount).toBe(0)
      await playbackEngine.close()
    })

    it('a corrupt sample does not crash playback (decode error is swallowed)', async () => {
      const context = new MockAudioContext()
      context.decodeAudioData = vi.fn(async () => {
        throw new Error('corrupt')
      })
      const lanes: EngineLane[] = [
        { index: 0, muted: false, solo: false, pan: 0, channelIndex: 0, placements: [{ startTick: 0, durationTicks: 8, samplePath: 'bad.wav' }] }
      ]
      const playbackEngine = new PlaybackEngine({
        createContext: () => context as unknown as AudioContext,
        clock: mockClock(),
        now: () => 0,
        getLanes: () => lanes,
        loadSampleBytes: async () => new ArrayBuffer(8),
        bpm: 120
      })

      await expect(playbackEngine.start(0)).resolves.toBe(true)
      await flushAsync()
      expect(playbackEngine.audioEngine.activeVoiceCount).toBe(0)
      await playbackEngine.close()
    })
  })

  // AC-012: the engine layer must not import React, DOM, or any UI code.
  describe('AC-012: engine boundary', () => {
    const engineDir = join(__dirname, '..', 'engine')
    const forbidden = [
      /from\s+['"]react['"]/,
      /from\s+['"]react-dom/,
      /from\s+['"]\.\.\/components/,
      /from\s+['"]\.\.\/hooks/,
      /from\s+['"]\.\.\/App/,
      // No DOM access. window.setInterval/clearInterval are the one allowed seam
      // (injectable, so production uses the timer while tests pass a mock clock).
      /\bdocument\b/,
      /\bwindow\.(?!setInterval\b|clearInterval\b)\w/
    ]

    const engineFiles = readdirSync(engineDir).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.test.ts')
    )

    it('lists engine source files', () => {
      expect(engineFiles.length).toBeGreaterThan(0)
    })

    for (const file of engineFiles) {
      it(`${file} has no UI/DOM imports`, () => {
        const src = readFileSync(join(engineDir, file), 'utf8')
        for (const pattern of forbidden) {
          expect(src, `${file} matched ${pattern}`).not.toMatch(pattern)
        }
      })
    }
  })
})
