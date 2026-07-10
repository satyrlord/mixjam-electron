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

class MockDelayNode extends MockAudioNode {
  delayTime = new MockAudioParam(0)
}

class MockConvolverNode extends MockAudioNode {
  buffer: AudioBuffer | null = null
  channelCount = 2
  channelCountMode: ChannelCountMode = 'max'
}

class MockDynamicsCompressorNode extends MockAudioNode {
  threshold = new MockAudioParam(-24)
  ratio = new MockAudioParam(12)
  attack = new MockAudioParam(0.003)
  release = new MockAudioParam(0.25)
}

interface CreatedAudioNodes {
  sources: MockBufferSourceNode[]
  gains: MockGainNode[]
  panners: MockStereoPannerNode[]
  analysers: MockAnalyserNode[]
  delays: MockDelayNode[]
  convolvers: MockConvolverNode[]
  compressors: MockDynamicsCompressorNode[]
}

function createEffectContextSurface(created: CreatedAudioNodes) {
  return {
    sampleRate: 44100,
    createDelay(): MockDelayNode {
      const node = new MockDelayNode()
      created.delays.push(node)
      return node
    },
    createConvolver(): MockConvolverNode {
      const node = new MockConvolverNode()
      created.convolvers.push(node)
      return node
    },
    createDynamicsCompressor(): MockDynamicsCompressorNode {
      const node = new MockDynamicsCompressorNode()
      created.compressors.push(node)
      return node
    },
    createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBuffer {
      const channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length))
      return {
        numberOfChannels,
        length,
        sampleRate,
        duration: length / sampleRate,
        getChannelData: (channel: number) => channels[channel]!
      } as AudioBuffer
    }
  }
}

type EffectContextSurface = ReturnType<typeof createEffectContextSurface>

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

class MockAudioContextBase {
  currentTime = 0
  state: AudioContextState = 'suspended'
  destination = new MockAudioNode()
  readonly created: CreatedAudioNodes = {
    sources: [],
    gains: [],
    panners: [],
    analysers: [],
    delays: [],
    convolvers: [],
    compressors: []
  }

  constructor() {
    Object.assign(this, createEffectContextSurface(this.created))
  }

  createGain(): MockGainNode {
    const node = new MockGainNode()
    this.created.gains.push(node)
    return node
  }

  createStereoPanner(): MockStereoPannerNode {
    const node = new MockStereoPannerNode()
    this.created.panners.push(node)
    return node
  }

  createAnalyser(): MockAnalyserNode {
    const node = new MockAnalyserNode()
    this.created.analysers.push(node)
    return node
  }

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

  close = vi.fn(async (): Promise<void> => {
    this.state = 'closed'
  })
}

export type MockAudioContext = MockAudioContextBase & EffectContextSurface

export const MockAudioContext = MockAudioContextBase as new () => MockAudioContext

export function createMockContext(): MockAudioContext {
  return new MockAudioContext()
}
