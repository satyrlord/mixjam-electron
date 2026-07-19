import { expect, test } from './fixtures'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'

test('master loudness worklet loads under production CSP and matches reference signals', async ({ seededPage }) => {
  await seededPage.getByRole('button', { name: 'Start New MixJam' }).click()
  const assetName = readdirSync(resolve(process.cwd(), 'out', 'renderer', 'assets'))
    .find((name) => /^loudness\.worklet-.*\.js$/.test(name))
  expect(assetName).toBeTruthy()
  const processorUrl = new URL(`/assets/${assetName}`, seededPage.url()).href

  const measurements = await seededPage.evaluate(async (url) => {
    const sampleRate = 48000
    const durationSeconds = 20
    const length = sampleRate * durationSeconds
    const context = new OfflineAudioContext(2, length, sampleRate)
    await context.audioWorklet.addModule(url)

    const buffer = context.createBuffer(2, length, sampleRate)
    const amplitude = 10 ** (-23 / 20)
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel)
      for (let frame = 0; frame < data.length; frame++) {
        data[frame] = amplitude * Math.sin(2 * Math.PI * 1000 * frame / sampleRate)
      }
    }

    const source = context.createBufferSource()
    source.buffer = buffer
    const worklet = new AudioWorkletNode(context, 'loudness-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: { interval: 0.1, capacity: durationSeconds }
    })
    type Measurement = {
      integratedLoudness: number
      maximumTruePeakLevel: number
    }
    const measurement = new Promise<Measurement>((resolveMeasurement, rejectMeasurement) => {
      const timeout = window.setTimeout(
        () => rejectMeasurement(new Error('Loudness worklet emitted no offline snapshot')),
        2_000
      )
      worklet.port.onmessage = (event: MessageEvent<{
        currentMeasurements?: Measurement[]
      }>) => {
        const result = event.data.currentMeasurements?.[0]
        if (!result ||
            !Number.isFinite(result.integratedLoudness) ||
            !Number.isFinite(result.maximumTruePeakLevel)) return
        window.clearTimeout(timeout)
        resolveMeasurement(result)
      }
    })
    source.connect(worklet).connect(context.destination)
    source.start()
    const [, result] = await Promise.all([context.startRendering(), measurement])
    worklet.port.close()
    return result
  }, processorUrl)

  // EBU Tech 3341 Test 1 expects -23.0 +/- 0.1 LUFS. The same band-limited
  // sine has an analytical continuous true peak of -23.0 dBTP.
  expect(measurements.integratedLoudness).toBeGreaterThanOrEqual(-23.1)
  expect(measurements.integratedLoudness).toBeLessThanOrEqual(-22.9)
  expect(measurements.maximumTruePeakLevel).toBeGreaterThanOrEqual(-23.1)
  expect(measurements.maximumTruePeakLevel).toBeLessThanOrEqual(-22.9)
})
