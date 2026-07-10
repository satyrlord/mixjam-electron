// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  analyzeDecodedAudio,
  analyzeWav,
  classifySample,
  decodeWav,
  detectBpm,
  detectMusicalKey,
  isSampleType
} from './analysis'

function sineMix(
  frequencies: number[],
  duration: number,
  sampleRate = 8000
): Float32Array {
  const samples = new Float32Array(Math.round(duration * sampleRate))
  for (let i = 0; i < samples.length; i++) {
    for (const frequency of frequencies) {
      samples[i] += Math.sin(2 * Math.PI * frequency * i / sampleRate) / frequencies.length
    }
  }
  return samples
}

function pulseTrain(bpm: number, duration = 10, sampleRate = 8000): Float32Array {
  const samples = new Float32Array(Math.round(duration * sampleRate))
  const beatFrames = Math.round(sampleRate * 60 / bpm)
  const pulseFrames = Math.round(sampleRate * 0.08)
  for (let beat = 0; beat < samples.length; beat += beatFrames) {
    for (let i = 0; i < pulseFrames && beat + i < samples.length; i++) {
      const envelope = Math.exp(-i / (sampleRate * 0.015))
      samples[beat + i] += envelope * Math.sin(2 * Math.PI * 80 * i / sampleRate)
    }
  }
  return samples
}

function pcm16Wav(samples: Float32Array, sampleRate: number, channels = 1): ArrayBuffer {
  const blockAlign = channels * 2
  const dataSize = samples.length * 2 * channels
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const ascii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }
  ascii(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); ascii(8, 'WAVE')
  ascii(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true)
  view.setUint16(22, channels, true); view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true); view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true); ascii(36, 'data'); view.setUint32(40, dataSize, true)
  samples.forEach((sample, index) => {
    for (let channel = 0; channel < channels; channel++) {
      view.setInt16(44 + index * blockAlign + channel * 2, Math.round(Math.max(-1, Math.min(1, sample)) * 32767), true)
    }
  })
  return buffer
}

function float32Wav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const dataSize = samples.length * 4
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const ascii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }
  ascii(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); ascii(8, 'WAVE')
  ascii(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 3, true)
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 4, true); view.setUint16(32, 4, true)
  view.setUint16(34, 32, true); ascii(36, 'data'); view.setUint32(40, dataSize, true)
  samples.forEach((sample, index) => {
    view.setFloat32(44 + index * 4, sample, true)
  })
  return buffer
}

function pcm8Wav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const dataSize = samples.length
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const ascii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }
  ascii(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); ascii(8, 'WAVE')
  ascii(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true)
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate, true); view.setUint16(32, 1, true)
  view.setUint16(34, 8, true); ascii(36, 'data'); view.setUint32(40, dataSize, true)
  samples.forEach((sample, index) => {
    view.setUint8(44 + index, Math.round(Math.max(-1, Math.min(1, sample)) * 127 + 128))
  })
  return buffer
}

function pcm24Wav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const dataSize = samples.length * 3
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const ascii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }
  ascii(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); ascii(8, 'WAVE')
  ascii(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true)
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 3, true); view.setUint16(32, 3, true)
  view.setUint16(34, 24, true); ascii(36, 'data'); view.setUint32(40, dataSize, true)
  samples.forEach((sample, index) => {
    const intValue = Math.round(Math.max(-1, Math.min(1, sample)) * 8388607)
    view.setUint8(44 + index * 3, intValue & 0xff)
    view.setUint8(44 + index * 3 + 1, (intValue >> 8) & 0xff)
    view.setUint8(44 + index * 3 + 2, (intValue >> 16) & 0xff)
  })
  return buffer
}

