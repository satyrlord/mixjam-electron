import { describe, expect, it } from 'vitest'
import { AudioEngine } from './audio-engine'
import { MockAudioContext, MockAudioWorkletNode, createMockContext } from '../test/mockAudioContext'

function makeBuffer(): AudioBuffer {
  return { duration: 1, length: 44100, numberOfChannels: 2, sampleRate: 44100 } as AudioBuffer
}

function makeEngine(): { engine: AudioEngine; context: MockAudioContext } {
  const context = createMockContext()
  const engine = new AudioEngine({ createContext: () => context as unknown as AudioContext })
  return { engine, context }
}

describe('AudioEngine', () => {
  it('test AudioWorklet mock exposes the message-port surface used by the engine', () => {
    const worklet = new MockAudioWorkletNode()
    expect(worklet.port.onmessage).toBeNull()
  })

  it('creates the AudioContext lazily, not in the constructor', () => {
    const context = createMockContext()
    let created = 0
    const engine = new AudioEngine({
      createContext: () => {
        created++
        return context as unknown as AudioContext
      }
    })
    expect(created).toBe(0)
    engine.ensureContext()
    expect(created).toBe(1)
    // Second call reuses the same context.
    engine.ensureContext()
    expect(created).toBe(1)
  })

  it('routes master gain -> analyser -> destination (metering tap after gain)', () => {
    const { engine, context } = makeEngine()
    engine.ensureContext()
    const [masterGain] = context.created.gains
    const [analyser] = context.created.analysers
    expect(masterGain.connectedTo).toContain(analyser)
    expect(analyser.connectedTo).toContain(context.destination)
  })

  it('adds loudness metering as a silent parallel branch without changing the audible route', async () => {
    const { engine, context } = makeEngine()
    await engine.resume()
    await Promise.resolve()

    const [masterGain, bypassGain, silentSink] = context.created.gains
    const [analyser] = context.created.analysers
    const worklet = masterGain.connectedTo.find((node) => node instanceof MockAudioWorkletNode)
    expect(masterGain.connectedTo).toContain(analyser)
    expect(analyser.connectedTo).toContain(context.destination)
    expect(worklet).toBeInstanceOf(MockAudioWorkletNode)
    expect(worklet?.port).toBeDefined()
    expect(worklet?.connectedTo).toContain(silentSink)
    expect(silentSink.gain.value).toBe(0)
    expect(silentSink.connectedTo).toContain(context.destination)
    expect(bypassGain.gain.value).toBe(1)
  })

  // AC-006
  it('triggerVoice connects source -> channel gain/pan -> analyser -> master gain -> destination', () => {
    const { engine, context } = makeEngine()
    const channel = engine.createChannel()
    engine.triggerVoice({ buffer: makeBuffer(), channel, when: 0, laneIndex: 0 })

    const source = context.created.sources[0]
    // Signal flow: source -> channel gain -> channel pan -> stable channel output -> analyser -> master.
    // Gains: [masterGain, bypassGain, channelGain, channelOutput]
    const masterGain = context.created.gains[0]
    const channelGain = context.created.gains[2]
    const channelOutput = context.created.gains[3]
    const channelPan = context.created.panners[0]
    const channelAnalyser = context.created.analysers[1] // per-channel analyser
    expect(source.connectedTo).toContain(channelGain)
    expect(channelGain.connectedTo).toContain(channelPan)
    expect(channelPan.connectedTo).toContain(channelOutput)
    expect(channelOutput.connectedTo).toContain(channelAnalyser)
    expect(channelAnalyser.connectedTo).toContain(masterGain)
  })

  // AC-007
  it('voice.stop() before buffer end terminates and fires voiceEnded', () => {
    const { engine, context } = makeEngine()
    const channel = engine.createChannel()
    const voice = engine.triggerVoice({ buffer: makeBuffer(), channel, when: 0, laneIndex: 0 })
    expect(engine.activeVoiceCount).toBe(1)

    voice.stop()
    context.created.sources[0].endNow()

    expect(voice.state).toBe('ended')
    expect(engine.activeVoiceCount).toBe(0)
  })

  // AC-008
  it('stopAllVoices stops all active voices and drops the count to 0', () => {
    const { engine } = makeEngine()
    const channel = engine.createChannel()
    engine.triggerVoice({ buffer: makeBuffer(), channel, when: 0, laneIndex: 0 })
    engine.triggerVoice({ buffer: makeBuffer(), channel, when: 0, laneIndex: 1 })
    expect(engine.activeVoiceCount).toBe(2)

    engine.stopAllVoices()
    expect(engine.activeVoiceCount).toBe(0)
  })

  // AC-009
  it('createChannel returns channels with independent gain and pan', () => {
    const { engine } = makeEngine()
    const a = engine.createChannel()
    const b = engine.createChannel()

    a.setGain(0.25)
    a.setPan(-1)
    expect(b.gain).toBe(1)
    expect(b.pan).toBe(0)
    expect(a.gain).toBe(0.25)
    expect(a.pan).toBe(-1)
  })

  it('clamps channel gain to 0..1 and pan to -1..1', () => {
    const { engine } = makeEngine()
    const channel = engine.createChannel()
    channel.setGain(5)
    channel.setPan(-3)
    expect(channel.gain).toBe(1)
    expect(channel.pan).toBe(-1)
  })

  // AC-009a
  it('setMasterGain changes master output without touching channel settings', () => {
    const { engine, context } = makeEngine()
    const channel = engine.createChannel()
    channel.setGain(0.5)
    engine.setMasterGain(0.3)

    expect(engine.masterGainLevel).toBe(0.3)
    expect(context.created.gains[0].gain.value).toBe(0.3)
    expect(channel.gain).toBe(0.5)
  })

  // AC-009b
  it('reports master loudness in dB from the analyser tap', () => {
    const { engine, context } = makeEngine()
    engine.ensureContext()
    const analyser = context.created.analysers[0]

    // Full-scale signal -> ~0 dB.
    analyser.timeData = new Float32Array(analyser.fftSize).fill(1)
    expect(engine.getMasterLevelDb()).toBeCloseTo(0, 5)

    // Silence -> floor.
    analyser.timeData = new Float32Array(analyser.fftSize).fill(0)
    expect(engine.getMasterLevelDb()).toBeLessThan(-90)
  })

  it('reports silence dB before the context exists', () => {
    const context = createMockContext()
    const engine = new AudioEngine({ createContext: () => context as unknown as AudioContext })
    expect(engine.getMasterLevelDb()).toBeLessThan(-90)
  })

  it('resume() resumes the AudioContext', async () => {
    const { engine, context } = makeEngine()
    await engine.resume()
    expect(context.resume).toHaveBeenCalled()
    expect(context.state).toBe('running')
  })

  it('setChannelPan updates the pan value on the specified channel', () => {
    const { engine } = makeEngine()
    const channel = engine.createChannel()
    engine.createChannel() // channel index 1

    engine.setChannelPan(0, 0.75)
    expect(channel.pan).toBe(0.75)

    engine.setChannelPan(0, -0.5)
    expect(channel.pan).toBe(-0.5)
  })

  it('setChannelPan is a no-op for an unknown channel index', () => {
    const { engine } = makeEngine()
    expect(() => engine.setChannelPan(999, 0.5)).not.toThrow()
  })

  it('previewBuffer creates a voice connected through a dedicated gain node', () => {
    const { engine, context } = makeEngine()
    const buffer = makeBuffer()

    const voice = engine.previewBuffer(buffer)

    expect(voice.laneIndex).toBe(-1)
    expect(engine.activeVoiceCount).toBe(1)

    // Gains: [masterGain, bypassGain, previewGain]
    const masterGain = context.created.gains[0]
    const previewGain = context.created.gains[2]
    expect(previewGain.gain.value).toBe(0.8)
    expect(previewGain.connectedTo).toContain(masterGain)

    // Verify source is connected to preview gain
    const source = context.created.sources[0]
    expect(source.connectedTo).toContain(previewGain)
  })

  it('previewBuffer voice cleanup disconnects the temporary gain node', () => {
    const { engine, context } = makeEngine()
    const voice = engine.previewBuffer(makeBuffer())

    expect(engine.activeVoiceCount).toBe(1)
    context.created.sources[0].endNow()

    expect(voice.state).toBe('ended')
    expect(engine.activeVoiceCount).toBe(0)
  })

  it('channel disconnect detaches from the audio graph', () => {
    const { engine, context } = makeEngine()
    const channel = engine.createChannel()

    // Voice via channel
    engine.triggerVoice({ buffer: makeBuffer(), channel, when: 0, laneIndex: 0 })

    channel.disconnect()
    const masterGain = context.created.gains[0]
    // Gains: [masterGain, bypassGain, channelGain]. Channel gain is at index 2.
    expect(context.created.gains[2].disconnected).toBe(true)
    // Pan node should be disconnected
    expect(context.created.panners[0].disconnected).toBe(true)
    // Master gain should NOT be disconnected (it's the bus, not the channel)
    expect(masterGain.disconnected).toBe(false)
  })

  it('voice.stop on already ended voice does not throw', () => {
    const { engine, context } = makeEngine()
    const channel = engine.createChannel()
    const voice = engine.triggerVoice({ buffer: makeBuffer(), channel, when: 0, laneIndex: 0 })

    context.created.sources[0].endNow()
    expect(voice.state).toBe('ended')

    // Stopping an already ended voice should not throw
    expect(() => voice.stop()).not.toThrow()
  })
})
