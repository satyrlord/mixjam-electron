// Common contract for the pinned Gain Stage and ten downstream processors.
// Modules are stereo-in/stereo-out blocks over Float32Array with no Web
// Audio types, so the identical code runs in the AudioWorklet and in the
// node test suite.

import type { MasterBusModuleId, MasterBusParamId } from '../params'

export type ParamReader = (id: MasterBusParamId) => number

export interface BusModule {
  readonly id: MasterBusModuleId
  /**
   * Constant group delay this module imposes on the audio path, in samples
   * at the base rate. Neutral and engaged paths share the same delay so
   * parameter moves never shift time.
   */
  readonly latencySamples: number
  /**
   * Pulls current (already smoothed) parameter values before a block.
   * Called once per block; implementations must not allocate.
   */
  updateParams(read: ParamReader): void
  /** Processes n frames in place. Must not allocate. */
  process(l: Float32Array, r: Float32Array, n: number): void
  /** Clears all internal state (delay lines, filters, envelopes). */
  reset(): void
  /** Current gain reduction in dB for metering; 0 for non-dynamics. */
  readonly grDb: number
}
