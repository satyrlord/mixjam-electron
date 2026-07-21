// MasterBusCore: the complete strip DSP driven by plain Float32Array
// blocks. The AudioWorklet adapter and the node test suite both drive this
// class; it performs no allocation, locking, or I/O on the processing path.

import type { MasterBusParamId, ProcessorId } from '../params'
import { MASTER_BUS_PARAMS, clampParamValue, defaultParamValues } from '../params'
import type { MasterBusState } from '../presets'
import { ChainInstance } from './chain'
import { InputVuMeter } from './meters'
import type { ParamReader } from './module'
import { GainStageModule } from './modules/gain'
import { OnePoleSmoother } from './util'

const PARAM_SMOOTHING_MS = 20
const CROSSFADE_SECONDS = 0.03

export interface MasterBusMeterSnapshot {
  vuDb: number
  peakL: boolean
  peakR: boolean
  compGrDb: number
  limGrDb: number
  latencySamples: number
  faultCount: number
}

export class MasterBusCore {
  readonly sampleRate: number
  private readonly maxBlock: number
  private readonly chains: [ChainInstance, ChainInstance]
  private activeChain = 0
  private fadeRemaining = 0
  private fadeTotal: number
  private pendingTopology: { order: ProcessorId[]; power: Record<ProcessorId, boolean> } | null = null
  private readonly smoothers = new Map<MasterBusParamId, OnePoleSmoother>()
  /** Same smoothers as a plain array for the allocation-free block loop. */
  private readonly smootherList: OnePoleSmoother[]
  private readonly readSmoothed: ParamReader
  private readonly gainStage: GainStageModule
  private readonly inputMeter: InputVuMeter
  private readonly fadeL: Float32Array
  private readonly fadeR: Float32Array
  private order: ProcessorId[]
  private power: Record<ProcessorId, boolean>

  constructor(sampleRate: number, maxBlock: number, initial: MasterBusState) {
    this.sampleRate = sampleRate
    this.maxBlock = maxBlock
    this.fadeTotal = Math.max(1, Math.round(CROSSFADE_SECONDS * sampleRate))
    this.order = [...initial.order]
    this.power = { ...initial.power }
    this.chains = [
      new ChainInstance(sampleRate, maxBlock, this.order),
      new ChainInstance(sampleRate, maxBlock, this.order),
    ]
    this.chains[0].setTopology(this.order, this.power)
    this.chains[1].setTopology(this.order, this.power)
    const defaults = defaultParamValues()
    for (const def of MASTER_BUS_PARAMS) {
      const value = clampParamValue(def.id, initial.params[def.id] ?? defaults[def.id])
      this.smoothers.set(def.id, new OnePoleSmoother(value, PARAM_SMOOTHING_MS, sampleRate))
    }
    this.smootherList = [...this.smoothers.values()]
    this.readSmoothed = (id) => {
      const smoother = this.smoothers.get(id)
      return smoother ? smoother.value : 0
    }
    this.gainStage = new GainStageModule()
    this.gainStage.updateParams(this.readSmoothed)
    this.gainStage.reset()
    this.inputMeter = new InputVuMeter(sampleRate)
    this.fadeL = new Float32Array(maxBlock)
    this.fadeR = new Float32Array(maxBlock)
  }

  /** Sets one parameter target; the 20 ms smoother removes zipper noise. */
  setParam(id: MasterBusParamId, value: number): void {
    this.smoothers.get(id)?.setTarget(clampParamValue(id, value))
  }

  /**
   * Applies a new slot order and power map. The change crossfades between
   * the outgoing and incoming chain over 30 ms; changes arriving while a
   * fade runs are queued and coalesce to the newest topology.
   */
  setTopology(order: readonly ProcessorId[], power: Readonly<Record<ProcessorId, boolean>>): void {
    const active = this.chains[this.activeChain]
    if (this.fadeRemaining === 0 && active.topologyEquals(order, power)) {
      this.pendingTopology = null
      return
    }
    this.order = [...order]
    this.power = { ...power }
    if (this.fadeRemaining > 0) {
      this.pendingTopology = { order: this.order, power: this.power }
      return
    }
    this.beginFade(this.order, this.power)
  }

  /** Applies a complete state without fading (project load / reset). */
  snapState(state: MasterBusState): void {
    this.order = [...state.order]
    this.power = { ...state.power }
    this.pendingTopology = null
    this.fadeRemaining = 0
    for (const def of MASTER_BUS_PARAMS) {
      this.smoothers.get(def.id)?.snapTo(clampParamValue(def.id, state.params[def.id]))
    }
    for (const chain of this.chains) {
      chain.setTopology(this.order, this.power)
      chain.reset()
    }
    this.gainStage.updateParams(this.readSmoothed)
    this.gainStage.reset()
    this.inputMeter.reset()
  }

  private beginFade(order: readonly ProcessorId[], power: Readonly<Record<ProcessorId, boolean>>): void {
    const incoming = this.chains[1 - this.activeChain]
    incoming.setTopology(order, power)
    incoming.reset()
    this.fadeRemaining = this.fadeTotal
  }

  get latencySamples(): number {
    return this.chains[this.activeChain].latencySamples
  }

  process(l: Float32Array, r: Float32Array, n: number): void {
    const smoothers = this.smootherList
    for (let i = 0; i < smoothers.length; i++) smoothers[i].advance(n)

    // Gain is a single always-on pre-chain stage. Apply it exactly once before
    // metering and before copying the signal into either crossfade branch.
    this.gainStage.updateParams(this.readSmoothed)
    this.gainStage.process(l, r, n)
    this.inputMeter.process(l, r, n)

    const active = this.chains[this.activeChain]
    active.updateParams(this.readSmoothed)

    if (this.fadeRemaining === 0) {
      active.process(l, r, n)
      return
    }

    const incoming = this.chains[1 - this.activeChain]
    const { fadeL, fadeR } = this
    for (let i = 0; i < n; i++) {
      fadeL[i] = l[i]
      fadeR[i] = r[i]
    }
    incoming.updateParams(this.readSmoothed)

    active.process(l, r, n)
    incoming.process(fadeL, fadeR, n)

    const total = this.fadeTotal
    let remaining = this.fadeRemaining
    for (let i = 0; i < n; i++) {
      const progress = remaining > 0 ? 1 - remaining / total : 1
      const wOut = Math.cos((progress * Math.PI) / 2)
      const wIn = Math.sin((progress * Math.PI) / 2)
      l[i] = l[i] * wOut + fadeL[i] * wIn
      r[i] = r[i] * wOut + fadeR[i] * wIn
      if (remaining > 0) remaining--
    }
    this.fadeRemaining = remaining
    if (remaining === 0) {
      this.activeChain = 1 - this.activeChain
      if (this.pendingTopology) {
        const pending = this.pendingTopology
        this.pendingTopology = null
        this.beginFade(pending.order, pending.power)
      }
    }
  }

  meterSnapshot(): MasterBusMeterSnapshot {
    const active = this.chains[this.activeChain]
    return {
      vuDb: this.inputMeter.vuDb,
      peakL: this.inputMeter.peakL,
      peakR: this.inputMeter.peakR,
      compGrDb: active.isPowered('comp') ? active.modules.comp.grDb : 0,
      limGrDb: active.isPowered('lim') ? active.modules.lim.grDb : 0,
      latencySamples: active.latencySamples,
      faultCount: active.faults.size,
    }
  }

  reset(): void {
    for (const chain of this.chains) chain.reset()
    this.gainStage.reset()
    this.inputMeter.reset()
    this.fadeRemaining = 0
    this.pendingTopology = null
  }
}
