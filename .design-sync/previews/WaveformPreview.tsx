import WaveformPreview from '../../src/renderer/src/components/WaveformPreview'

// The real component decodes audio via getSampleBuffer and needs a genuine
// AudioBuffer-shaped object to paint bars — jsdom has no Web Audio API, so
// this fixture duck-types just the three members computePeaks/the canvas
// draw loop actually read (numberOfChannels, length, getChannelData).
function fakeSampleBuffer(): AudioBuffer {
  const length = 4410
  const data = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    data[i] = Math.sin(i * 0.05) * (0.3 + 0.7 * Math.abs(Math.sin(i * 0.003)))
  }
  return {
    numberOfChannels: 1,
    length,
    getChannelData: () => data
  } as unknown as AudioBuffer
}

export function Selected() {
  return (
    <div style={{ width: 220, padding: 12 }}>
      <WaveformPreview
        filepath="C:/Samples/Drums/Kicks/kick_808.wav"
        getSampleBuffer={async () => fakeSampleBuffer()}
      />
    </div>
  )
}

export function Empty() {
  return (
    <div style={{ width: 220, padding: 12 }}>
      <WaveformPreview filepath={null} getSampleBuffer={async () => null} />
    </div>
  )
}
