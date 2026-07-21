// Trim EQ (HP + narrow cuts) and Lift EQ (wide shelves).
// RBJ biquads; at 0 dB gain the peaking/shelf forms collapse to exact
// identity coefficients, so the cut/boost sections null bit-exactly at
// neutral. The high-pass is always active by design; its null test runs
// against the documented high-pass reference (spec-012).

import type { BusModule, ParamReader } from '../module'
import { StereoBiquad } from '../biquad'

const CUT_Q = 3
const SHELF_SLOPE = 0.6
const MUD_HZ = 250
const HARSH_HZ = 3500
const LOW_SHELF_HZ = 90
const AIR_SHELF_HZ = 12000
const BUTTERWORTH_Q = Math.SQRT1_2

export class SubtractiveEqModule implements BusModule {
  readonly id = 'subeq' as const
  readonly latencySamples = 0
  readonly grDb = 0
  private readonly sampleRate: number
  private readonly highpass = new StereoBiquad()
  private readonly mud = new StereoBiquad()
  private readonly harsh = new StereoBiquad()
  private hpFreq = 0
  private mudDb = 99
  private harshDb = 99

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate
  }

  updateParams(read: ParamReader): void {
    const hp = read('subeq.hp')
    const mud = read('subeq.mud')
    const harsh = read('subeq.harsh')
    if (hp !== this.hpFreq) {
      this.hpFreq = hp
      // 12 dB/oct Butterworth (decision recorded in audio-engine.md).
      this.highpass.highpass(this.sampleRate, hp, BUTTERWORTH_Q)
    }
    if (mud !== this.mudDb) {
      this.mudDb = mud
      this.mud.peaking(this.sampleRate, MUD_HZ, CUT_Q, mud)
    }
    if (harsh !== this.harshDb) {
      this.harshDb = harsh
      this.harsh.peaking(this.sampleRate, HARSH_HZ, CUT_Q, harsh)
    }
  }

  process(l: Float32Array, r: Float32Array, n: number): void {
    this.highpass.process(l, r, n)
    if (this.mudDb !== 0) this.mud.process(l, r, n)
    if (this.harshDb !== 0) this.harsh.process(l, r, n)
  }

  reset(): void {
    this.highpass.reset()
    this.mud.reset()
    this.harsh.reset()
  }
}

export class AdditiveEqModule implements BusModule {
  readonly id = 'addeq' as const
  readonly latencySamples = 0
  readonly grDb = 0
  private readonly sampleRate: number
  private readonly low = new StereoBiquad()
  private readonly air = new StereoBiquad()
  private lowDb = 99
  private airDb = 99

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate
  }

  updateParams(read: ParamReader): void {
    const low = read('addeq.low')
    const air = read('addeq.air')
    if (low !== this.lowDb) {
      this.lowDb = low
      this.low.lowShelf(this.sampleRate, LOW_SHELF_HZ, SHELF_SLOPE, low)
    }
    if (air !== this.airDb) {
      this.airDb = air
      this.air.highShelf(this.sampleRate, Math.min(AIR_SHELF_HZ, this.sampleRate * 0.45), SHELF_SLOPE, air)
    }
  }

  process(l: Float32Array, r: Float32Array, n: number): void {
    if (this.lowDb !== 0) this.low.process(l, r, n)
    if (this.airDb !== 0) this.air.process(l, r, n)
  }

  reset(): void {
    this.low.reset()
    this.air.reset()
  }
}
