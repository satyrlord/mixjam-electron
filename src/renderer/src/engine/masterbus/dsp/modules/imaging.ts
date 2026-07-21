// Stereo Imaging (spec-012): mid/side processing where the mid signal
// passes through untouched and only the side signal is filtered. The low
// side band is discarded (mono below the crossover) and the high side band
// is scaled by Width. Because L+R = 2M at every sample, mono compatibility
// is exact by construction, and mono input nulls bit-exactly at any
// setting.

import type { BusModule, ParamReader } from '../module'
import { LinkwitzRiley4 } from '../biquad'

export class StereoImagingModule implements BusModule {
  readonly id = 'width' as const
  readonly latencySamples = 0
  readonly grDb = 0
  private readonly sampleRate: number
  private readonly sideHighpass = new LinkwitzRiley4()
  private readonly side: Float32Array
  private widthCurrent = 1.05
  private widthTarget = 1.05
  private monoBelow = 0

  constructor(sampleRate: number, maxBlock: number) {
    this.sampleRate = sampleRate
    this.side = new Float32Array(maxBlock)
  }

  updateParams(read: ParamReader): void {
    this.widthTarget = read('width.width') / 100
    const mono = read('width.mono')
    if (mono !== this.monoBelow) {
      this.monoBelow = mono
      this.sideHighpass.configure('highpass', this.sampleRate, mono)
    }
  }

  process(l: Float32Array, r: Float32Array, n: number): void {
    const side = this.side
    for (let i = 0; i < n; i++) {
      side[i] = (l[i] - r[i]) * 0.5
    }
    this.sideHighpass.processMono(side, n)
    const from = this.widthCurrent
    const to = this.widthTarget
    const step = (to - from) / n
    let width = from
    for (let i = 0; i < n; i++) {
      width += step
      const mid = (l[i] + r[i]) * 0.5
      const s = side[i] * width
      l[i] = mid + s
      r[i] = mid - s
    }
    this.widthCurrent = to
  }

  reset(): void {
    this.sideHighpass.reset()
    this.widthCurrent = this.widthTarget
  }
}
