import { vi } from 'vitest'

// A minimal mock of the Web Audio API surface the engine touches, enough to
// unit-test routing, gain/pan, voices, metering, and decoding without a real
// AudioContext. Nodes record their connections so tests can assert the graph.

class MockAudioParam {
  constructor(public value: number) {}
}

class MockAudioNode {
  readonly connectedTo: MockAudioNode[] = []
  disconnected = false

  connect(target: MockAudioNode): MockAudioNode {
    this.connectedTo.push(target)
    return target
  }

  disconnect(): void {
    this.disconnected = true
    this.connectedTo.length = 0
  }
}

class MockGainNode extends MockAudioNode {
  gain = new MockAudioParam(1)
}

class MockStereoPannerNode extends MockAudioNode {
  pan = new MockAudioParam(0)
}

class MockAnalyserNode extends MockAudioNode {
  fftSize = 1024
  // Test-controllable time-domain data the engine reads for metering.
  timeData: Float32Array | null = null

  getFloatTimeDomainData(target: Float32Array): void {
    if (this.timeData) {
      target.set(this.timeData.subarray(0, target.length))
    } else {
      target.fill(0)
    }
  }
}

export class MockBufferSourceNode extends MockAudioNode {
  // fallow-ignore-next-line unused-class-member
  buffer: AudioBuffer | null = null
  onended: (() => void) | null = null
  started = false
  stopped = false
  startWhen: number | null = null

  // fallow-ignore-next-line unused-class-member
  start(when?: number): void {
    this.started = true
    this.startWhen = when ?? 0
  }

  stop(): void {
    if (this.stopped) throw new Error('already stopped')
    this.stopped = true
    // Fire onended asynchronously like the real API; tests trigger it manually
    // via `endNow()` when they need deterministic ordering.
  }

  // Test helper: simulate the buffer finishing.
  // fallow-ignore-next-line unused-class-member
  endNow(): void {
    this.onended?.()
  }
}

export class MockAudioContext {
  // fallow-ignore-next-line unused-class-member
  currentTime = 0
  state: AudioContextState = 'suspended'
  destination = new MockAudioNode()
  readonly created: { sources: MockBufferSourceNode[]; gains: MockGainNode[]; panners: MockStereoPannerNode[]; analysers: MockAnalyserNode[] } = {
    sources: [],
    gains: [],
    panners: [],
    analysers: []
  }

  // fallow-ignore-next-line unused-class-member
  createGain(): MockGainNode {
    const node = new MockGainNode()
    this.created.gains.push(node)
    return node
  }

  // fallow-ignore-next-line unused-class-member
  createStereoPanner(): MockStereoPannerNode {
    const node = new MockStereoPannerNode()
    this.created.panners.push(node)
    return node
  }

  // fallow-ignore-next-line unused-class-member
  createAnalyser(): MockAnalyserNode {
    const node = new MockAnalyserNode()
    this.created.analysers.push(node)
    return node
  }

  // fallow-ignore-next-line unused-class-member
  createBufferSource(): MockBufferSourceNode {
    const node = new MockBufferSourceNode()
    this.created.sources.push(node)
    return node
  }

  decodeAudioData = vi.fn(async (): Promise<AudioBuffer> => {
    return { duration: 1, length: 44100, numberOfChannels: 2, sampleRate: 44100 } as AudioBuffer
  })

  resume = vi.fn(async (): Promise<void> => {
    this.state = 'running'
  })

  // fallow-ignore-next-line unused-class-member
  close = vi.fn(async (): Promise<void> => {
    this.state = 'closed'
  })
}

export function createMockContext(): MockAudioContext {
  return new MockAudioContext()
}
