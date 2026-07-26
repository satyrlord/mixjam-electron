import { describe, expect, it } from 'vitest'
import {
  AETHERFORM_REVERB_RANGES,
  ECHOFORM_DELAY_RANGES,
  numericFieldsWithinRanges,
  withinRange
} from './return-param-ranges'
import { isReturnModule } from './return-effects'
import { returnEffectDescriptors } from './return-effect-registry'
import './return-effects'

const TABLES = {
  'echoform-delay': ECHOFORM_DELAY_RANGES,
  'aetherform-reverb': AETHERFORM_REVERB_RANGES
} as Record<string, Record<string, { min: number; max: number }>>

describe('range tables', () => {
  it('declares a sane interval for every parameter', () => {
    for (const [effect, table] of Object.entries(TABLES)) {
      for (const [field, { min, max }] of Object.entries(table)) {
        expect(Number.isFinite(min), `${effect}.${field} min`).toBe(true)
        expect(Number.isFinite(max), `${effect}.${field} max`).toBe(true)
        expect(min, `${effect}.${field}`).toBeLessThan(max)
      }
    }
  })

  // Numeric fields whose valid values are an enumerated set, not an interval,
  // so they are guarded by their own predicate rather than by a range.
  const ENUMERATED_NUMERIC_FIELDS = new Set(['shimmerIntervalSemitones'])

  it('covers exactly the continuous numeric fields of each effect', () => {
    // A parameter added to an effect but not to its table would silently lose
    // its load-time bound; a stale table entry would validate a field that no
    // longer exists. Either way this fails rather than drifting.
    for (const descriptor of returnEffectDescriptors()) {
      const table = TABLES[descriptor.type]
      if (!table) continue
      const defaults = descriptor.createDefault('slot-1') as unknown as Record<string, unknown>
      const numericFields = Object.entries(defaults)
        .filter(([field, value]) =>
          typeof value === 'number' && !ENUMERATED_NUMERIC_FIELDS.has(field))
        .map(([field]) => field)
        .sort()
      expect(Object.keys(table).sort(), descriptor.type).toEqual(numericFields)
    }
  })
})

describe('defaults and presets satisfy their own ranges', () => {
  it('every registered effect default is in range and loads', () => {
    for (const descriptor of returnEffectDescriptors()) {
      const module = descriptor.createDefault('slot-1')
      expect(isReturnModule(module), `${descriptor.type} default`).toBe(true)

      const table = TABLES[descriptor.type]
      if (!table) continue
      expect(
        numericFieldsWithinRanges(module as unknown as Record<string, unknown>, table),
        `${descriptor.type} default is inside its declared ranges`
      ).toBe(true)
    }
  })
})

describe('the validator enforces the declared bounds', () => {
  it.each([
    ['echoform-delay', 'feedback', ECHOFORM_DELAY_RANGES.feedback],
    ['echoform-delay', 'outputDb', ECHOFORM_DELAY_RANGES.outputDb],
    ['aetherform-reverb', 'decaySeconds', AETHERFORM_REVERB_RANGES.decaySeconds],
    ['aetherform-reverb', 'sizePercent', AETHERFORM_REVERB_RANGES.sizePercent]
  ])('%s.%s accepts its bounds and rejects just outside them', (type, field, bounds) => {
    const descriptor = returnEffectDescriptors().find((entry) => entry.type === type)!
    const at = (value: number): Record<string, unknown> => ({
      ...(descriptor.createDefault('slot-1') as unknown as Record<string, unknown>),
      [field]: value
    })

    expect(isReturnModule(at(bounds.min))).toBe(true)
    expect(isReturnModule(at(bounds.max))).toBe(true)
    expect(isReturnModule(at(bounds.min - 0.001))).toBe(false)
    expect(isReturnModule(at(bounds.max + 0.001))).toBe(false)
    expect(isReturnModule(at(Number.NaN))).toBe(false)
  })
})

describe('withinRange', () => {
  it('rejects non-numbers and non-finite values', () => {
    const bounds = { min: 0, max: 10 }
    expect(withinRange(5, bounds)).toBe(true)
    expect(withinRange(0, bounds)).toBe(true)
    expect(withinRange(10, bounds)).toBe(true)
    expect(withinRange(-1, bounds)).toBe(false)
    expect(withinRange(Number.NaN, bounds)).toBe(false)
    expect(withinRange(Number.POSITIVE_INFINITY, bounds)).toBe(false)
    expect(withinRange('5', bounds)).toBe(false)
    expect(withinRange(null, bounds)).toBe(false)
    expect(withinRange(undefined, bounds)).toBe(false)
  })
})
