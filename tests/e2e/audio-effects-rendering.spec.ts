import { test, expect, type Page } from '@playwright/test'
import { resolve } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { build } from 'vite'

const VIRTUAL_ENTRY = 'virtual:mixjam-effects-test'
const RESOLVED_VIRTUAL_ENTRY = `\0${VIRTUAL_ENTRY}`

interface EffectHarnessWindow extends Window {
  mixjamEffects: {
    createEffectProcessor(
      context: BaseAudioContext,
      effect: Record<string, unknown>,
      bpm: number
    ): { input: AudioNode; output: AudioNode; dispose(): void }
  }
  mountMixjamTransportHarness(options: {
    wavBytes: number[]
    songEndTick: number
    effects: Record<string, unknown>[]
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
  const effectsPath = resolve(process.cwd(), 'src/renderer/src/engine/effects.ts').replaceAll('\\', '/')
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
          import { createEffectProcessor } from ${JSON.stringify(effectsPath)}
          import { useTransportRuntime } from ${JSON.stringify(runtimePath)}

          window.mixjamEffects = { createEffectProcessor }
          let root = null

          window.mountMixjamTransportHarness = ({ wavBytes, songEndTick, effects }) => {
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
            const sampleFolder = { id: 'test-samples', name: 'Test Samples' }

            function Harness() {
              const runtime = useTransportRuntime({
                backendAPI,
                sampleFolder,
                active: true,
                getLanes,
                songEndTick,
                initialBpm: 240,
                initialMasterGain: 1
              })
              window.mixjamTransportHarness = runtime
              useEffect(() => {
                runtime.playbackEngineRef.current?.setChannelEffects(0, effects)
              }, [])
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
      rollupOptions: { input: VIRTUAL_ENTRY }
    }
  })
  if (Array.isArray(result) || !('output' in result)) throw new Error('Expected one Vite build output')
  const chunk = result.output.find((output) => output.type === 'chunk')
  if (!chunk) throw new Error('Effect harness bundle was not emitted')
  await page.addScriptTag({ content: chunk.code, type: 'module' })
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
  await page.route('**/audio-effects-harness.html', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><head></head><body></body></html>'
  }))
  await page.goto('/audio-effects-harness.html')
  await page.unroute('**/audio-effects-harness.html')
  await installEffectHarness(page)
})

