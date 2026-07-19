import { expect, prepareHarnessPage, test } from './fixtures'
import type { Page } from '@playwright/test'
import { resolve } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { build } from 'vite'

const VIRTUAL_ENTRY = 'virtual:mixjam-effects-test'
const RESOLVED_VIRTUAL_ENTRY = `\0${VIRTUAL_ENTRY}`

interface EffectHarnessWindow extends Window {
  mixjamEffects: {
    createReturnModuleProcessor(
      context: BaseAudioContext,
      module: Record<string, unknown>,
      bpm: number
    ): { input: AudioNode; output: AudioNode; dispose(): void }
  }
  mountMixjamTransportHarness(options: {
    wavBytes: number[]
    songEndTick: number
    returnBus: Record<string, unknown>
  }): void
  unmountMixjamTransportHarness(): void
  mixjamTransportStateHistory: string[]
  mixjamTransportHarness: {
    transportState: string
    currentTick: number
    playbackEngineRef: {
      current: {
        activeVoiceCount: number
        audioEngine: { getMasterLevelDb(): number }
      } | null
    }
  }
}

async function installEffectHarness(page: Page): Promise<void> {
  const returnEffectsPath = resolve(process.cwd(), 'src/renderer/src/engine/return-effects.ts').replaceAll('\\', '/')
  const runtimePath = resolve(process.cwd(), 'src/renderer/src/hooks/useTransportRuntime.ts').replaceAll('\\', '/')
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [{
      name: 'mixjam-effects-test-entry',
      resolveId(id) {
        return id === VIRTUAL_ENTRY ? RESOLVED_VIRTUAL_ENTRY : null
      },
      load(id) {
        if (id !== RESOLVED_VIRTUAL_ENTRY) return null
        return `
          import React, { useEffect } from 'react'
          import { createRoot } from 'react-dom/client'
          import { createReturnModuleProcessor } from ${JSON.stringify(returnEffectsPath)}
          import { useTransportRuntime } from ${JSON.stringify(runtimePath)}

          window.mixjamEffects = { createReturnModuleProcessor }
          let root = null

          window.mountMixjamTransportHarness = ({ wavBytes, songEndTick, returnBus }) => {
            window.unmountMixjamTransportHarness?.()
            window.mixjamTransportStateHistory = []
            const host = document.createElement('div')
            host.id = 'mixjam-transport-harness'
            document.body.appendChild(host)
            const bytes = Uint8Array.from(wavBytes).buffer
            const lanes = [{
              index: 0,
              muted: false,
              solo: false,
              pan: 0,
              channelIndex: 0,
              placements: [{ startTick: 0, durationTicks: songEndTick, samplePath: 'impulse.wav' }]
            }]
            const backendAPI = { readSampleBytes: async () => bytes.slice(0) }
            const getLanes = () => lanes
            const getProjectGraphSnapshot = () => ({
              channels: [{
                laneId: 'lane-0', channelIndex: 0, gain: 1, pan: 0,
                muted: false, solo: false, sends: [1, 0, 0, 0]
              }],
              returns: [returnBus]
            })
            const sampleFolder = { id: 'test-samples', name: 'Test Samples' }

            function Harness() {
              const runtime = useTransportRuntime({
                backendAPI,
                sampleFolder,
                active: true,
                getLanes,
                getProjectGraphSnapshot,
                songEndTick,
                initialBpm: 240,
                initialMasterGain: 1
              })
              window.mixjamTransportHarness = runtime
              useEffect(() => {
                window.mixjamTransportStateHistory.push(runtime.transportState)
              }, [runtime.transportState])
              return React.createElement(
                React.Fragment,
                null,
                React.createElement('button', { id: 'harness-play', onClick: runtime.transportPlay }, 'Play'),
                React.createElement('button', { id: 'harness-stop', onClick: runtime.transportStop }, 'Stop'),
                React.createElement('button', { id: 'harness-jump', onClick: runtime.transportJumpToEnd }, 'Jump to End'),
                React.createElement('output', {
                  id: 'harness-state',
                  'data-state': runtime.transportState,
                  'data-tick': runtime.currentTick
                })
              )
            }

            root = createRoot(host)
            root.render(React.createElement(Harness))
          }

          window.unmountMixjamTransportHarness = () => {
            root?.unmount()
            root = null
            document.querySelector('#mixjam-transport-harness')?.remove()
          }
        `
      }
    }],
    build: {
      write: false,
      target: 'es2022',
      rollupOptions: { input: VIRTUAL_ENTRY, output: { format: 'iife' } }
    }
  })
  if (Array.isArray(result) || !('output' in result)) throw new Error('Expected one Vite build output')
  const chunk = result.output.find((output) => output.type === 'chunk')
  if (!chunk) throw new Error('Effect harness bundle was not emitted')
  await page.evaluate(chunk.code)
}

