import { describe, expect, it } from 'vitest'
// Importing return-effects populates the registry with the built-in effects as
// a side effect, mirroring how the host loads it.
import './return-effects'
import {
  getReturnEffect,
  registerReturnEffect,
  returnEffectDescriptors,
  type ReturnEffectDescriptor
} from './return-effect-registry'

// A throwaway descriptor whose type never collides with a real effect, so
// registering it cannot corrupt the built-in registration used elsewhere.
function fakeDescriptor(overrides: Partial<ReturnEffectDescriptor> = {}): ReturnEffectDescriptor {
  return {
    type: '__test-effect__' as ReturnEffectDescriptor['type'],
    label: 'Test Effect',
    tempoAware: false,
    supportsClearTail: false,
    createProcessor: () => { throw new Error('not used') },
    prepareWorklet: () => Promise.resolve(false),
    createDefault: (id) => ({ id, type: '__test-effect__' } as never),
    validate: () => false,
    moduleKeys: ['type'],
    ...overrides
  }
}

describe('return effect registry', () => {
  it('exposes the built-in effects in registration (menu) order', () => {
    const types = returnEffectDescriptors().map((d) => d.type)
    expect(types).toContain('echoform-delay')
    expect(types).toContain('aetherform-reverb')
    // Delay registers before reverb, so it precedes it in menu order.
    expect(types.indexOf('echoform-delay')).toBeLessThan(types.indexOf('aetherform-reverb'))
  })

  it('carries the effect capability flags on the descriptor', () => {
    expect(getReturnEffect('echoform-delay')).toMatchObject({ tempoAware: true, supportsClearTail: false })
    expect(getReturnEffect('aetherform-reverb')).toMatchObject({ tempoAware: false, supportsClearTail: true })
  })

  it('returns undefined for Empty and unknown types', () => {
    expect(getReturnEffect('empty')).toBeUndefined()
    expect(getReturnEffect('no-such-effect')).toBeUndefined()
  })

  it('appends a new type once, then re-registration replaces it in place', () => {
    const before = returnEffectDescriptors().length
    registerReturnEffect(fakeDescriptor({ label: 'First' }))
    const afterFirst = returnEffectDescriptors()
    expect(afterFirst.length).toBe(before + 1)
    expect(getReturnEffect('__test-effect__')?.label).toBe('First')
    const position = afterFirst.findIndex((d) => d.type === '__test-effect__')

    // Re-registering the same type replaces the descriptor without growing the
    // list or changing its menu position.
    registerReturnEffect(fakeDescriptor({ label: 'Replaced' }))
    const afterReplace = returnEffectDescriptors()
    expect(afterReplace.length).toBe(before + 1)
    expect(getReturnEffect('__test-effect__')?.label).toBe('Replaced')
    expect(afterReplace.findIndex((d) => d.type === '__test-effect__')).toBe(position)
  })
})
