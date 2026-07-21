// @vitest-environment node
// Parameter registry and factory presets (spec-012 Chain Contract and
// Factory Presets tables).

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PROCESSOR_ORDER,
  MASTER_BUS_PARAMS,
  PROCESSOR_IDS,
  clampParamValue,
  defaultParamValues,
  isProcessorId,
  isValidProcessorOrder,
} from './params'
import { MASTER_BUS_PRESET_NAMES, applyPreset, defaultMasterBusState, isPresetName } from './presets'

describe('parameter registry', () => {
  it('covers all eleven processors with spec ranges and defaults', () => {
    expect(PROCESSOR_IDS).toHaveLength(11)
    expect(DEFAULT_PROCESSOR_ORDER).toHaveLength(11)
    for (const def of MASTER_BUS_PARAMS) {
      expect(def.min).toBeLessThan(def.max)
      expect(def.def).toBeGreaterThanOrEqual(def.min)
      expect(def.def).toBeLessThanOrEqual(def.max)
      expect(isProcessorId(def.processor)).toBe(true)
    }
    const defaults = defaultParamValues()
    expect(defaults['comp.thr']).toBe(-16)
    expect(defaults['lim.ceil']).toBe(-1)
    expect(defaults['width.width']).toBe(105)
  })

  it('clamps out-of-range and non-finite values', () => {
    expect(clampParamValue('gain.trim', 99)).toBe(24)
    expect(clampParamValue('gain.trim', -99)).toBe(-24)
    expect(clampParamValue('gain.trim', Number.NaN)).toBe(0)
    expect(clampParamValue('tape.ips', 0.7)).toBe(1)
  })

  it('validates processor orders as permutations', () => {
    expect(isValidProcessorOrder([...DEFAULT_PROCESSOR_ORDER])).toBe(true)
    expect(isValidProcessorOrder([...DEFAULT_PROCESSOR_ORDER].reverse())).toBe(true)
    expect(isValidProcessorOrder(DEFAULT_PROCESSOR_ORDER.slice(1))).toBe(false)
    expect(isValidProcessorOrder([...DEFAULT_PROCESSOR_ORDER.slice(1), 'gain', 'gain'])).toBe(false)
    expect(isValidProcessorOrder([...DEFAULT_PROCESSOR_ORDER.slice(1), 'bogus'])).toBe(false)
  })
})

describe('factory presets', () => {
  it('exposes exactly the four spec presets', () => {
    expect([...MASTER_BUS_PRESET_NAMES]).toEqual(['Cheat Sheet', 'Gentle', 'Loud', 'Bypass All'])
    expect(isPresetName('Loud')).toBe(true)
    expect(isPresetName('loud')).toBe(false)
  })

  it('Cheat Sheet restores default order, defaults, and all-on power', () => {
    const scrambled = [...DEFAULT_PROCESSOR_ORDER].reverse()
    const state = applyPreset('Cheat Sheet', scrambled)
    expect(state.order).toEqual([...DEFAULT_PROCESSOR_ORDER])
    expect(state.params).toEqual(defaultParamValues())
    for (const id of PROCESSOR_IDS) expect(state.power[id]).toBe(true)
    expect(state.preset).toBe('Cheat Sheet')
  })

  it('Gentle keeps order, powers off Maximizer and Multiband, applies overrides', () => {
    const scrambled = [...DEFAULT_PROCESSOR_ORDER].reverse()
    const state = applyPreset('Gentle', scrambled)
    expect(state.order).toEqual(scrambled)
    expect(state.power.max).toBe(false)
    expect(state.power.mbc).toBe(false)
    expect(state.power.comp).toBe(true)
    expect(state.params['clip.amount']).toBe(0.8)
    expect(state.params['tube.drive']).toBe(1.5)
    expect(state.params['comp.thr']).toBe(-12)
    expect(state.params['lim.gain']).toBe(2.5)
    expect(state.params['width.width']).toBe(100)
  })

  it('Loud applies its overrides with everything on', () => {
    const state = applyPreset('Loud', DEFAULT_PROCESSOR_ORDER)
    for (const id of PROCESSOR_IDS) expect(state.power[id]).toBe(true)
    expect(state.params['clip.amount']).toBe(2.5)
    expect(state.params['max.boost']).toBe(16)
    expect(state.params['comp.thr']).toBe(-20)
    expect(state.params['comp.ratio']).toBe(3)
    expect(state.params['mbc.lo']).toBe(35)
    expect(state.params['mbc.mid']).toBe(25)
    expect(state.params['mbc.hi']).toBe(35)
    expect(state.params['addeq.air']).toBe(1.6)
    expect(state.params['lim.gain']).toBe(7)
  })

  it('Bypass All powers off every processor at default values', () => {
    const state = applyPreset('Bypass All', DEFAULT_PROCESSOR_ORDER)
    for (const id of PROCESSOR_IDS) expect(state.power[id]).toBe(false)
    expect(state.params).toEqual(defaultParamValues())
  })

  it('default strip state is the Cheat Sheet preset', () => {
    const state = defaultMasterBusState()
    expect(state.preset).toBe('Cheat Sheet')
    expect(state.order).toEqual([...DEFAULT_PROCESSOR_ORDER])
  })
})