function createImpulseWav(durationSeconds = 1, sampleRate = 44_100): number[] {
  const frameCount = Math.round(durationSeconds * sampleRate)
  const wav = Buffer.alloc(44 + frameCount * 2)
  wav.write('RIFF', 0, 'ascii')
  wav.writeUInt32LE(36 + frameCount * 2, 4)
  wav.write('WAVE', 8, 'ascii')
  wav.write('fmt ', 12, 'ascii')
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(sampleRate, 24)
  wav.writeUInt32LE(sampleRate * 2, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36, 'ascii')
  wav.writeUInt32LE(frameCount * 2, 40)
  for (let frame = 0; frame < 512; frame += 1) {
    wav.writeInt16LE(Math.round(24_000 * (1 - frame / 512)), 44 + frame * 2)
  }
  return [...wav]
}

async function samplePostStopOutput(page: Page, durationMs = 600) {
  return page.evaluate(async (measurementDurationMs) => {
    const harness = (window as unknown as EffectHarnessWindow).mixjamTransportHarness
    const levels: Array<{ elapsedMs: number; levelDb: number }> = []
    const startedAt = performance.now()
    while (performance.now() - startedAt < measurementDurationMs) {
      const engine = harness.playbackEngineRef.current
      levels.push({
        elapsedMs: performance.now() - startedAt,
        levelDb: engine?.audioEngine.getMasterLevelDb() ?? -100
      })
      await new Promise((resolveWait) => setTimeout(resolveWait, 10))
    }
    return {
      transportState: harness.transportState,
      currentTick: harness.currentTick,
      activeVoiceCount: harness.playbackEngineRef.current?.activeVoiceCount ?? -1,
      maximumLevelDb: Math.max(...levels.map((sample) => sample.levelDb)),
      finalLevelDb: levels.at(-1)?.levelDb ?? -100,
      levels
    }
  }, durationMs)
}

test.beforeEach(async ({ page }) => {
  await prepareHarnessPage(page)
  await installEffectHarness(page)
})

test('zero tape distortion preserves over-unity samples in OfflineAudioContext', async ({ page }) => {
  const maximumError = await page.evaluate(async () => {
    const { createReturnModuleProcessor } = (window as unknown as EffectHarnessWindow).mixjamEffects
    const sampleRate = 44_100
    const frameCount = 128
    const context = new OfflineAudioContext(2, frameCount, sampleRate)
    const source = context.createBufferSource()
    const input = context.createBuffer(2, frameCount, sampleRate)
    for (let channel = 0; channel < input.numberOfChannels; channel += 1) {
      input.getChannelData(channel).fill(1.5)
    }
    source.buffer = input
    const processor = createReturnModuleProcessor(context, {
      id: 'identity-delay',
      type: 'delay',
      mode: 'free',
      timeMs: 0,
      noteDivision: '1/8',
      feedback: 0,
      tapeDistortion: 0,
      pingPong: false
    }, 120)
    source.connect(processor.input)
    processor.output.connect(context.destination)
    source.start()
    const rendered = await context.startRendering()
    let error = 0
    for (let channel = 0; channel < rendered.numberOfChannels; channel += 1) {
      const samples = rendered.getChannelData(channel)
      for (let frame = 8; frame < samples.length; frame += 1) {
        error = Math.max(error, Math.abs((samples[frame] ?? 0) - 1.5))
      }
    }
    return error
  })

  expect(maximumError).toBeLessThan(1e-6)
})

test('real Return Delay renders a wet-only echo in Chromium', async ({ page }) => {
  const metrics = await page.evaluate(async () => {
    const { createReturnModuleProcessor } = (window as unknown as EffectHarnessWindow).mixjamEffects
    const sampleRate = 44_100
    const frameCount = Math.ceil(sampleRate * 0.25)
    const context = new OfflineAudioContext(2, frameCount, sampleRate)
    const source = context.createBufferSource()
    const input = context.createBuffer(1, frameCount, sampleRate)
    input.getChannelData(0)[0] = 1
    source.buffer = input
    const processor = createReturnModuleProcessor(context, {
      id: 'delay',
      type: 'delay',
      mode: 'free',
      timeMs: 50,
      noteDivision: '1/8',
      feedback: 0,
      tapeDistortion: 0,
      pingPong: false
    }, 120)
    source.connect(processor.input)
    processor.output.connect(context.destination)
    source.start()
    const delay = await context.startRendering()
    const delaySamples = delay.getChannelData(0)
    const echoFrame = Math.round(sampleRate * 0.05)
    return {
      dryAtStart: Math.abs(delaySamples[0] ?? 0),
      echoAmplitude: Math.abs(delaySamples[echoFrame] ?? 0)
    }
  })

  expect(metrics.dryAtStart).toBeLessThan(0.01)
  expect(metrics.echoAmplitude).toBeGreaterThan(0.9)
})

