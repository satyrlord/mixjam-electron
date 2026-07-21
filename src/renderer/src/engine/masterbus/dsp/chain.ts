// One complete chain instance: the eleven processors in a mutable order
// with per-processor power flags. The MasterBusCore owns two instances and
// crossfades between them on topology changes (audio-engine.md).

import type { ProcessorId } from '../params'
import type { BusModule, ParamReader } from './module'
import { GainStageModule } from './modules/gain'
import { MaximizerModule, SoftClipModule, TapeSaturationModule, TubeSaturationModule } from './modules/saturators'
import { AdditiveEqModule, SubtractiveEqModule } from './modules/eq'
import { BusCompressorModule, LimiterModule, MultibandCompModule } from './modules/dynamics'
import { StereoImagingModule } from './modules/imaging'
import { sanitizeBlock } from './util'

export function createModules(sampleRate: number, maxBlock: number): Record<ProcessorId, BusModule> {
  return {
    gain: new GainStageModule(),
    clip: new SoftClipModule(sampleRate, maxBlock),
    tube: new TubeSaturationModule(sampleRate, maxBlock),
    subeq: new SubtractiveEqModule(sampleRate),
    comp: new BusCompressorModule(sampleRate),
    max: new MaximizerModule(sampleRate, maxBlock),
    addeq: new AdditiveEqModule(sampleRate),
    tape: new TapeSaturationModule(sampleRate, maxBlock),
    width: new StereoImagingModule(sampleRate, maxBlock),
    mbc: new MultibandCompModule(sampleRate, maxBlock),
    lim: new LimiterModule(sampleRate, maxBlock),
  }
}

export class ChainInstance {
  readonly modules: Record<ProcessorId, BusModule>
  private order: ProcessorId[]
  private readonly power: Record<ProcessorId, boolean>
  /** Processors that produced non-finite output and were sanitized. */
  readonly faults = new Set<ProcessorId>()

  constructor(sampleRate: number, maxBlock: number, order: readonly ProcessorId[]) {
    this.modules = createModules(sampleRate, maxBlock)
    this.order = [...order]
    this.power = {
      gain: true,
      clip: true,
      tube: true,
      subeq: true,
      comp: true,
      max: true,
      addeq: true,
      tape: true,
      width: true,
      mbc: true,
      lim: true,
    }
  }

  setTopology(order: readonly ProcessorId[], power: Readonly<Record<ProcessorId, boolean>>): void {
    this.order = [...order]
    for (const id of this.order) this.power[id] = power[id]
  }

  topologyEquals(order: readonly ProcessorId[], power: Readonly<Record<ProcessorId, boolean>>): boolean {
    if (order.length !== this.order.length) return false
    for (let i = 0; i < order.length; i++) {
      if (order[i] !== this.order[i]) return false
    }
    for (const id of this.order) {
      if (this.power[id] !== power[id]) return false
    }
    return true
  }

  isPowered(id: ProcessorId): boolean {
    return this.power[id]
  }

  get latencySamples(): number {
    let total = 0
    const order = this.order
    for (let i = 0; i < order.length; i++) {
      if (this.power[order[i]]) total += this.modules[order[i]].latencySamples
    }
    return total
  }

  updateParams(read: ParamReader): void {
    const order = this.order
    for (let i = 0; i < order.length; i++) {
      if (this.power[order[i]]) this.modules[order[i]].updateParams(read)
    }
  }

  process(l: Float32Array, r: Float32Array, n: number): void {
    const order = this.order
    for (let i = 0; i < order.length; i++) {
      const id = order[i]
      if (!this.power[id]) continue
      this.modules[id].process(l, r, n)
      if (!sanitizeBlock(l, r, n)) this.faults.add(id)
    }
  }

  reset(): void {
    const order = this.order
    for (let i = 0; i < order.length; i++) this.modules[order[i]].reset()
    this.faults.clear()
  }
}
