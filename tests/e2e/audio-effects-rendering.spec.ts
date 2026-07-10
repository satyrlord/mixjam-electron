import { test, expect, type Page } from '@playwright/test'
import { resolve } from 'node:path'
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
}

async function installEffectHarness(page: Page): Promise<void> {
  const effectsPath = resolve(process.cwd(), 'src/renderer/src/engine/effects.ts').replaceAll('\\', '/')
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
        return `import { createEffectProcessor } from ${JSON.stringify(effectsPath)}; window.mixjamEffects = { createEffectProcessor }`
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

test.beforeEach(async ({ page }) => {
  await page.goto('about:blank')
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
