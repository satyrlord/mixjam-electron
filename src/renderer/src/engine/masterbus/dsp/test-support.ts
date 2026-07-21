// Shared signal generation and measurement helpers for the master bus DSP
// suites. Pure math; imported only by the colocated *.test.ts files.

export const TEST_SAMPLE_RATE = 48000

export function sine(freq: number, seconds: number, amplitude: number, sampleRate = TEST_SAMPLE_RATE, phase = 0): Float32Array {
  const n = Math.round(seconds * sampleRate)
  const out = new Float32Array(n)
  const w = (2 * Math.PI * freq) / sampleRate
  for (let i = 0; i < n; i++) out[i] = amplitude * Math.sin(w * i + phase)
  return out
}

/** Deterministic uniform noise in [-amplitude, amplitude] (LCG-seeded). */
export function seededNoise(samples: number, amplitude: number, seed = 0x2f6e2b1): Float32Array {
  const out = new Float32Array(samples)
  let state = seed >>> 0
  for (let i = 0; i < samples; i++) {
    state = (state * 1664525 + 1013904223) >>> 0
    out[i] = amplitude * ((state / 0xffffffff) * 2 - 1)
  }
  return out
}

export function rmsDb(data: Float32Array, from = 0, to = data.length): number {
  let sum = 0
  const n = to - from
  for (let i = from; i < to; i++) sum += data[i] * data[i]
  const rms = Math.sqrt(sum / n)
  return rms > 1e-12 ? 20 * Math.log10(rms) : -240
}

export function peakDb(data: Float32Array, from = 0, to = data.length): number {
  let peak = 0
  for (let i = from; i < to; i++) {
    const a = data[i] < 0 ? -data[i] : data[i]
    if (a > peak) peak = a
  }
  return peak > 1e-12 ? 20 * Math.log10(peak) : -240
}

/** Goertzel magnitude (amplitude of the sine component) at freq. */
export function toneAmplitude(data: Float32Array, freq: number, from: number, to: number, sampleRate = TEST_SAMPLE_RATE): number {
  const n = to - from
  const w = (2 * Math.PI * freq) / sampleRate
  let re = 0
  let im = 0
  for (let i = 0; i < n; i++) {
    const x = data[from + i]
    re += x * Math.cos(w * i)
    im += x * Math.sin(w * i)
  }
  return (2 * Math.sqrt(re * re + im * im)) / n
}

/**
 * Maximum difference (dBFS) between processed output and the input delayed
 * by `latency` samples, skipping a settle region. -240 means bit-exact.
 */
export function nullDepthDb(input: Float32Array, output: Float32Array, latency: number, settle = 4096, end = output.length): number {
  let maxDiff = 0
  for (let i = settle; i < end; i++) {
    const j = i - latency
    if (j < 0 || j >= input.length) continue
    const d = Math.abs(output[i] - input[j])
    if (d > maxDiff) maxDiff = d
  }
  return maxDiff > 1e-12 ? 20 * Math.log10(maxDiff) : -240
}

export interface BlockProcessor {
  process(l: Float32Array, r: Float32Array, n: number): void
}

/** Drives a processor block-by-block over copies of the inputs. */
export function processBlocks(target: BlockProcessor, inL: Float32Array, inR: Float32Array, blockSize = 128): { l: Float32Array; r: Float32Array } {
  const l = Float32Array.from(inL)
  const r = Float32Array.from(inR)
  const scratchL = new Float32Array(blockSize)
  const scratchR = new Float32Array(blockSize)
  for (let start = 0; start < l.length; start += blockSize) {
    const n = Math.min(blockSize, l.length - start)
    scratchL.set(l.subarray(start, start + n))
    scratchR.set(r.subarray(start, start + n))
    target.process(scratchL, scratchR, n)
    l.set(scratchL.subarray(0, n), start)
    r.set(scratchR.subarray(0, n), start)
  }
  return { l, r }
}

/**
 * Independent true-peak estimate via 8x windowed-sinc interpolation, used
 * to check the limiter against a different estimator than its sidechain.
 */
export function truePeakDb8x(data: Float32Array, from = 0, to = data.length): number {
  const HALF = 16
  let peak = 0
  for (let i = from; i < to; i++) {
    const a = data[i] < 0 ? -data[i] : data[i]
    if (a > peak) peak = a
    for (let sub = 1; sub < 8; sub++) {
      const frac = sub / 8
      let acc = 0
      for (let k = -HALF + 1; k <= HALF; k++) {
        const idx = i + k
        if (idx < 0 || idx >= data.length) continue
        const t = frac - k
        const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t)
        const win = 0.5 * (1 + Math.cos((Math.PI * (k - frac)) / HALF))
        acc += data[idx] * sinc * win
      }
      const av = acc < 0 ? -acc : acc
      if (av > peak) peak = av
    }
  }
  return peak > 1e-12 ? 20 * Math.log10(peak) : -240
}

/** Largest sample-to-sample step, in dBFS. */
export function maxSlewDb(data: Float32Array, from = 1, to = data.length): number {
  let maxStep = 0
  for (let i = Math.max(1, from); i < to; i++) {
    const d = Math.abs(data[i] - data[i - 1])
    if (d > maxStep) maxStep = d
  }
  return maxStep > 1e-12 ? 20 * Math.log10(maxStep) : -240
}
