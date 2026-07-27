import { describe, expect, it } from 'vitest'
import {
  labeledMusicalKey,
  labeledPoolToken,
  labeledSampleBpm,
  stripStructuredLabelSuffix
} from './filename-evidence'

describe('authored filename evidence', () => {
  it('parses one structured label for analyzer and generator consumers', () => {
    const path = 'Trance/Bass/BASS001_140_Am_SC12.wav'
    expect(labeledSampleBpm(path)).toBe(140)
    expect(labeledPoolToken(path)).toBe('140/AM')
    expect(labeledMusicalKey(path)).toBe('Am')
  })

  it('keeps bare pitch labels out of musical-key evidence', () => {
    const path = 'House/Keys/CHORD004_125_A_SL3.wav'
    expect(labeledPoolToken(path)).toBe('125/A')
    expect(labeledMusicalKey(path)).toBeNull()
  })

  it('strips the same structured suffix before motif-family parsing', () => {
    expect(stripStructuredLabelSuffix('above-clouds1l_140_X_SC4'))
      .toBe('above-clouds1l')
    expect(stripStructuredLabelSuffix('unlabeled-140-X-SC4'))
      .toBe('unlabeled-140-X-SC4')
  })

  it('accepts explicit bpm and mode tokens without inventing loose numbers', () => {
    expect(labeledSampleBpm('loop_bpm-128.wav')).toBe(128)
    expect(labeledSampleBpm('loop_128.wav')).toBeNull()
    expect(labeledMusicalKey('pad_F#minor.wav')).toBe('F#m')
  })
})
