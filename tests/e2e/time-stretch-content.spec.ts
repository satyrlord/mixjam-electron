import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from './fixtures'
import { TRACKER_TOTAL_TICKS } from '../../src/renderer/src/lib/arrangement'

declare global {
  interface Window {
    __mixjamTempoVoices: Array<{
      bufferDuration: number
      playbackRate: number
      audibleDuration: number
      when: number
    }>
  }
}

const MOCK_BACKEND_PATH = resolve(process.cwd(), 'tests', 'e2e', 'mock-backend.js')
const SOURCE_DURATION_SECONDS = 48 / 7
const SOURCE_BPM = 140
const PROJECT_BPM = 111

function createSilentPcm16Wav(durationSeconds: number, sampleRate = 8_000): Buffer {
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
  return wav
}

test('project tempo changes resample the source at the placement playback rate', async ({ page }) => {
  const mockBackend = readFileSync(MOCK_BACKEND_PATH, 'utf8')
  const sampleBase64 = createSilentPcm16Wav(SOURCE_DURATION_SECONDS).toString('base64')
  await page.addInitScript({
    content: `${mockBackend}
      ;(() => {
        const binary = atob(${JSON.stringify(sampleBase64)});
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        window.backendAPI.readSampleBytes = () => Promise.resolve(bytes.buffer.slice(0));

        window.__mixjamTempoVoices = [];
        const originalStart = AudioBufferSourceNode.prototype.start;
        AudioBufferSourceNode.prototype.start = function (...args) {
          const offline = this.context instanceof OfflineAudioContext;
          if (!offline && this.buffer) {
            const playbackRate = this.playbackRate.value;
            window.__mixjamTempoVoices.push({
              bufferDuration: this.buffer.duration,
              playbackRate,
              audibleDuration: this.buffer.duration / playbackRate,
              when: args[0] ?? 0
            });
          }
          return originalStart.apply(this, args);
        };
      })();`
  })

  await page.goto(new URL('/', page.url()).href)
  await page.getByRole('button', { name: 'Start New MixJam' }).click()

  const bpmInput = page.getByRole('textbox', { name: 'BPM value' })
  await bpmInput.fill(String(SOURCE_BPM))
  await bpmInput.press('Enter')

  const lane = page.locator('.tracker-lane-canvas').first()
  await lane.evaluate((element, { durationSeconds, totalTicks }) => {
    const rect = element.getBoundingClientRect()
    for (const tick of [0, 128]) {
      const transfer = new DataTransfer()
      transfer.setData('application/mixjam-sample', JSON.stringify({
        name: 'SPHERE001_TRNCE_140_A_SC4(R).wav',
        relpath: 'Sphere/SPHERE001_TRNCE_140_A_SC4(R).wav',
        tags: [],
        bpm: null,
        duration: durationSeconds,
        slot: 8
      }))
      element.dispatchEvent(new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width * tick / totalTicks,
        dataTransfer: transfer
      }))
    }
  }, { durationSeconds: SOURCE_DURATION_SECONDS, totalTicks: TRACKER_TOTAL_TICKS })
  await expect(page.locator('.lane-sample-bubble-canvas-container').first())
    .toHaveAttribute('data-placement-count', '2')

  await bpmInput.fill(String(PROJECT_BPM))
  await bpmInput.press('Enter')
  await page.getByRole('button', { name: 'Play' }).click()
  await page.waitForFunction(
    () => window.__mixjamTempoVoices.length >= 2,
    undefined,
    { timeout: 20_000 }
  )

  const [first, second] = await page.evaluate(() => window.__mixjamTempoVoices)
  const expectedPlaybackRate = PROJECT_BPM / SOURCE_BPM
  expect(first.bufferDuration).toBeCloseTo(SOURCE_DURATION_SECONDS, 3)
  expect(first.playbackRate).toBeCloseTo(expectedPlaybackRate, 5)
  expect(first.audibleDuration).toBeCloseTo(SOURCE_DURATION_SECONDS / expectedPlaybackRate, 3)
  expect(second.playbackRate).toBeCloseTo(expectedPlaybackRate, 5)
  expect(Math.abs(second.when - (first.when + first.audibleDuration))).toBeLessThan(1 / 48_000)
})