test('real DSP renders delay, reverb, and compression in Chromium', async ({ page }) => {
  const metrics = await page.evaluate(async () => {
    const { createEffectProcessor } = (window as unknown as EffectHarnessWindow).mixjamEffects
    const sampleRate = 44_100

    async function render(effect: Record<string, unknown>, durationSeconds: number, constantInput = false) {
      const frameCount = Math.ceil(sampleRate * durationSeconds)
      const context = new OfflineAudioContext(2, frameCount, sampleRate)
      const source = context.createBufferSource()
      const input = context.createBuffer(1, frameCount, sampleRate)
      const samples = input.getChannelData(0)
      if (constantInput) samples.fill(1)
      else samples[0] = 1
      source.buffer = input
      const processor = createEffectProcessor(context, effect, 120)
      source.connect(processor.input)
      processor.output.connect(context.destination)
      source.start()
      return context.startRendering()
    }

    async function renderChain(effects: Record<string, unknown>[]) {
      const frameCount = sampleRate
      const context = new OfflineAudioContext(2, frameCount, sampleRate)
      const source = context.createBufferSource()
      const input = context.createBuffer(1, frameCount, sampleRate)
      input.getChannelData(0).fill(1)
      source.buffer = input
      let tail: AudioNode = source
      for (const effect of effects) {
        const processor = createEffectProcessor(context, effect, 120)
        tail.connect(processor.input)
        tail = processor.output
      }
      tail.connect(context.destination)
      source.start()
      return context.startRendering()
    }

    function tailRms(buffer: AudioBuffer): number {
      const samples = buffer.getChannelData(0)
      const start = Math.round(samples.length * 0.75)
      let squareSum = 0
      for (let frame = start; frame < samples.length; frame++) {
        const sample = samples[frame] ?? 0
        squareSum += sample * sample
      }
      return Math.sqrt(squareSum / (samples.length - start))
    }

    const delay = await render({
      id: 'delay', type: 'delay', bypassed: false, timeMs: 50,
      feedback: 0, mix: 1, pingPong: false, tempoSync: false, noteDivision: '1/8'
    }, 0.25)
    const delaySamples = delay.getChannelData(0)
    const echoFrame = Math.round(sampleRate * 0.05)

    const originalRandom = Math.random
    Math.random = () => 0.75
    const reverb = await render({
      id: 'reverb', type: 'reverb', bypassed: false,
      roomSize: 0.7, decay: 0.2, mix: 1
    }, 1)
    Math.random = originalRandom
    const reverbSamples = reverb.getChannelData(0)
    let reverbTailEnergy = 0
    for (let frame = Math.round(sampleRate * 0.1); frame < Math.round(sampleRate * 0.5); frame++) {
      reverbTailEnergy += Math.abs(reverbSamples[frame] ?? 0)
    }

    const compressor = await render({
      id: 'compressor', type: 'compressor', bypassed: false,
      threshold: -30, ratio: 20, attackMs: 1, releaseMs: 100, makeupGain: 0
    }, 1, true)
    const bypassedCompressor = await render({
      id: 'compressor-bypass', type: 'compressor', bypassed: true,
      threshold: -30, ratio: 20, attackMs: 1, releaseMs: 100, makeupGain: 0
    }, 1, true)
    const compressorSamples = compressor.getChannelData(0)
    const bypassedSamples = bypassedCompressor.getChannelData(0)
    let compressedSquareSum = 0
    let bypassedSquareSum = 0
    const compressionStart = Math.round(sampleRate * 0.75)
    for (let frame = compressionStart; frame < sampleRate; frame++) {
      const sample = compressorSamples[frame] ?? 0
      compressedSquareSum += sample * sample
      const bypassedSample = bypassedSamples[frame] ?? 0
      bypassedSquareSum += bypassedSample * bypassedSample
    }
    const compressedRms = Math.sqrt(compressedSquareSum / (sampleRate - compressionStart))
    const bypassedRms = Math.sqrt(bypassedSquareSum / (sampleRate - compressionStart))

    const orderedDelay = {
      id: 'ordered-delay', type: 'delay', bypassed: false, timeMs: 50,
      feedback: 0.5, mix: 0.5, pingPong: false, tempoSync: false, noteDivision: '1/8'
    }
    const orderedCompressor = {
      id: 'ordered-compressor', type: 'compressor', bypassed: false,
      threshold: -30, ratio: 20, attackMs: 1, releaseMs: 100, makeupGain: 0
    }
    const compressionBeforeDelay = tailRms(await renderChain([orderedCompressor, orderedDelay]))
    const delayBeforeCompression = tailRms(await renderChain([orderedDelay, orderedCompressor]))

    return {
      dryAtStart: Math.abs(delaySamples[0] ?? 0),
      echoAmplitude: Math.abs(delaySamples[echoFrame] ?? 0),
      reverbTailEnergy,
      compressedRms,
      bypassedRms,
      orderDifference: Math.abs(compressionBeforeDelay - delayBeforeCompression)
    }
  })

  expect(metrics.dryAtStart).toBeLessThan(0.01)
  expect(metrics.echoAmplitude).toBeGreaterThan(0.9)
  expect(metrics.reverbTailEnergy).toBeGreaterThan(1)
  expect(metrics.compressedRms).toBeGreaterThan(0)
  expect(metrics.compressedRms).toBeLessThan(metrics.bypassedRms * 0.8)
  expect(metrics.orderDifference).toBeGreaterThan(0.05)
})

test('Ring Out preserves effect tails after natural end, Stop, and Jump to End', async ({ page }) => {
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(`Browser console: ${message.text()}`)
  })
  const wavBytes = createImpulseWav()
  const reverb = [{
    id: 'ring-out-reverb',
    type: 'reverb',
    bypassed: false,
    roomSize: 0.8,
    decay: 0.2,
    mix: 1
  }]

  async function mount(songEndTick: number) {
    await page.evaluate(({ bytes, endTick, effects }) => {
      (window as unknown as EffectHarnessWindow).mountMixjamTransportHarness({
        wavBytes: bytes,
        songEndTick: endTick,
        effects
      })
    }, { bytes: wavBytes, endTick: songEndTick, effects: reverb })
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
    effect: reverb[0],
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
- Surface: real useTransportRuntime, PlaybackEngine, AudioEngine, and reverb DSP rendered in Chromium.
- Natural end: transport stopped at tick 0, source voices dropped to zero, and post-boundary output peaked at ${naturalEnd.maximumLevelDb.toFixed(2)} dBFS.
- Replay after tail decay: post-boundary output peaked at ${replay.maximumLevelDb.toFixed(2)} dBFS without rebuilding the effect graph.
- Explicit Stop: transport stopped at tick 0, source voices dropped to zero, and post-stop output peaked at ${explicitStop.maximumLevelDb.toFixed(2)} dBFS.
- Jump to End: transport stopped at tick 64, source voices dropped to zero, and post-stop output peaked at ${jumpToEnd.maximumLevelDb.toFixed(2)} dBFS.

The raw 10ms output-level samples are in evidence.json.
`)
})
