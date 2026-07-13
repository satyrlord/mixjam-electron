import { describe, expect, it, vi } from 'vitest'
import {
  MasterMeter,
  emptyMasterMeterSnapshot,
  normalizeLoudnessSnapshot
} from './master-meter'

function measurement(overrides: Record<string, unknown> = {}) {
  return {
    currentMeasurements: [{
      momentaryLoudness: -18,
      shortTermLoudness: -19,
      integratedLoudness: -20,
      maximumMomentaryLoudness: -17,
      maximumShortTermLoudness: -18,
      maximumTruePeakLevel: -1.2,
      loudnessRange: 6,
      ...overrides
    }]
  }
}

function createHarness(addModule = vi.fn(async () => undefined)) {
  const source = {
    connect: vi.fn(),
    disconnect: vi.fn()
  } as unknown as AudioNode
  const destination = {} as AudioNode
  const sinks: Array<{ gain: { value: number }; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = []
  const nodes: Array<{
    connect: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
    port: { onmessage: ((event: MessageEvent<unknown>) => void) | null; close: ReturnType<typeof vi.fn> }
  }> = []
  const context = {
    audioWorklet: { addModule },
    createGain: vi.fn(() => {
      const sink = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }
      sinks.push(sink)
      return sink
    })
  } as unknown as AudioContext
  const createNode = vi.fn(() => {
    const node = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      port: { onmessage: null, close: vi.fn() }
    }
    nodes.push(node)
    return node as unknown as AudioWorkletNode
  })
  return { context, source, destination, sinks, nodes, addModule, createNode }
}

describe('normalizeLoudnessSnapshot', () => {
  it('maps the package message to the project-owned units', () => {
    expect(normalizeLoudnessSnapshot(measurement(), -24)).toEqual({
      available: true,
      rmsDbfs: -24,
      momentaryLufs: -18,
      shortTermLufs: -19,
      integratedLufs: -20,
      truePeakDbtp: -1.2,
      loudnessRangeLu: 6
    })
  })

  it('ignores malformed, empty, and entirely non-finite messages', () => {
    expect(normalizeLoudnessSnapshot(null)).toBeNull()
    expect(normalizeLoudnessSnapshot({ currentMeasurements: [] })).toBeNull()
    expect(normalizeLoudnessSnapshot(measurement({
      momentaryLoudness: Number.NEGATIVE_INFINITY,
      shortTermLoudness: Number.NaN,
      integratedLoudness: Number.POSITIVE_INFINITY,
      maximumTruePeakLevel: undefined,
      loudnessRange: 'unknown'
    }))).toBeNull()
  })
})

describe('MasterMeter', () => {
  it('memoizes module loading and attaches a silent measurement-only branch', async () => {
    const harness = createHarness()
    const meter = new MasterMeter({
      processorUrl: '/assets/loudness.js',
      createNode: harness.createNode
    })

    const first = meter.initialize(harness.context, harness.source, harness.destination)
    const second = meter.initialize(harness.context, harness.source, harness.destination)
    expect(first).toBe(second)
    await expect(first).resolves.toBe(true)

    expect(harness.addModule).toHaveBeenCalledOnce()
    expect(harness.addModule).toHaveBeenCalledWith('/assets/loudness.js')
    expect(harness.createNode).toHaveBeenCalledWith(
      harness.context,
      'loudness-processor',
      expect.objectContaining({ processorOptions: { interval: 0.1 } })
    )
    expect(harness.source.connect).toHaveBeenCalledWith(harness.nodes[0])
    expect(harness.sinks[0].gain.value).toBe(0)
    expect(harness.sinks[0].connect).toHaveBeenCalledWith(harness.destination)
  })

  it('publishes normalized data and recreates the processor to reset integration', async () => {
    const harness = createHarness()
    const meter = new MasterMeter({ createNode: harness.createNode })
    await meter.initialize(harness.context, harness.source, harness.destination)
    harness.nodes[0].port.onmessage?.({ data: measurement() } as MessageEvent<unknown>)
    expect(meter.getSnapshot(-30).integratedLufs).toBe(-20)

    meter.reset()

    expect(meter.getSnapshot(-31)).toEqual(emptyMasterMeterSnapshot(-31))
    expect(harness.createNode).toHaveBeenCalledTimes(2)
    expect(harness.source.disconnect).toHaveBeenCalledWith(harness.nodes[0])
    expect(harness.nodes[0].port.close).toHaveBeenCalledOnce()
  })

  it('warns once and retains fallback when loading fails', async () => {
    const addModule = vi.fn(async () => { throw new Error('blocked') })
    const warn = vi.fn()
    const harness = createHarness(addModule)
    const meter = new MasterMeter({ createNode: harness.createNode, warn })

    await expect(meter.initialize(harness.context, harness.source, harness.destination)).resolves.toBe(false)
    await expect(meter.initialize(harness.context, harness.source, harness.destination)).resolves.toBe(false)

    expect(warn).toHaveBeenCalledOnce()
    expect(harness.createNode).not.toHaveBeenCalled()
    expect(meter.getSnapshot(-22)).toEqual(emptyMasterMeterSnapshot(-22))
  })

  it('cleans up a partially attached branch when connection fails', async () => {
    const warn = vi.fn()
    const harness = createHarness()
    vi.mocked(harness.source.connect).mockImplementationOnce(() => {
      throw new Error('connect failed')
    })
    const meter = new MasterMeter({ createNode: harness.createNode, warn })

    await expect(meter.initialize(harness.context, harness.source, harness.destination)).resolves.toBe(false)

    expect(warn).toHaveBeenCalledOnce()
    expect(harness.nodes[0].port.onmessage).toBeNull()
    expect(harness.nodes[0].port.close).toHaveBeenCalledOnce()
    expect(harness.nodes[0].disconnect).toHaveBeenCalledOnce()
    expect(harness.sinks[0].disconnect).toHaveBeenCalledOnce()
  })

  it('disconnects handlers and nodes on close', async () => {
    const harness = createHarness()
    const meter = new MasterMeter({ createNode: harness.createNode })
    await meter.initialize(harness.context, harness.source, harness.destination)

    meter.close()

    expect(harness.nodes[0].port.onmessage).toBeNull()
    expect(harness.nodes[0].port.close).toHaveBeenCalledOnce()
    expect(harness.nodes[0].disconnect).toHaveBeenCalledOnce()
    expect(harness.sinks[0].disconnect).toHaveBeenCalledOnce()
  })
})
