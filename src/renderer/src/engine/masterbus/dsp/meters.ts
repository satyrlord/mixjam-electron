// Input meter (slot 01, pinned): VU ballistics calibrated so 0 VU reads at
// -18 dBFS, plus per-channel sample-peak lamps (spec-012).

import { flushDenormal, linearToDb } from './util'

const VU_INTEGRATION_MS = 300
// Sample-peak lamp threshold and hold. -3 dBFS: nominal -18 dBFS RMS
// program with healthy transients stays dark; a hot source lights up.
const PEAK_LAMP_THRESHOLD = Math.pow(10, -3 / 20)
const PEAK_HOLD_SECONDS = 1.5

export class InputVuMeter {
  private msState = 0
  private readonly msCoeff: number
  private readonly holdSamples: number
  private peakHoldL = 0
  private peakHoldR = 0

  constructor(sampleRate: number) {
    this.msCoeff = Math.exp(-1000 / (VU_INTEGRATION_MS * sampleRate))
    this.holdSamples = Math.round(PEAK_HOLD_SECONDS * sampleRate)
  }

  process(l: Float32Array, r: Float32Array, n: number): void {
    let ms = this.msState
    const c = this.msCoeff
    let holdL = this.peakHoldL
    let holdR = this.peakHoldR
    for (let i = 0; i < n; i++) {
      const xl = l[i]
      const xr = r[i]
      const mono = (xl + xr) * 0.5
      ms = mono * mono + (ms - mono * mono) * c
      const al = xl < 0 ? -xl : xl
      const ar = xr < 0 ? -xr : xr
      holdL = al >= PEAK_LAMP_THRESHOLD ? this.holdSamples : holdL > 0 ? holdL - 1 : 0
      holdR = ar >= PEAK_LAMP_THRESHOLD ? this.holdSamples : holdR > 0 ? holdR - 1 : 0
    }
    this.msState = flushDenormal(ms)
    this.peakHoldL = holdL
    this.peakHoldR = holdR
  }

  /** VU level in dBFS (UI positions the needle as vuDb + 18). */
  get vuDb(): number {
    return linearToDb(Math.sqrt(this.msState))
  }

  get peakL(): boolean {
    return this.peakHoldL > 0
  }

  get peakR(): boolean {
    return this.peakHoldR > 0
  }

  reset(): void {
    this.msState = 0
    this.peakHoldL = 0
    this.peakHoldR = 0
  }
}
