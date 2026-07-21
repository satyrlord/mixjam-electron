// @vitest-environment node
// Chain calibration (spec-012 §Calibration): the Cheat Sheet preset takes
// a -18 dBFS RMS pop/electronic reference program to -14 +/-1 LUFS
// integrated with true peak at or below -1 dBTP. The reference program is
// the repository's deterministic seeded pseudo-music generator (a licensed
// commercial mix cannot be committed).

import { describe, expect, it } from 'vitest'
import { defaultMasterBusState } from '../presets'
import { MasterBusCore } from './core'
import { measureLoudness } from './loudness-harness'
import { rmsDb, seededNoise } from './test-support'

const FS = 48000
const BLOCK = 128

/**
 * Deterministic pop/electronic reference program: four-on-the-floor kick,
 * offbeat hats, a bass line, and a sustained pad, normalized to -18 dBFS
 * RMS with a realistic crest factor (peaks near -7 dBFS).
 */
export function referenceProgram(seconds: number): { l: Float32Array; r: Float32Array } {
  const n = Math.round(seconds * FS)
  const l = new Float32Array(n)
  const r = new Float32Array(n)
  const noiseL = seededNoise(n, 1, 0x1234567)
  const noiseR = seededNoise(n, 1, 0x89abcd1)
  const beat = 0.5 // 120 BPM quarter note in seconds
  for (let i = 0; i < n; i++) {
    const t = i / FS
    const beatPhase = (t % beat) / beat
    // Kick: pitch-dropping sine burst with a fast decay on every beat.
    const kickEnv = Math.exp(-beatPhase * 18)
    const kickFreq = 48 + 60 * Math.exp(-beatPhase * 40)
    const kick = 0.9 * kickEnv * Math.sin(2 * Math.PI * kickFreq * (t % beat))
    // Offbeat hat: short noise burst, high-frequency emphasis via first
    // difference of the noise source.
    const hatPhase = ((t + beat / 2) % beat) / beat
    const hatEnv = Math.exp(-hatPhase * 60)
    const hatL = 0.22 * hatEnv * (noiseL[i] - (i > 0 ? noiseL[i - 1] : 0))
    const hatR = 0.22 * hatEnv * (noiseR[i] - (i > 0 ? noiseR[i - 1] : 0))
    // Bass: root-fifth alternation each bar with mild harmonics.
    const bar = Math.floor(t / (4 * beat))
    const bassFreq = bar % 2 === 0 ? 55 : 82.4
    const bass = 0.32 * (Math.sin(2 * Math.PI * bassFreq * t) + 0.3 * Math.sin(2 * Math.PI * 2 * bassFreq * t))
    // Pad: sustained triad, slightly detuned between channels for width.
    const padL = 0.1 * (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 277.2 * t) + Math.sin(2 * Math.PI * 329.6 * t))
    const padR = 0.1 * (Math.sin(2 * Math.PI * 220.6 * t) + Math.sin(2 * Math.PI * 276.6 * t) + Math.sin(2 * Math.PI * 330.4 * t))
    l[i] = kick + bass + hatL + padL
    r[i] = kick + bass + hatR + padR
  }
  // Normalize to exactly -18 dBFS RMS across both channels.
  let sum = 0
  for (let i = 0; i < n; i++) sum += l[i] * l[i] + r[i] * r[i]
  const rms = Math.sqrt(sum / (2 * n))
  const scale = Math.pow(10, -18 / 20) / rms
  for (let i = 0; i < n; i++) {
    l[i] *= scale
    r[i] *= scale
  }
  return { l, r }
}

describe('Cheat Sheet calibration on the reference program', () => {
  it('lands at -14 +/-1 LUFS integrated with true peak at or below -1 dBTP', async () => {
    const { l, r } = referenceProgram(20)
    expect(Math.abs(rmsDb(l) - -18)).toBeLessThan(0.6)

    const core = new MasterBusCore(FS, BLOCK, defaultMasterBusState())
    for (let start = 0; start + BLOCK <= l.length; start += BLOCK) {
      core.process(l.subarray(start, start + BLOCK), r.subarray(start, start + BLOCK), BLOCK)
    }
    // Skip the first second (meter and chain settle).
    const settle = FS
    const outL = l.subarray(settle, Math.floor(l.length / BLOCK) * BLOCK)
    const outR = r.subarray(settle, Math.floor(r.length / BLOCK) * BLOCK)
    const result = await measureLoudness(outL, outR, FS)
    expect(result.integratedLufs, 'integrated LUFS').toBeGreaterThan(-15)
    expect(result.integratedLufs, 'integrated LUFS').toBeLessThan(-13)
    expect(result.maxTruePeakDbtp, 'true peak dBTP').toBeLessThanOrEqual(-1)
  }, 120000)
})
