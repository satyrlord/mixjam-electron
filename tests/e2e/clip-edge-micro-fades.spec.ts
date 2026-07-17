import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { build } from 'vite'

const VIRTUAL_ENTRY = 'virtual:mixjam-clip-fades-test'
const RESOLVED_VIRTUAL_ENTRY = `\0${VIRTUAL_ENTRY}`

declare global {
  interface Window {
    __mixjamFadeAutomation: Array<{
      sampleRate: number
      events: Array<{ type: 'set' | 'linear', value: number, time: number }>
    }>
    mixjamClipFades: {
      createClipEdgeFadePlan(options: {
        sampleRate: number
        clipDurationSeconds: number
        fadeInMs: number
        fadeOutMs: number
        fadeInEnabled: boolean
        fadeOutEnabled: boolean
      }): {
        sampleRate: number
        clipSamples: number
        fadeInSamples: number
        fadeOutSamples: number
      }
      createVoice(options: {
        context: BaseAudioContext
        buffer: AudioBuffer
        destination: AudioNode
        when: number
        laneIndex: number
        playbackRate?: number
        edgeFadePlan?: {
          sampleRate: number
          clipSamples: number
          fadeInSamples: number
          fadeOutSamples: number
        }
      }): unknown
      renderOverlapScenario(options: {
        successorReady: boolean
        wavBase64: string
      }): Promise<{
        boundarySample: number
        sourceSchedule: Array<{ start: number | null, stop: number | null, rate: number }>
        samples: number[]
      }>
    }
  }
}

const MOCK_BACKEND_PATH = resolve(process.cwd(), 'tests', 'e2e', 'mock-backend.js')

