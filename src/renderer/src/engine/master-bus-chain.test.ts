import { describe, expect, it, vi } from 'vitest'
import { MasterBusChain } from './master-bus-chain'
import { defaultMasterBusState } from './masterbus/presets'
import { DEFAULT_PROCESSOR_ORDER } from './masterbus/params'

interface FakeNode {
  connect: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
  port: {
    onmessage: ((event: MessageEvent<unknown>) => void) | null
    close: ReturnType<typeof vi.fn>
    postMessage: ReturnType<typeof vi.fn>
  }
}

function createHarness(addModule = vi.fn(async () => undefined)) {
  const upstream = { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode
  const downstream = {} as AudioNode
  const nodes: FakeNode[] = []
  const context = {
    audioWorklet: { addModule }
  } as unknown as AudioContext
  const createNode = vi.fn((_context: BaseAudioContext, _name: string, _options: AudioWorkletNodeOptions) => {
    void _context
    void _name
    void _options
    const node: FakeNode = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      port: { onmessage: null, close: vi.fn(), postMessage: vi.fn() }
    }
    nodes.push(node)
    return node as unknown as AudioWorkletNode
  })
  return { context, upstream, downstream, nodes, addModule, createNode }
}

function meterMessage(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      vuDb: -18,
      peakL: false,
      peakR: false,
      compGrDb: 1.2,
      limGrDb: 0.4,
      latencySamples: 277,
      faultCount: 0,
      ...overrides
    }
  } as MessageEvent<unknown>
}

describe('MasterBusChain', () => {
  it('inserts the worklet between upstream and downstream on success', async () => {
    const harness = createHarness()
    const chain = new MasterBusChain({ processorUrl: 'stub', createNode: harness.createNode })
    const ok = await chain.initialize(harness.context, harness.upstream, harness.downstream)
    expect(ok).toBe(true)
    expect(harness.upstream.disconnect).toHaveBeenCalledWith(harness.downstream)
    expect(harness.upstream.connect).toHaveBeenCalledWith(harness.nodes[0])
    expect(harness.nodes[0].connect).toHaveBeenCalledWith(harness.downstream)
    expect(chain.output).toBe(harness.nodes[0])
  })

  it('passes the current state to the processor and re-sends prior edits', async () => {
    const harness = createHarness()
    const chain = new MasterBusChain({ processorUrl: 'stub', createNode: harness.createNode })
    // Edits arriving before the worklet loads must not be lost.
    chain.setParam('gain.trim', 6)
    const power = { ...defaultMasterBusState().power, lim: false }
    chain.setTopology(DEFAULT_PROCESSOR_ORDER, power)
    await chain.initialize(harness.context, harness.upstream, harness.downstream)
    const options = harness.createNode.mock.calls[0][2]
    const state = (options.processorOptions as { state: ReturnType<typeof defaultMasterBusState> }).state
    expect(state.params['gain.trim']).toBe(6)
    expect(state.power.lim).toBe(false)
    expect(state.preset).toBeNull()
  })

  it('forwards param, topology, and state messages once attached', async () => {
    const harness = createHarness()
    const chain = new MasterBusChain({ processorUrl: 'stub', createNode: harness.createNode })
    await chain.initialize(harness.context, harness.upstream, harness.downstream)
    const post = harness.nodes[0].port.postMessage
    chain.setParam('lim.gain', 7)
    expect(post).toHaveBeenCalledWith({ type: 'param', id: 'lim.gain', value: 7 })
    const power = defaultMasterBusState().power
    chain.setTopology(DEFAULT_PROCESSOR_ORDER, power)
    expect(post).toHaveBeenCalledWith({ type: 'topology', order: [...DEFAULT_PROCESSOR_ORDER], power })
    const state = defaultMasterBusState()
    chain.applyState(state)
    expect(post).toHaveBeenCalledWith({ type: 'state', state })
  })

  it('captures meter snapshots and ignores malformed messages', async () => {
    const harness = createHarness()
    const chain = new MasterBusChain({ processorUrl: 'stub', createNode: harness.createNode })
    await chain.initialize(harness.context, harness.upstream, harness.downstream)
    expect(chain.getMeterSnapshot()).toBeNull()
    harness.nodes[0].port.onmessage?.(meterMessage())
    expect(chain.getMeterSnapshot()?.vuDb).toBe(-18)
    harness.nodes[0].port.onmessage?.({ data: { junk: true } } as MessageEvent<unknown>)
    expect(chain.getMeterSnapshot()?.vuDb).toBe(-18)
  })

  it('degrades to passthrough with one warning when the module fails', async () => {
    const warn = vi.fn()
    const harness = createHarness(vi.fn(async () => Promise.reject(new Error('nope'))))
    const chain = new MasterBusChain({ processorUrl: 'stub', createNode: harness.createNode, warn })
    const ok = await chain.initialize(harness.context, harness.upstream, harness.downstream)
    expect(ok).toBe(false)
    expect(chain.output).toBeNull()
    expect(harness.upstream.disconnect).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('close detaches the node and restores the direct route', async () => {
    const harness = createHarness()
    const chain = new MasterBusChain({ processorUrl: 'stub', createNode: harness.createNode })
    await chain.initialize(harness.context, harness.upstream, harness.downstream)
    chain.close()
    expect(harness.nodes[0].port.close).toHaveBeenCalled()
    expect(harness.nodes[0].disconnect).toHaveBeenCalled()
    expect(harness.upstream.connect).toHaveBeenCalledWith(harness.downstream)
    expect(chain.output).toBeNull()
    expect(chain.getMeterSnapshot()).toBeNull()
  })
})
