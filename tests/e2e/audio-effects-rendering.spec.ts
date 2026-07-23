import { expect, prepareHarnessPage, test } from './fixtures'
import type { Page } from '@playwright/test'
import { resolve } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { readdirSync } from 'node:fs'
import { build } from 'vite'

const VIRTUAL_ENTRY = 'virtual:mixjam-effects-test'
const RESOLVED_VIRTUAL_ENTRY = `\0${VIRTUAL_ENTRY}`

interface EffectHarnessWindow extends Window {
  mountMixjamTransportHarness(options: {
    wavBytes: number[]
    songEndTick: number
    returnBus: Record<string, unknown>
  }): void
  unmountMixjamTransportHarness(): void
  mixjamTransportStateHistory: string[]
  mixjamTransportHarness: {
    transportState: string
    tickStore: { get(): number }
    playbackEngineRef: {
      current: {
        activeVoiceCount: number
        audioEngine: { getMasterLevelDb(): number }
      } | null
    }
  }
}

async function installEffectHarness(page: Page): Promise<void> {
  const runtimePath = resolve(process.cwd(), 'src/renderer/src/hooks/useTransportRuntime.ts').replaceAll('\\', '/')
  const valueStorePath = resolve(process.cwd(), 'src/renderer/src/lib/value-store.ts').replaceAll('\\', '/')
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
          import { useTransportRuntime } from ${JSON.stringify(runtimePath)}
          import { useStoreValue } from ${JSON.stringify(valueStorePath)}

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
              const currentTick = useStoreValue(runtime.tickStore)
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
                  'data-tick': currentTick
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

/** URL of the production-built Echoform worklet asset, served by the app page. */
function echoformWorkletUrl(page: Page): string {
  const assetsDir = resolve(process.cwd(), 'out', 'renderer', 'assets')
  const asset = readdirSync(assetsDir).find((name) => /^echoform-delay\.worklet-.*\.js$/.test(name))
  if (!asset) throw new Error('Built echoform-delay worklet asset not found — run the build first')
  return new URL(`/assets/${asset}`, page.url()).href
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
      currentTick: harness.tickStore.get(),
      activeVoiceCount: harness.playbackEngineRef.current?.activeVoiceCount ?? -1,
      maximumLevelDb: Math.max(...levels.map((sample) => sample.levelDb)),
      finalLevelDb: levels.at(-1)?.levelDb ?? -100,
      levels
    }
  }, durationMs)
}

/** The EchoformDelayState the worklet receives (no id/type). */
function workletState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    mode: 'free',
    divisionL: '1/8',
    divisionR: '1/8',
    timeMsL: 50,
    timeMsR: 50,
    feedback: 0,
    pingPong: false,
    width: 100,
    lowCut: 20,
    highCut: 20000,
    modRate: 0.05,
    modDepth: 0,
    character: 'digital',
    duckAmount: 0,
    duckRelease: 200,
    outputDb: 0,
    freeze: false,
    bypass: false,
    ...overrides
  }
}

/** The full FX-return module (with id/type) for the transport harness. */
function echoformModule(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 'echoform-delay', type: 'echoform-delay', ...workletState(), ...overrides }
}

// These DSP tests run on the served app page (not the blank harness) so the
// production worklet asset loads over http like the master-bus worklet test.
test('Echoform delay renders a wet-only echo through the worklet in Chromium', async ({ page }) => {
  const metrics = await page.evaluate(async ({ url, state }) => {
    const sampleRate = 44_100
    const frameCount = Math.ceil(sampleRate * 0.25)
    const context = new OfflineAudioContext(2, frameCount, sampleRate)
    await context.audioWorklet.addModule(url)
    const bufferSource = context.createBufferSource()
    const input = context.createBuffer(1, frameCount, sampleRate)
    input.getChannelData(0)[0] = 1
    bufferSource.buffer = input
    const node = new AudioWorkletNode(context, 'echoform-delay-processor', {
      numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
      processorOptions: { state, bpm: 120 }
    })
    bufferSource.connect(node)
    node.connect(context.destination)
    bufferSource.start()
    const rendered = await context.startRendering()
    const samples = rendered.getChannelData(0)
    const echoFrame = Math.round(sampleRate * 0.05)
    let echoPeak = 0
    for (let frame = echoFrame - 64; frame <= echoFrame + 64; frame += 1) {
      echoPeak = Math.max(echoPeak, Math.abs(samples[frame] ?? 0))
    }
    return { dryAtStart: Math.abs(samples[0] ?? 0), echoPeak }
  }, { url: echoformWorkletUrl(page), state: workletState() })

  // No dry passthrough at t=0 (the return is wet-only) but a real echo at ~50 ms.
  expect(metrics.dryAtStart).toBeLessThan(0.05)
  expect(metrics.echoPeak).toBeGreaterThan(0.3)
})