test('Ring Out preserves Return Delay tails after natural end, Stop, and Jump to End', async ({ page }) => {
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(`Browser console: ${message.text()}`)
  })
  const wavBytes = createImpulseWav()
  const returnBus = {
    index: 0,
    module: {
      id: 'ring-out-delay',
      type: 'delay',
      mode: 'free',
      timeMs: 80,
      noteDivision: '1/8',
      feedback: 60,
      tapeDistortion: 0,
      pingPong: false
    },
    powered: true,
    returnLevel: 1,
    limiterEnabled: false
  }

  async function mount(songEndTick: number) {
    await page.evaluate(({ bytes, endTick, bus }) => {
      (window as unknown as EffectHarnessWindow).mountMixjamTransportHarness({
        wavBytes: bytes,
        songEndTick: endTick,
        returnBus: bus
      })
    }, { bytes: wavBytes, endTick: songEndTick, bus: returnBus })
    await expect(page.locator('#harness-state')).toHaveAttribute('data-state', 'stopped')
    await expect.poll(() => page.evaluate(() => Boolean(
      (window as unknown as EffectHarnessWindow).mixjamTransportHarness.playbackEngineRef.current
    ))).toBe(true)
  }

  async function startPlayback() {
    await page.locator('#harness-play').click()
    await expect.poll(() => page.evaluate(() =>
      (window as unknown as EffectHarnessWindow).mixjamTransportStateHistory.includes('playing')
    )).toBe(true)
  }

  async function assertRingOut(expectedTick: number) {
    await expect(page.locator('#harness-state')).toHaveAttribute('data-state', 'stopped')
    await expect(page.locator('#harness-state')).toHaveAttribute('data-tick', String(expectedTick))
    const measurement = await samplePostStopOutput(page)
    expect(measurement.transportState).toBe('stopped')
    expect(measurement.currentTick).toBe(expectedTick)
    expect(measurement.activeVoiceCount).toBe(0)
    expect(measurement.maximumLevelDb).toBeGreaterThan(-95)
    return measurement
  }

  await mount(8)
  await startPlayback()
  const naturalEnd = await assertRingOut(0)

  await page.waitForTimeout(1_000)
  await startPlayback()
  const replay = await assertRingOut(0)

  await mount(64)
  await startPlayback()
  await page.waitForTimeout(150)
  await page.locator('#harness-stop').click()
  const explicitStop = await assertRingOut(0)

  await mount(64)
  await startPlayback()
  await page.waitForTimeout(150)
  await page.locator('#harness-jump').click()
  const jumpToEnd = await assertRingOut(64)

  const evidenceDirectory = resolve(process.cwd(), 'tmp/verify-fx-song-end')
  const evidence = {
    generatedAt: new Date().toISOString(),
    contract: 'Ring Out',
    returnBus,
    bpm: 240,
    naturalEnd,
    replay,
    explicitStop,
    jumpToEnd
  }
  await mkdir(evidenceDirectory, { recursive: true })
  await writeFile(resolve(evidenceDirectory, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
  await writeFile(resolve(evidenceDirectory, 'evidence.md'), `# FX Song-End Ring Out Evidence

- Contract: Ring Out.
- Surface: real useTransportRuntime, PlaybackEngine, AudioEngine, and Return Delay DSP rendered in Chromium.
- Natural end: transport stopped at tick 0, source voices dropped to zero, and post-boundary output peaked at ${naturalEnd.maximumLevelDb.toFixed(2)} dBFS.
- Replay after tail decay: post-boundary output peaked at ${replay.maximumLevelDb.toFixed(2)} dBFS without rebuilding the effect graph.
- Explicit Stop: transport stopped at tick 0, source voices dropped to zero, and post-stop output peaked at ${explicitStop.maximumLevelDb.toFixed(2)} dBFS.
- Jump to End: transport stopped at tick 64, source voices dropped to zero, and post-stop output peaked at ${jumpToEnd.maximumLevelDb.toFixed(2)} dBFS.

The raw 10ms output-level samples are in evidence.json.
`)
})
