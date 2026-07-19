import { describe, expect, it } from 'vitest'
import { createChannel } from '../engine/channel'
import { createDefaultEffect, effectGlyph, effectName, isEffectSlot, type CompressorEffect, type DelayEffect, type ReverbEffect } from '../engine/effects'
import { createMockContext } from '../test/mockAudioContext'
import { RETURN_BUS_COUNT } from '../engine/return-effects'

describe('spec-010 per-channel audio effects', () => {
  it('keeps one stable send output per fixed Return bus', () => {
    const context = createMockContext()
    const channel = createChannel(context as unknown as BaseAudioContext, 0)

    expect(channel.sendOutputs).toHaveLength(RETURN_BUS_COUNT)
    expect(channel.sendOutputs.every((send) => send.gain.value === 1)).toBe(true)
    channel.setSend(3, 0.4)
    channel.setSend(RETURN_BUS_COUNT, 0.8)
    expect(channel.sendOutputs[3]!.gain.value).toBe(0.4)
  })

  it('validates persisted effect contracts and exposes canonical display metadata', () => {
    expect(['delay', 'reverb', 'compressor'].map((type) => isEffectSlot(createDefaultEffect(type as 'delay' | 'reverb' | 'compressor')))).toEqual([true, true, true])
    expect([null, 1, {}, { id: 'x', bypassed: false, type: 'unknown' }].map(isEffectSlot)).toEqual([false, false, false, false])
    expect(isEffectSlot({ ...createDefaultEffect('delay'), timeMs: Number.NaN })).toBe(false)
    expect(isEffectSlot({ ...createDefaultEffect('delay'), noteDivision: '1/32' })).toBe(false)
    expect(isEffectSlot({ ...createDefaultEffect('reverb'), decay: 'long' })).toBe(false)
    expect(isEffectSlot({ ...createDefaultEffect('compressor'), ratio: undefined })).toBe(false)
    expect(effectName('delay')).toBe('Delay')
    expect(effectGlyph('compressor')).toBe('C')
  })

  it('builds a delay with bounded time, feedback, and dry/wet routing (AC-001)', () => {
    const context = createMockContext()
    const channel = createChannel(context as unknown as BaseAudioContext, 0)
    const delay = { ...createDefaultEffect('delay'), timeMs: 750, feedback: 0.6, mix: 0.4 } as DelayEffect
    const gainCountBeforeEffect = context.created.gains.length

    channel.setEffects([delay], 120)
    const processorGains = context.created.gains.slice(gainCountBeforeEffect)

    expect(context.created.delays).toHaveLength(1)
    expect(context.created.delays[0]!.delayTime.value).toBe(0.75)
    expect(processorGains[2]!.gain.value).toBeCloseTo(0.594)
    expect(processorGains[3]!.gain.value).toBe(0.6)
    expect(processorGains[4]!.gain.value).toBe(0.4)
    expect(channel.effects).toEqual([delay])
  })

  it('updates delay parameters in place without interrupting the channel graph (AC-001)', () => {
    const context = createMockContext()
    const channel = createChannel(context as unknown as BaseAudioContext, 0)
    const delay = createDefaultEffect('delay') as DelayEffect
    const gainCountBeforeEffect = context.created.gains.length
    channel.setEffects([delay], 120)
    const processorGains = context.created.gains.slice(gainCountBeforeEffect)
    const processorInput = processorGains[0]!
    const processorOutput = processorGains[1]!

    channel.setEffects([{ ...delay, timeMs: 900, feedback: 0.8, mix: 0.65 }], 120)

    expect(context.created.delays).toHaveLength(1)
    expect(context.created.delays[0]!.delayTime.value).toBe(0.9)
    expect(processorGains[2]!.gain.value).toBeCloseTo(0.792)
    expect(processorGains[3]!.gain.value).toBeCloseTo(0.35)
    expect(processorGains[4]!.gain.value).toBe(0.65)
    expect(processorInput.disconnected).toBe(false)
    expect(processorOutput.disconnected).toBe(false)
  })

  it('maps a tempo-synced ping-pong delay to alternating stereo taps', () => {
    const context = createMockContext()
    const channel = createChannel(context as unknown as BaseAudioContext, 0)
    const delay = { ...createDefaultEffect('delay'), tempoSync: true, noteDivision: '1/8', pingPong: true } as DelayEffect

    channel.setEffects([delay], 120)

    expect(context.created.delays).toHaveLength(2)
    expect(context.created.delays[0]!.delayTime.value).toBe(0.25)
    expect(context.created.panners.at(-2)!.pan.value).toBe(-1)
    expect(context.created.panners.at(-1)!.pan.value).toBe(1)

    channel.setEffects([{ ...delay, noteDivision: '1/4', feedback: 0.7, mix: 0.6 }], 120)
    expect(context.created.delays).toHaveLength(2)
    expect(context.created.delays[0]!.delayTime.value).toBe(0.5)
    expect(context.created.gains.at(-2)!.gain.value).toBeCloseTo(0.4)
    expect(context.created.gains.at(-1)!.gain.value).toBeCloseTo(0.6)
  })

  it('rebuilds the delay graph when ping-pong topology changes', () => {
    const context = createMockContext()
    const channel = createChannel(context as unknown as BaseAudioContext, 0)
    const delay = createDefaultEffect('delay') as DelayEffect
    channel.setEffects([delay], 120)
    const originalDelay = context.created.delays[0]!

    channel.setEffects([{ ...delay, pingPong: true }], 120)

    expect(originalDelay.disconnected).toBe(true)
    expect(context.created.delays).toHaveLength(3)
    expect(context.created.panners.at(-2)!.pan.value).toBe(-1)
    expect(context.created.panners.at(-1)!.pan.value).toBe(1)
  })

  it('updates tempo-synced delay time when the song BPM changes (AC-001)', () => {
    const context = createMockContext()
    const channel = createChannel(context as unknown as BaseAudioContext, 0)
    const delay = { ...createDefaultEffect('delay'), tempoSync: true, noteDivision: '1/4' } as DelayEffect
    channel.setEffects([delay], 120)

    channel.setBpm(60)

    expect(context.created.delays).toHaveLength(1)
    expect(context.created.delays[0]!.delayTime.value).toBe(1)
  })

  it('creates a stereo impulse whose duration follows reverb decay (AC-002)', () => {
    const context = createMockContext()
    const channel = createChannel(context as unknown as BaseAudioContext, 0)
    const reverb = { ...createDefaultEffect('reverb'), roomSize: 0.8, decay: 0.5, mix: 0.35 } as ReverbEffect

    channel.setEffects([reverb], 120)

    const impulse = context.created.convolvers[0]!.buffer!
    expect(context.created.convolvers[0]!.channelCount).toBe(1)
    expect(context.created.convolvers[0]!.channelCountMode).toBe('explicit')
    expect(impulse.numberOfChannels).toBe(2)
    expect(impulse.duration).toBeCloseTo(2.075, 2)
  })

  it('rebuilds the reverb impulse when its sound-shaping parameters change (AC-002)', () => {
    const context = createMockContext()
    const channel = createChannel(context as unknown as BaseAudioContext, 0)
    const reverb = createDefaultEffect('reverb') as ReverbEffect
    channel.setEffects([reverb], 120)
    const oldConvolver = context.created.convolvers[0]!

    channel.setEffects([{ ...reverb, roomSize: 0.9, decay: 0.8, mix: 0.6 }], 120)

    expect(context.created.convolvers).toHaveLength(2)
    expect(oldConvolver.disconnected).toBe(true)
    expect(context.created.convolvers[1]!.buffer!.duration).toBeCloseTo(3.23, 2)
    expect(context.created.gains.at(-2)!.gain.value).toBeCloseTo(0.4)
    expect(context.created.gains.at(-1)!.gain.value).toBe(0.6)
  })

  it('maps compressor controls to DynamicsCompressorNode and makeup gain (AC-003)', () => {
    const context = createMockContext()
    const channel = createChannel(context as unknown as BaseAudioContext, 0)
    const compressor = { ...createDefaultEffect('compressor'), threshold: -18, ratio: 6, attackMs: 25, releaseMs: 500, makeupGain: 6 } as CompressorEffect

    channel.setEffects([compressor], 120)

    const node = context.created.compressors[0]!
    expect(node.threshold.value).toBe(-18)
    expect(node.ratio.value).toBe(6)
    expect(node.attack.value).toBe(0.025)
    expect(node.release.value).toBe(0.5)
    expect(context.created.gains.at(-1)!.gain.value).toBeCloseTo(1.995, 2)
  })

  it('exposes positive compressor gain reduction and reports zero while bypassed', () => {
    const context = createMockContext()
    const channel = createChannel(context as unknown as BaseAudioContext, 0)
    const compressor = createDefaultEffect('compressor') as CompressorEffect
    channel.setEffects([compressor], 120)
    context.created.compressors[0]!.reduction = -7.5
    expect(channel.getEffectReduction(compressor.id)).toBe(7.5)

    channel.setEffects([{ ...compressor, bypassed: true }], 120)
    expect(channel.getEffectReduction(compressor.id)).toBe(0)
  })

  it('updates compressor parameters in place (AC-003)', () => {
    const context = createMockContext()
    const channel = createChannel(context as unknown as BaseAudioContext, 0)
    const compressor = createDefaultEffect('compressor') as CompressorEffect
    channel.setEffects([compressor], 120)

    channel.setEffects([{ ...compressor, threshold: -12, ratio: 10, attackMs: 40, releaseMs: 800, makeupGain: 12 }], 120)

    expect(context.created.compressors).toHaveLength(1)
    expect(context.created.compressors[0]!.threshold.value).toBe(-12)
    expect(context.created.compressors[0]!.ratio.value).toBe(10)
    expect(context.created.compressors[0]!.attack.value).toBe(0.04)
    expect(context.created.compressors[0]!.release.value).toBe(0.8)
    expect(context.created.gains.at(-1)!.gain.value).toBeCloseTo(3.981, 2)
  })

  it('clamps delay and compressor controls to their documented DSP ranges', () => {
    const delayContext = createMockContext()
    const delayChannel = createChannel(delayContext as unknown as BaseAudioContext, 0)
    const delay = { ...createDefaultEffect('delay'), timeMs: 5000, feedback: 2, mix: -1 } as DelayEffect
    const gainCountBeforeEffect = delayContext.created.gains.length
    delayChannel.setEffects([delay], 120)
    const processorGains = delayContext.created.gains.slice(gainCountBeforeEffect)

    expect(delayContext.created.delays[0]!.delayTime.value).toBe(2)
    expect(processorGains[2]!.gain.value).toBe(0.99)
    expect(processorGains[3]!.gain.value).toBe(1)
    expect(processorGains[4]!.gain.value).toBe(0)

    const compressorContext = createMockContext()
    const compressorChannel = createChannel(compressorContext as unknown as BaseAudioContext, 0)
    const compressor = { ...createDefaultEffect('compressor'), threshold: -100, ratio: 99, attackMs: 500, releaseMs: 0, makeupGain: 30 } as CompressorEffect
    compressorChannel.setEffects([compressor], 120)

    expect(compressorContext.created.compressors[0]!.threshold.value).toBe(-60)
    expect(compressorContext.created.compressors[0]!.ratio.value).toBe(20)
    expect(compressorContext.created.compressors[0]!.attack.value).toBe(0.2)
    expect(compressorContext.created.compressors[0]!.release.value).toBe(0.005)
    expect(compressorContext.created.gains.at(-1)!.gain.value).toBeCloseTo(15.849, 2)
  })

  it('bypass omits effect DSP while preserving the ordered slot (AC-004)', () => {
    const context = createMockContext()
    const channel = createChannel(context as unknown as BaseAudioContext, 0)
    const delay = { ...createDefaultEffect('delay'), bypassed: true } as DelayEffect

    channel.setEffects([delay], 120)

    expect(context.created.delays).toHaveLength(0)
    expect(channel.effects[0]!.bypassed).toBe(true)

    channel.setEffects([{ ...createDefaultEffect('reverb'), bypassed: true }], 120)
    channel.setEffects([{ ...createDefaultEffect('compressor'), bypassed: true }], 120)
    expect(context.created.convolvers).toHaveLength(0)
    expect(context.created.compressors).toHaveLength(0)

    channel.setEffects([{ ...delay, bypassed: false }], 120)

    expect(context.created.delays).toHaveLength(1)
    expect(channel.effects[0]!.bypassed).toBe(false)
  })

  it('preserves chain order and rebuilds it when slots move (AC-005)', () => {
    const context = createMockContext()
    const channel = createChannel(context as unknown as BaseAudioContext, 0)
    const delay = createDefaultEffect('delay')
    const reverb = createDefaultEffect('reverb')

    channel.setEffects([delay, reverb], 120)
    const gainCountBeforeReorder = context.created.gains.length
    channel.setEffects([reverb, delay], 120)

    expect(channel.effects.map((effect) => effect.type)).toEqual(['reverb', 'delay'])
    expect(context.created.delays).toHaveLength(2)
    expect(context.created.convolvers).toHaveLength(2)
    const rebuiltGains = context.created.gains.slice(gainCountBeforeReorder)
    const reverbInput = rebuiltGains[0]!
    const reverbOutput = rebuiltGains[1]!
    const delayInput = rebuiltGains[4]!
    const delayOutput = rebuiltGains[5]!
    expect(context.created.panners[0]!.connectedTo).toEqual([reverbInput])
    expect(reverbOutput.connectedTo).toEqual([delayInput])
    expect(delayOutput.connectedTo).toEqual([channel.output])
  })

  it('disconnects old nodes when an effect is removed (AC-006)', () => {
    const context = createMockContext()
    const channel = createChannel(context as unknown as BaseAudioContext, 0)
    const gainCountBeforeEffects = context.created.gains.length
    channel.setEffects([createDefaultEffect('delay'), createDefaultEffect('reverb'), createDefaultEffect('compressor')], 120)
    const effectNodes = [...context.created.gains.slice(gainCountBeforeEffects), ...context.created.delays, ...context.created.convolvers, ...context.created.compressors]

    channel.setEffects([], 120)

    expect(effectNodes).not.toHaveLength(0)
    expect(effectNodes.every((node) => node.disconnected)).toBe(true)
    expect(channel.effects).toEqual([])
  })

  it('keeps channel graphs isolated (AC-007)', () => {
    const context = createMockContext()
    const channelA = createChannel(context as unknown as BaseAudioContext, 0)
    const channelB = createChannel(context as unknown as BaseAudioContext, 1)
    const channelBRoute = [...context.created.panners[1]!.connectedTo]
    channelA.setEffects([createDefaultEffect('reverb')], 120)

    expect(channelA.effects).toHaveLength(1)
    expect(channelB.effects).toHaveLength(0)
    expect(context.created.panners[1]!.connectedTo).toEqual(channelBRoute)
    expect(context.created.panners[1]!.disconnected).toBe(false)
  })
})
