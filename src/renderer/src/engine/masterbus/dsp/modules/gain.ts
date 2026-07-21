// Pinned Gain Stage (slot 01): clean smoothed trim before the Input Meter.

import type { BusModule, ParamReader } from '../module'
import { dbToLinear } from '../util'

export class GainStageModule implements BusModule {
  readonly id = 'gain' as const
  readonly latencySamples = 0
  readonly grDb = 0
  private current = 1
  private target = 1

  updateParams(read: ParamReader): void {
    this.target = dbToLinear(read('gain.trim'))
  }

  process(l: Float32Array, r: Float32Array, n: number): void {
    const from = this.current
    const to = this.target
    if (from === to) {
      if (to === 1) return
      for (let i = 0; i < n; i++) {
        l[i] *= to
        r[i] *= to
      }
      return
    }
    // Per-sample linear ramp across the block: continuous gain, no zipper.
    const step = (to - from) / n
    let g = from
    for (let i = 0; i < n; i++) {
      g += step
      l[i] *= g
      r[i] *= g
    }
    this.current = to
  }

  reset(): void {
    this.current = this.target
  }
}
