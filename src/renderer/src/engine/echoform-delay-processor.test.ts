// The worklet-backed Echoform Delay path. return-effects.test.ts covers the
// identity fallback taken when no processor is registered; these cases drive
// registration and then the real node path: state serialization, the update
// message, disposal, and the two degradation branches.

import { describe, expect, it, vi } from 'vitest'
import { createMockContext } from '../test/mockAudioContext'
import {
  createEchoformDelayProcessor,
  prepareEchoformDelayWorklet
} from './echoform-delay-processor'
import {
  createDefaultEchoformDelayReturnModule,
  createEmptyReturnModule
} from './return-effects'

interface FakeWorkletNode {
  connect: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
  port: { postMessage: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }
}

function fakeNodeFactory(): {
  createNode: (c: BaseAudioContext, n: string, o: AudioWorkletNodeOptions) => AudioWorkletNode
  nodes: FakeWorkletNode[]
  options: AudioWorkletNodeOptions[]
} {
  const nodes: FakeWorkletNode[] = []
  const options: AudioWorkletNodeOptions[] = []
  const createNode = (_c: BaseAudioContext, _n: string, o: AudioWorkletNodeOptions): AudioWorkletNode => {
    options.push(o)
    const node: FakeWorkletNode = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      port: { postMessage: vi.fn(), close: vi.fn() }
    }
    nodes.push(node)
    return node as unknown as AudioWorkletNode
  }
  return { createNode, nodes, options }
}

describe('Echoform Delay worklet processor', () => {
  it('registers once per context and memoizes the in-flight promise', async () => {
    const context = createMockContext()
    const ctx = context as unknown as BaseAudioContext

    const first = prepareEchoformDelayWorklet(ctx)
    // A second call before the first settles returns the same promise rather
    // than issuing a second addModule.
    expect(prepareEchoformDelayWorklet(ctx)).toBe(first)
    expect(await first).toBe(true)
    expect(context.audioWorklet.addModule).toHaveBeenCalledTimes(1)

    // Once ready the call is synchronous and still reports success.
    expect(await prepareEchoformDelayWorklet(ctx)).toBe(true)
    expect(context.audioWorklet.addModule).toHaveBeenCalledTimes(1)
  })

  it('reports failure when the context has no AudioWorklet', async () => {
    const bare = { createGain: () => ({}) } as unknown as BaseAudioContext
    expect(await prepareEchoformDelayWorklet(bare)).toBe(false)
  })

  it('reports failure when addModule rejects', async () => {
    const context = createMockContext()
    context.audioWorklet.addModule = vi.fn(async () => {
      throw new Error('bad asset')
    })
    expect(await prepareEchoformDelayWorklet(context as unknown as BaseAudioContext)).toBe(false)
  })

  it('builds the worklet node, serializes state, and wires input to output', async () => {
    const context = createMockContext()
    const ctx = context as unknown as BaseAudioContext
    await prepareEchoformDelayWorklet(ctx)
    const { createNode, nodes, options } = fakeNodeFactory()

    const module = createDefaultEchoformDelayReturnModule('fx-1')
    const processor = createEchoformDelayProcessor(ctx, module, 128, createNode)

    expect(nodes).toHaveLength(1)
    expect(options[0]).toMatchObject({
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2]
    })
    // The serialized state carries the module's audio fields but not its
    // identity — id/type stay on the renderer side.
    const sent = (options[0].processorOptions as { state: Record<string, unknown>; bpm: number })
    expect(sent.bpm).toBe(128)
    expect(sent.state).toMatchObject({
      mode: 'sync',
      divisionL: '1/4',
      feedback: 68,
      character: 'tape',
      pingPong: true,
      bypass: false
    })
    expect(sent.state).not.toHaveProperty('id')
    expect(sent.state).not.toHaveProperty('type')
    expect(processor.input).toBeDefined()
    expect(processor.output).toBeDefined()
  })

  it('posts state on update, ignores non-delay modules, and closes the port on dispose', async () => {
    const context = createMockContext()
    const ctx = context as unknown as BaseAudioContext
    await prepareEchoformDelayWorklet(ctx)
    const { createNode, nodes } = fakeNodeFactory()
    const processor = createEchoformDelayProcessor(
      ctx, createDefaultEchoformDelayReturnModule('fx-1'), 120, createNode
    )
    const post = nodes[0]!.port.postMessage

    // A module of another type is not this processor's business.
    processor.update(createEmptyReturnModule('fx-1'), 120)
    expect(post).not.toHaveBeenCalled()

    processor.update(
      { ...createDefaultEchoformDelayReturnModule('fx-1'), feedback: 90, mode: 'free' },
      90
    )
    expect(post).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledWith({
      type: 'state',
      state: expect.objectContaining({ feedback: 90, mode: 'free' }),
      bpm: 90
    })

    processor.dispose()
    expect(nodes[0]!.disconnect).toHaveBeenCalled()
    expect(nodes[0]!.port.close).toHaveBeenCalled()
  })

  it('falls back to identity when node construction throws', async () => {
    const context = createMockContext()
    const ctx = context as unknown as BaseAudioContext
    await prepareEchoformDelayWorklet(ctx)
    const processor = createEchoformDelayProcessor(
      ctx,
      createDefaultEchoformDelayReturnModule('fx-1'),
      120,
      () => {
        throw new Error('AudioWorkletNode unavailable')
      }
    )
    // Degraded, but still a usable processor: update and dispose are no-ops
    // rather than throws, and the graph endpoints exist.
    expect(processor.input).toBeDefined()
    expect(processor.output).toBeDefined()
    expect(() => processor.update(createDefaultEchoformDelayReturnModule('fx-1'), 120)).not.toThrow()
    expect(() => processor.dispose()).not.toThrow()
  })
})