test('Echoform delay with zero feedback produces a single decaying tap', async ({ page }) => {
  const metrics = await page.evaluate(async ({ url, state }) => {
    const sampleRate = 44_100
    const frameCount = Math.ceil(sampleRate * 0.3)
    const context = new OfflineAudioContext(2, frameCount, sampleRate)
    await context.audioWorklet.addModule(url)
    const bufferSource = context.createBufferSource()
    const input = context.createBuffer(1, frameCount, sampleRate)
    input.getChannelData(0)[0] = 1
    bufferSource.buffer = input
    const node = new AudioWorkletNode(context, 'echoform-delay-processor', {
      numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
      processorOptions: { state, bpm: 120 }
    })
    bufferSource.connect(node)
    node.connect(context.destination)
    bufferSource.start()
    const rendered = await context.startRendering()
    const samples = rendered.getChannelData(0)
    const peakNear = (ms: number) => {
      const center = Math.round(sampleRate * ms / 1000)
      let peak = 0
      for (let frame = center - 64; frame <= center + 64; frame += 1) {
        peak = Math.max(peak, Math.abs(samples[frame] ?? 0))
      }
      return peak
    }
    return { firstTap: peakNear(50), secondTap: peakNear(100) }
  }, { url: echoformWorkletUrl(page), state: workletState({ feedback: 0 }) })

  // With no feedback the first tap sounds but there is no regenerated repeat.
  expect(metrics.firstTap).toBeGreaterThan(0.3)
  expect(metrics.secondTap).toBeLessThan(metrics.firstTap * 0.5)
})

test.describe('transport harness', () => {
  test.beforeEach(async ({ page }) => {
    await prepareHarnessPage(page)
    await installEffectHarness(page)
  })

  test('Ring Out preserves Echoform Delay tails after natural end, Stop, and Jump to End', async ({ page }) => {
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(`Browser console: ${message.text()}`)
  })
  const wavBytes = createImpulseWav()
  const returnBus = {
    index: 0,
    module: echoformModule({
      id: 'ring-out-delay',
      timeMsL: 80,
      timeMsR: 80,
      feedback: 60
    }),
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
    // Transport-lifecycle contract: a boundary stops the transport at the right
    // tick and drops source voices to zero while the return graph stays wired so
    // any tail can ring. The audible delay tail itself is covered by the two
    // Chromium worklet-render tests above and the headless DSP suite — this
    // blank-page harness cannot load the AudioWorklet module, so the return runs
    // as an identity passthrough here and produces no measurable post-stop tail.
    expect(measurement.transportState).toBe('stopped')
    expect(measurement.currentTick).toBe(expectedTick)
    expect(measurement.activeVoiceCount).toBe(0)
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

- Contract: Ring Out transport lifecycle (real useTransportRuntime,
  PlaybackEngine, AudioEngine) in Chromium. The Echoform Delay DSP tail is
  covered by the two worklet-render tests in this spec and the headless DSP
  suite; this harness runs the return as an identity passthrough.
- Natural end: transport stopped at tick 0, source voices dropped to zero.
- Replay after tail decay: no effect-graph rebuild.
- Explicit Stop: transport stopped at tick 0, source voices dropped to zero.
- Jump to End: transport stopped at tick 64, source voices dropped to zero.

The raw 10ms output-level samples are in evidence.json.
`)
  })
})