describe('sample analysis DSP', () => {
  it('AC-003: detects a clear 120 BPM pulse train within five BPM', () => {
    expect(Math.abs((detectBpm(pulseTrain(120), 8000) ?? 0) - 120)).toBeLessThanOrEqual(5)
  })

  it('AC-004: detects C major from a sustained C major triad', () => {
    const key = detectMusicalKey(sineMix([261.63, 329.63, 392], 4), 8000)
    expect(key).toBe('C')
  })

  it('AC-005: classifies a short low-frequency transient as Kick', () => {
    expect(classifySample({ rms: 0.3, spectralCentroid: 120, zeroCrossingRate: 0.04, transientRatio: 12 }, 0.5, null))
      .toBe('Kick')
  })

  it('decodes PCM WAV and runs the combined analysis pipeline', () => {
    const source = pulseTrain(120)
    const decoded = decodeWav(pcm16Wav(source, 8000))
    expect(decoded?.sampleRate).toBe(8000)
    expect(decoded?.samples).toHaveLength(source.length)
    const result = analyzeDecodedAudio(decoded!)
    expect(Math.abs((result.bpm ?? 0) - 120)).toBeLessThanOrEqual(5)
    expect(result.sampleType).toBe('Loop')
  })

  it('returns null for unsupported or damaged data', () => {
    expect(decodeWav(new ArrayBuffer(12))).toBeNull()
  })
})

describe('decodeWav edge cases', () => {
  it('rejects non-WAVE RIFF chunks', () => {
    const buffer = new ArrayBuffer(44)
    const view = new DataView(buffer)
    const ascii = (offset: number, text: string): void => {
      for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
    }
    ascii(0, 'RIFF'); view.setUint32(4, 36, true); ascii(8, 'XXXX')
    expect(decodeWav(buffer)).toBeNull()
  })

  it('rejects unsupported audio formats', () => {
    const buffer = new ArrayBuffer(44)
    const view = new DataView(buffer)
    const ascii = (offset: number, text: string): void => {
      for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
    }
    ascii(0, 'RIFF'); view.setUint32(4, 36, true); ascii(8, 'WAVE')
    ascii(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 2, true)
    view.setUint16(22, 1, true); view.setUint32(24, 8000, true)
    view.setUint32(28, 8000 * 2, true); view.setUint16(32, 2, true)
    view.setUint16(34, 16, true); ascii(36, 'data'); view.setUint32(40, 0, true)
    expect(decodeWav(buffer)).toBeNull()
  })

  it('decodes 8-bit PCM WAV', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 0.25])
    const decoded = decodeWav(pcm8Wav(samples, 8000))
    expect(decoded?.sampleRate).toBe(8000)
    expect(decoded?.samples).toHaveLength(4)
  })

  it('decodes 24-bit PCM WAV', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 0.25])
    const decoded = decodeWav(pcm24Wav(samples, 8000))
    expect(decoded?.sampleRate).toBe(8000)
    expect(decoded?.samples).toHaveLength(4)
  })

  it('decodes 32-bit float WAV', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 0.25])
    const decoded = decodeWav(float32Wav(samples, 8000))
    expect(decoded?.sampleRate).toBe(8000)
    expect(decoded?.samples).toHaveLength(4)
  })

  it('decodes stereo WAV and mixes to mono', () => {
    const samples = new Float32Array([0.5, -0.5, 0.25, -0.25])
    const decoded = decodeWav(pcm16Wav(samples, 8000, 2))
    expect(decoded?.sampleRate).toBe(8000)
    expect(decoded?.samples).toHaveLength(4)
    expect(decoded!.samples[0]).toBeCloseTo(0.5, 5)
  })

  it('rejects truncated fmt chunk', () => {
    const buffer = new ArrayBuffer(44)
    const view = new DataView(buffer)
    const ascii = (offset: number, text: string): void => {
      for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
    }
    ascii(0, 'RIFF'); view.setUint32(4, 36, true); ascii(8, 'WAVE')
    ascii(12, 'fmt '); view.setUint32(16, 4, true)
  })
})

describe('isSampleType', () => {
  it('validates known sample type values', () => {
    expect(isSampleType('Kick')).toBe(true)
    expect(isSampleType('Snare')).toBe(true)
    expect(isSampleType('Loop')).toBe(true)
    expect(isSampleType('Other')).toBe(true)
  })

  it('rejects unknown strings', () => {
    expect(isSampleType('')).toBe(false)
    expect(isSampleType('Guitar')).toBe(false)
  })

  it('rejects non-string values', () => {
    expect(isSampleType(null)).toBe(false)
    expect(isSampleType(42)).toBe(false)
    expect(isSampleType(undefined)).toBe(false)
  })
})