async function installClipFadeHarness(page: import('@playwright/test').Page): Promise<void> {
  const plannerPath = resolve(
    process.cwd(),
    'src/renderer/src/engine/clip-edge-fades.ts'
  ).replaceAll('\\', '/')
  const voicePath = resolve(
    process.cwd(),
    'src/renderer/src/engine/voice.ts'
  ).replaceAll('\\', '/')
  const playbackEnginePath = resolve(
    process.cwd(),
    'src/renderer/src/engine/playback-engine.ts'
  ).replaceAll('\\', '/')
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [{
      name: 'mixjam-clip-fades-test-entry',
      resolveId(id) {
        return id === VIRTUAL_ENTRY ? RESOLVED_VIRTUAL_ENTRY : null
      },
      load(id) {
        if (id !== RESOLVED_VIRTUAL_ENTRY) return null
        return `
          import { createClipEdgeFadePlan } from ${JSON.stringify(plannerPath)}
          import { createVoice } from ${JSON.stringify(voicePath)}
          import { PlaybackEngine } from ${JSON.stringify(playbackEnginePath)}

          async function renderOverlapScenario({ successorReady, wavBase64 }) {
            const sampleRate = 48_000
            const bpm = 600
            const boundaryTick = 4
            const boundarySeconds = boundaryTick * 60 / (bpm * 8)
            const context = new OfflineAudioContext(
              2,
              Math.round(sampleRate * 0.12),
              sampleRate
            )
            Object.defineProperties(context, {
              audioWorklet: {
                value: { addModule: () => Promise.reject(new Error('disabled in test')) }
              },
              resume: { value: () => Promise.resolve() },
              close: { value: () => Promise.resolve() }
            })
            const sourceSchedule = []
            const createBufferSource = context.createBufferSource.bind(context)
            context.createBufferSource = () => {
              const source = createBufferSource()
              const schedule = { start: null, stop: null, rate: 1 }
              sourceSchedule.push(schedule)
              const start = source.start.bind(source)
              const stop = source.stop.bind(source)
              source.start = (when, offset, duration) => {
                schedule.start = when ?? 0
                schedule.rate = source.playbackRate.value
                start(when, offset, duration)
              }
              source.stop = (when) => {
                schedule.stop = when ?? 0
                stop(when)
              }
              return source
            }
            const lanes = [{
              index: 0,
              muted: false,
              solo: false,
              pan: 0,
              channelIndex: 0,
              placements: [
                { startTick: 0, durationTicks: 16, samplePath: 'first.wav' },
                {
                  startTick: boundaryTick,
                  durationTicks: 4,
                  samplePath: successorReady ? 'second.wav' : 'missing.wav'
                }
              ]
            }]
            const bytes = () => {
              const binary = atob(wavBase64)
              return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer
            }
            const playback = new PlaybackEngine({
              bpm,
              createContext: () => context,
              clock: { setInterval: () => 1, clearInterval: () => {} },
              now: () => context.currentTime,
              getLanes: () => lanes,
              loadSampleBytes: (samplePath) =>
                Promise.resolve(samplePath === 'missing.wav' ? null : bytes()),
              masterMeter: { warn: () => {} }
            })
            await playback.start(0)
            await new Promise((resolve) => setTimeout(resolve, 0))
            const rendered = await context.startRendering()
            const samples = [...rendered.getChannelData(0)]
            await playback.close()
            return {
              boundarySample: Math.round(boundarySeconds * sampleRate),
              sourceSchedule,
              samples
            }
          }

          window.mixjamClipFades = {
            createClipEdgeFadePlan,
            createVoice,
            renderOverlapScenario
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
  if (Array.isArray(result) || !('output' in result)) {
    throw new Error('Expected one Vite build output')
  }
  const chunk = result.output.find((output) => output.type === 'chunk')
  if (!chunk) throw new Error('Clip fade harness bundle was not emitted')
  await page.addScriptTag({ content: chunk.code, type: 'module' })
}

function createConstantPcm16Wav(durationSeconds: number, sampleRate = 8_000): Buffer {
  const frameCount = Math.round(durationSeconds * sampleRate)
  const dataSize = frameCount * 2
  const wav = Buffer.alloc(44 + dataSize)
  wav.write('RIFF', 0, 'ascii')
  wav.writeUInt32LE(36 + dataSize, 4)
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
  wav.writeUInt32LE(dataSize, 40)
  for (let offset = 44; offset < wav.length; offset += 2) {
    wav.writeInt16LE(16_384, offset)
  }
  return wav
}

test('project clip-edge settings schedule sample-rounded Chromium gain automation', async ({ page }) => {
  const mockBackend = readFileSync(MOCK_BACKEND_PATH, 'utf8')
  const sampleBase64 = createConstantPcm16Wav(1).toString('base64')
  await page.addInitScript({
    content: `${mockBackend}
      ;(() => {
        const binary = atob(${JSON.stringify(sampleBase64)});
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        window.backendAPI.readSampleBytes = () => Promise.resolve(bytes.buffer.slice(0));
        window.__mixjamFadeAutomation = [];
        const originalCreateGain = AudioContext.prototype.createGain;
        AudioContext.prototype.createGain = function () {
          const node = originalCreateGain.call(this);
          const record = { sampleRate: this.sampleRate, events: [] };
          const setValueAtTime = node.gain.setValueAtTime.bind(node.gain);
          const linearRampToValueAtTime = node.gain.linearRampToValueAtTime.bind(node.gain);
          node.gain.setValueAtTime = (value, time) => {
            record.events.push({ type: 'set', value, time });
            return setValueAtTime(value, time);
          };
          node.gain.linearRampToValueAtTime = (value, time) => {
            record.events.push({ type: 'linear', value, time });
            return linearRampToValueAtTime(value, time);
          };
          window.__mixjamFadeAutomation.push(record);
          return node;
        };
      })();`
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Start New MixJam' }).click()

  const enabled = page.getByRole('checkbox', {
    name: 'Enable automatic clip-edge fades'
  })
  const fadeIn = page.getByRole('spinbutton', {
    name: 'Automatic clip fade-in milliseconds'
  })
  const fadeOut = page.getByRole('spinbutton', {
    name: 'Automatic clip fade-out milliseconds'
  })
  await expect(enabled).toBeChecked()
  await expect(fadeIn).toHaveValue('2')
  await expect(fadeOut).toHaveValue('4')

  await enabled.uncheck()
  await expect(fadeIn).toBeDisabled()
  await expect(fadeOut).toBeDisabled()
  await enabled.check()
  await fadeIn.fill('0.5')
  await fadeOut.fill('3.5')

  const lane = page.locator('.tracker-lane-canvas').first()
  await lane.evaluate((element) => {
    const transfer = new DataTransfer()
    transfer.setData('application/mixjam-sample', JSON.stringify({
      name: 'edge.wav',
      relpath: 'Drums/edge.wav',
      tags: [],
      bpm: null,
      duration: 1,
      slot: 0
    }))
    const rect = element.getBoundingClientRect()
    element.dispatchEvent(new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + 2,
      dataTransfer: transfer
    }))
  })
  await page.getByRole('button', { name: 'Play' }).click()
  await page.waitForFunction(() =>
    window.__mixjamFadeAutomation.some((record) => record.events.length >= 4)
  )

  const automation = await page.evaluate(() =>
    window.__mixjamFadeAutomation.find((record) => record.events.length >= 4)
  )
  expect(automation).toBeDefined()
  expect(automation!.events.map(({ type, value }) => ({ type, value }))).toEqual([
    { type: 'set', value: 0 },
    { type: 'linear', value: 1 },
    { type: 'set', value: 1 },
    { type: 'linear', value: 0 }
  ])
  const fadeInSamples = Math.round(automation!.sampleRate * 0.5 / 1000)
  const fadeOutSamples = Math.round(automation!.sampleRate * 3.5 / 1000)
  expect(automation!.events[1]!.time - automation!.events[0]!.time)
    .toBeCloseTo((fadeInSamples - 1) / automation!.sampleRate, 8)
  expect(automation!.events[3]!.time - automation!.events[2]!.time)
    .toBeCloseTo((fadeOutSamples - 1) / automation!.sampleRate, 8)
})

test('Chromium renders zero endpoints and preserves channel ratios', async ({ page }) => {
  await page.route('**/clip-fades-harness.html', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><head></head><body></body></html>'
  }))
  await page.goto('/clip-fades-harness.html')
  await page.unroute('**/clip-fades-harness.html')
  await installClipFadeHarness(page)

  const results = await page.evaluate(async () => {
    const cases = [
      { values: [0.8], audibleSeconds: 0.02, playbackRate: 1 },
      { values: [0.8, -0.4], audibleSeconds: 0.02, playbackRate: 2 },
      { values: [0.8, -0.4, 0.2, -0.1], audibleSeconds: 0.003, playbackRate: 1 }
    ]
    const sampleRate = 48_000

    return Promise.all(cases.map(async ({ values, audibleSeconds, playbackRate }) => {
      const plan = window.mixjamClipFades.createClipEdgeFadePlan({
        sampleRate,
        clipDurationSeconds: audibleSeconds,
        fadeInMs: 2,
        fadeOutMs: 4,
        fadeInEnabled: true,
        fadeOutEnabled: true
      })
      const context = new OfflineAudioContext(values.length, plan.clipSamples, sampleRate)
      const sourceFrames = Math.ceil(plan.clipSamples * playbackRate) + 2
      const buffer = context.createBuffer(values.length, sourceFrames, sampleRate)
      values.forEach((value, channel) => buffer.getChannelData(channel).fill(value))
      window.mixjamClipFades.createVoice({
        context,
        buffer,
        destination: context.destination,
        when: 0,
        laneIndex: 0,
        playbackRate,
        edgeFadePlan: plan
      })
      const rendered = await context.startRendering()
      const channels = values.map((_, channel) => [...rendered.getChannelData(channel)])
      let peakIndex = 0
      for (let index = 1; index < channels[0]!.length; index += 1) {
        if (Math.abs(channels[0]![index]!) > Math.abs(channels[0]![peakIndex]!)) {
          peakIndex = index
        }
      }
      let maximumStep = 0
      for (let index = 1; index < channels[0]!.length; index += 1) {
        maximumStep = Math.max(
          maximumStep,
          Math.abs(channels[0]![index]! - channels[0]![index - 1]!)
        )
      }
      return {
        values,
        plan,
        first: channels.map((channel) => channel[0]),
        last: channels.map((channel) => channel.at(-1)),
        peak: channels.map((channel) => channel[peakIndex]),
        maximumStep
      }
    }))
  })

  for (const result of results) {
    result.first.forEach((sample) => expect(Math.abs(sample ?? 0)).toBeLessThan(1e-6))
    result.last.forEach((sample) => expect(Math.abs(sample ?? 0)).toBeLessThan(1e-6))
    expect(Math.abs(result.peak[0] ?? 0)).toBeGreaterThan(0.1)
    for (let channel = 1; channel < result.values.length; channel += 1) {
      expect((result.peak[channel] ?? 0) / (result.peak[0] ?? 1))
        .toBeCloseTo(result.values[channel]! / result.values[0]!, 5)
    }
    const shortestRamp = Math.max(
      2,
      Math.min(result.plan.fadeInSamples, result.plan.fadeOutSamples)
    )
    expect(result.maximumStep)
      .toBeLessThanOrEqual(Math.abs(result.values[0]!) / (shortestRamp - 1) + 1e-5)
  }
})

test('PlaybackEngine renders ready and failed overlaps at the scheduled cutoff', async ({ page }) => {
  await page.route('**/clip-fades-overlap-harness.html', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><head></head><body></body></html>'
  }))
  await page.goto('/clip-fades-overlap-harness.html')
  await page.unroute('**/clip-fades-overlap-harness.html')
  await installClipFadeHarness(page)

  const wavBase64 = createConstantPcm16Wav(1).toString('base64')
  const [ready, failed] = await page.evaluate(async (encodedWav) => Promise.all([
    window.mixjamClipFades.renderOverlapScenario({
      successorReady: true,
      wavBase64: encodedWav
    }),
    window.mixjamClipFades.renderOverlapScenario({
      successorReady: false,
      wavBase64: encodedWav
    })
  ]), wavBase64)

  const readyBoundary = ready.samples.slice(
    ready.boundarySample - 2,
    ready.boundarySample + 3
  )
  expect(ready.sourceSchedule).toEqual([
    { start: 0, stop: 0.05, rate: 5 },
    { start: 0.05, stop: null, rate: 20 }
  ])
  expect(failed.sourceSchedule).toEqual([
    { start: 0, stop: 0.05, rate: 5 }
  ])
  expect(Math.min(...readyBoundary.map(Math.abs))).toBeGreaterThan(0.05)
  expect(Math.abs(ready.samples[ready.boundarySample - 24] ?? 0)).toBeCloseTo(
    Math.abs(ready.samples[ready.boundarySample + 24] ?? 0),
    3
  )

  const failedPreFade = failed.samples[failed.boundarySample - 288] ?? 0
  const failedEndpoint = failed.samples[failed.boundarySample - 1] ?? 0
  const failedTail = failed.samples.slice(
    failed.boundarySample,
    failed.boundarySample + 128
  )
  expect(Math.abs(failedPreFade)).toBeGreaterThan(0.05)
  expect(Math.abs(failedEndpoint)).toBeLessThan(1e-6)
  expect(Math.max(...failedTail.map(Math.abs))).toBeLessThan(1e-6)
})
