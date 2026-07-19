import { describe, expect, it } from 'vitest'
import { createMockContext } from '../test/mockAudioContext'
import {
  applyTapeDistortion,
  createDefaultDelayReturnModule,
  createEmptyReturnModule,
  createReturnModuleProcessor,
  createSafetyLimiter,
  isReturnModule
} from './return-effects'

describe('return FX module contracts', () => {
  it('creates the documented independent Empty and Delay defaults', () => {
    expect(createEmptyReturnModule('fx-1')).toEqual({ id: 'fx-1', type: 'empty' })
    expect(createDefaultDelayReturnModule('fx-2')).toMatchObject({
      id: 'fx-2', type: 'delay', mode: 'free', timeMs: 375,
      noteDivision: '1/8', feedback: 35, tapeDistortion: 0, pingPong: false
    })
  })

  it('accepts only the closed module union and exact tape identity at zero', () => {
    const delay = createDefaultDelayReturnModule('fx-1')
    expect(isReturnModule(createEmptyReturnModule('fx-0'))).toBe(true)
    expect(isReturnModule(delay)).toBe(true)
    expect(isReturnModule({ ...delay, feedback: 76 })).toBe(false)
    expect(applyTapeDistortion(-0.75, 0)).toBe(-0.75)
    expect(applyTapeDistortion(0.75, 0)).toBe(0.75)
    expect(applyTapeDistortion(-1.5, 0)).toBe(-1.5)
    expect(applyTapeDistortion(1.5, 0)).toBe(1.5)
    expect(Math.abs(applyTapeDistortion(1, 100))).toBeLessThan(1)
  })

  it('rejects malformed module identities and delay values', () => {
    const delay = createDefaultDelayReturnModule('fx-1')
    expect(isReturnModule(null)).toBe(false)
    expect(isReturnModule({ id: '', type: 'empty' })).toBe(false)
    expect(isReturnModule({ type: 'empty', extra: true })).toBe(false)
    expect(isReturnModule({ ...delay, mode: 'other' })).toBe(false)
    expect(isReturnModule({ ...delay, timeMs: Number.NaN })).toBe(false)
    expect(isReturnModule({ ...delay, noteDivision: '1/2' })).toBe(false)
    expect(isReturnModule({ ...delay, tapeDistortion: 101 })).toBe(false)
    expect(isReturnModule({ ...delay, pingPong: 'yes' })).toBe(false)
  })

  it('builds, updates, and disposes empty and delay processors', () => {
    const context = createMockContext()
    const contextWithChannels = context as unknown as BaseAudioContext & {
      createChannelSplitter: () => ChannelSplitterNode
      createChannelMerger: () => ChannelMergerNode
    }
    contextWithChannels.createChannelSplitter = () => context.createGain() as unknown as ChannelSplitterNode
    contextWithChannels.createChannelMerger = () => context.createGain() as unknown as ChannelMergerNode

    const empty = createReturnModuleProcessor(contextWithChannels, createEmptyReturnModule('fx-1'), 120)
    empty.update(createDefaultDelayReturnModule('fx-1'), 120)
    empty.dispose()

    const delay = createReturnModuleProcessor(contextWithChannels, createDefaultDelayReturnModule('fx-2'), 120)
    delay.update(createEmptyReturnModule('fx-2'), 120)
    delay.update({ ...createDefaultDelayReturnModule('fx-2'), mode: 'sync', noteDivision: '1/4', pingPong: true }, 60)
    expect(context.created.delays.at(-2)?.delayTime.value).toBe(1)
    expect(context.created.delays.at(-1)?.delayTime.value).toBe(1)
    delay.dispose()
  })

  it('uses the live WaveShaper identity path whenever tape distortion is zero', () => {
    const context = createMockContext()
    const contextWithChannels = context as unknown as BaseAudioContext & {
      createChannelSplitter: () => ChannelSplitterNode
      createChannelMerger: () => ChannelMergerNode
    }
    contextWithChannels.createChannelSplitter = () => context.createGain() as unknown as ChannelSplitterNode
    contextWithChannels.createChannelMerger = () => context.createGain() as unknown as ChannelMergerNode
    const delay = createReturnModuleProcessor(
      contextWithChannels,
      createDefaultDelayReturnModule('fx-1'),
      120
    )

    expect(context.created.waveShapers.slice(-2).map((shaper) => shaper.curve)).toEqual([null, null])

    delay.update({ ...createDefaultDelayReturnModule('fx-1'), tapeDistortion: 50 }, 120)
    expect(context.created.waveShapers.slice(-2).every((shaper) => shaper.curve !== null)).toBe(true)

    delay.update(createDefaultDelayReturnModule('fx-1'), 120)
    expect(context.created.waveShapers.slice(-2).map((shaper) => shaper.curve)).toEqual([null, null])
    delay.dispose()
  })

  it('toggles and disposes the fixed safety limiter', () => {
    const context = createMockContext()
    const limiter = createSafetyLimiter(context as unknown as BaseAudioContext, false)
    limiter.setEnabled(false)
    limiter.setEnabled(true)
    limiter.setEnabled(false)
    limiter.dispose()
    expect(context.created.compressors).toHaveLength(1)
  })
})