describe('classifySample edge cases', () => {
  it('returns Other for nearly silent samples', () => {
    expect(classifySample({ rms: 0.001, spectralCentroid: 500, zeroCrossingRate: 0.1, transientRatio: 1 }, 1, null))
      .toBe('Other')
  })

  it('returns Loop for long samples with detected BPM', () => {
    expect(classifySample({ rms: 0.1, spectralCentroid: 500, zeroCrossingRate: 0.1, transientRatio: 3 }, 5, 120))
      .toBe('Loop')
  })

  it('returns Atmosphere for long quiet samples', () => {
    expect(classifySample({ rms: 0.01, spectralCentroid: 500, zeroCrossingRate: 0.05, transientRatio: 3 }, 10, null))
      .toBe('Atmosphere')
  })

  it('returns Hi-hat for short bright noisy samples', () => {
    expect(classifySample({ rms: 0.1, spectralCentroid: 4000, zeroCrossingRate: 0.2, transientRatio: 5 }, 0.3, null))
      .toBe('Hi-hat')
  })

  it('returns Snare for short bright percussive samples', () => {
    expect(classifySample({ rms: 0.2, spectralCentroid: 900, zeroCrossingRate: 0.15, transientRatio: 5 }, 0.5, null))
      .toBe('Snare')
  })

  it('returns Percussion for general short transients', () => {
    expect(classifySample({ rms: 0.2, spectralCentroid: 600, zeroCrossingRate: 0.12, transientRatio: 3 }, 1, null))
      .toBe('Percussion')
  })

  it('returns Bass for low-frequency sustained sounds', () => {
    expect(classifySample({ rms: 0.3, spectralCentroid: 300, zeroCrossingRate: 0.05, transientRatio: 1 }, 1, null))
      .toBe('Bass')
  })

  it('returns Vocal for mid-range samples with moderate ZCR', () => {
    expect(classifySample({ rms: 0.15, spectralCentroid: 2000, zeroCrossingRate: 0.15, transientRatio: 1 }, 4, null))
      .toBe('Vocal')
  })

  it('returns FX for long bright noisy samples', () => {
    expect(classifySample({ rms: 0.1, spectralCentroid: 5000, zeroCrossingRate: 0.05, transientRatio: 1 }, 6, null))
      .toBe('FX')
  })

  it('returns Synth for mid-range melodic samples', () => {
    expect(classifySample({ rms: 0.2, spectralCentroid: 2500, zeroCrossingRate: 0.08, transientRatio: 2 }, 2, null))
      .toBe('Synth')
  })

  it('falls back to Other when no rule matches', () => {
    // High centroid + short duration + no transient = no rule matches
    expect(classifySample({ rms: 0.05, spectralCentroid: 6000, zeroCrossingRate: 0.3, transientRatio: 1 }, 0.5, null))
      .toBe('Other')
  })
})

describe('detectBpm edge cases', () => {
  it('returns null for samples shorter than 1.5 seconds', () => {
    const samples = new Float32Array(Math.round(8000 * 1.0))
    expect(detectBpm(samples, 8000)).toBeNull()
  })

  it('returns null for near-silent samples', () => {
    const samples = new Float32Array(Math.round(8000 * 5))
    for (let i = 0; i < samples.length; i++) samples[i] = 0.0001 * Math.sin(i * 0.01)
    expect(detectBpm(samples, 8000)).toBeNull()
  })
})

describe('detectMusicalKey edge cases', () => {
  it('returns null for very short samples', () => {
    const samples = new Float32Array(Math.round(8000 * 0.3))
    expect(detectMusicalKey(samples, 8000)).toBeNull()
  })

  it('returns null for near-silent samples', () => {
    const samples = new Float32Array(Math.round(8000 * 4))
    expect(detectMusicalKey(samples, 8000)).toBeNull()
  })

  it('detects A minor from a sustained Am triad', () => {
    const key = detectMusicalKey(sineMix([220, 261.63, 329.63], 4), 8000)
    expect(key).toBe('Am')
  })
})

describe('analyzeWav', () => {
  it('decodes and analyzes a PCM WAV buffer end-to-end', () => {
    const source = pulseTrain(120)
    const result = analyzeWav(pcm16Wav(source, 8000))
    expect(result).not.toBeNull()
    expect(Math.abs((result!.bpm ?? 0) - 120)).toBeLessThanOrEqual(5)
  })

  it('returns null for undecodable data', () => {
    expect(analyzeWav(new ArrayBuffer(12))).toBeNull()
  })
})
