import { SAMPLE_TYPE_VALUES, type SampleType } from '../../../shared/backend-api'

export interface DecodedPcm {
  samples: Float32Array
  sampleRate: number
}

export interface AudioFeatures {
  rms: number
  spectralCentroid: number
  zeroCrossingRate: number
  transientRatio: number
}

export interface SampleAnalysisResult {
  bpm: number | null
  musicalKey: string | null
  sampleType: SampleType
  features: AudioFeatures
  durationSeconds: number
}

const SAMPLE_TYPES = new Set<SampleType>(SAMPLE_TYPE_VALUES)

export function isSampleType(value: unknown): value is SampleType {
  return typeof value === 'string' && SAMPLE_TYPES.has(value as SampleType)
}

function fourCc(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset), view.getUint8(offset + 1),
    view.getUint8(offset + 2), view.getUint8(offset + 3)
  )
}

/** Decodes PCM and IEEE-float WAV data without relying on AudioContext, which
 * keeps the entire analysis path inside the backend Web Worker. */
export function decodeWav(buffer: ArrayBuffer): DecodedPcm | null {
  if (buffer.byteLength < 44) return null
  const view = new DataView(buffer)
  const container = fourCc(view, 0)
  const littleEndian = container === 'RIFF'
  if (!littleEndian && container !== 'RIFX') return null
  if (fourCc(view, 8) !== 'WAVE') return null

  let format = 0
  let channels = 0
  let sampleRate = 0
  let bitsPerSample = 0
  let blockAlign = 0
  let dataOffset = 0
  let dataSize = 0

  for (let offset = 12; offset + 8 <= view.byteLength;) {
    const id = fourCc(view, offset)
    const size = view.getUint32(offset + 4, littleEndian)
    const body = offset + 8
    if (body + size > view.byteLength) return null
    if (id === 'fmt ' && size >= 16) {
      format = view.getUint16(body, littleEndian)
      channels = view.getUint16(body + 2, littleEndian)
      sampleRate = view.getUint32(body + 4, littleEndian)
      blockAlign = view.getUint16(body + 12, littleEndian)
      bitsPerSample = view.getUint16(body + 14, littleEndian)
      // WAVE_FORMAT_EXTENSIBLE stores the actual codec at the start of the
      // sub-format GUID. PCM and IEEE float keep their ordinary ids there.
      if (format === 0xfffe && size >= 40) format = view.getUint16(body + 24, littleEndian)
    } else if (id === 'data') {
      dataOffset = body
      dataSize = size
    }
    offset = body + size + (size & 1)
  }

  if (!dataOffset || !dataSize || !channels || !sampleRate || !blockAlign) return null
  if (format !== 1 && format !== 3) return null
  if (![8, 16, 24, 32, 64].includes(bitsPerSample)) return null
  if (format === 1 && bitsPerSample === 64) return null
  if (format === 3 && bitsPerSample !== 32 && bitsPerSample !== 64) return null

  const frames = Math.floor(dataSize / blockAlign)
  const bytesPerSample = bitsPerSample / 8
  const samples = new Float32Array(frames)

  const read = (offset: number): number => {
    if (format === 3) {
      return bitsPerSample === 32
        ? view.getFloat32(offset, littleEndian)
        : view.getFloat64(offset, littleEndian)
    }
    if (bitsPerSample === 8) return (view.getUint8(offset) - 128) / 128
    if (bitsPerSample === 16) return view.getInt16(offset, littleEndian) / 32768
    if (bitsPerSample === 24) {
      let value = littleEndian
        ? view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16)
        : (view.getUint8(offset) << 16) | (view.getUint8(offset + 1) << 8) | view.getUint8(offset + 2)
      if (value & 0x800000) value |= 0xff000000
      return value / 8388608
    }
    return view.getInt32(offset, littleEndian) / 2147483648
  }

  for (let frame = 0; frame < frames; frame++) {
    let sum = 0
    const base = dataOffset + frame * blockAlign
    for (let channel = 0; channel < channels; channel++) {
      sum += read(base + channel * bytesPerSample)
    }
    samples[frame] = Math.max(-1, Math.min(1, sum / channels))
  }
  return { samples, sampleRate }
}

function nextPowerOfTwo(value: number): number {
  let result = 1
  while (result < value) result <<= 1
  return result
}

function fftMagnitudes(input: Float32Array, start: number, size: number): Float64Array {
  const re = new Float64Array(size)
  const im = new Float64Array(size)
  const available = Math.min(size, input.length - start)
  for (let i = 0; i < available; i++) {
    re[i] = input[start + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)))
  }

  for (let i = 1, j = 0; i < size; i++) {
    let bit = size >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr
      const ti = im[i]; im[i] = im[j]; im[j] = ti
    }
  }
  for (let length = 2; length <= size; length <<= 1) {
    const angle = (-2 * Math.PI) / length
    const wLenR = Math.cos(angle)
    const wLenI = Math.sin(angle)
    for (let i = 0; i < size; i += length) {
      let wr = 1
      let wi = 0
      for (let j = 0; j < length / 2; j++) {
        const even = i + j
        const odd = even + length / 2
        const vr = re[odd] * wr - im[odd] * wi
        const vi = re[odd] * wi + im[odd] * wr
        re[odd] = re[even] - vr
        im[odd] = im[even] - vi
        re[even] += vr
        im[even] += vi
        const nextWr = wr * wLenR - wi * wLenI
        wi = wr * wLenI + wi * wLenR
        wr = nextWr
      }
    }
  }
  const magnitudes = new Float64Array(size / 2)
  for (let i = 0; i < magnitudes.length; i++) magnitudes[i] = Math.hypot(re[i], im[i])
  return magnitudes
}

function extractFeatures(samples: Float32Array, sampleRate: number): AudioFeatures {
  if (samples.length === 0) {
    return { rms: 0, spectralCentroid: 0, zeroCrossingRate: 0, transientRatio: 0 }
  }
  const stride = Math.max(1, Math.floor(samples.length / 200_000))
  let squares = 0
  let crossings = 0
  let previous = samples[0]
  let count = 0
  for (let i = 0; i < samples.length; i += stride) {
    const value = samples[i]
    squares += value * value
    if ((value >= 0) !== (previous >= 0)) crossings++
    previous = value
    count++
  }

  const fftSize = Math.min(4096, nextPowerOfTwo(Math.min(samples.length, 4096)))
  const mags = fftMagnitudes(samples, Math.max(0, Math.floor((samples.length - fftSize) / 2)), fftSize)
  let weighted = 0
  let magnitude = 0
  for (let bin = 1; bin < mags.length; bin++) {
    const value = mags[bin]
    weighted += value * (bin * sampleRate / fftSize)
    magnitude += value
  }

  const frame = Math.max(128, Math.round(sampleRate * 0.02))
  let maxEnergy = 0
  let meanEnergy = 0
  let frames = 0
  for (let start = 0; start < samples.length; start += frame) {
    let energy = 0
    const end = Math.min(samples.length, start + frame)
    for (let i = start; i < end; i++) energy += samples[i] * samples[i]
    energy /= Math.max(1, end - start)
    meanEnergy += energy
    maxEnergy = Math.max(maxEnergy, energy)
    frames++
  }
  meanEnergy /= Math.max(1, frames)

  return {
    rms: Math.sqrt(squares / count),
    spectralCentroid: magnitude > 0 ? weighted / magnitude : 0,
    zeroCrossingRate: crossings / Math.max(1, count - 1),
    transientRatio: meanEnergy > 0 ? maxEnergy / meanEnergy : 0
  }
}

export function detectBpm(samples: Float32Array, sampleRate: number): number | null {
  const duration = samples.length / sampleRate
  if (duration < 1.5) return null
  const hop = Math.max(64, Math.round(sampleRate / 200))
  const envelopeLength = Math.floor(samples.length / hop)
  if (envelopeLength < 200) return null
  const energy = new Float64Array(envelopeLength)
  for (let frame = 0; frame < envelopeLength; frame++) {
    let sum = 0
    const start = frame * hop
    const end = Math.min(samples.length, start + hop)
    for (let i = start; i < end; i++) sum += samples[i] * samples[i]
    energy[frame] = Math.sqrt(sum / Math.max(1, end - start))
  }
  const novelty = new Float64Array(envelopeLength)
  let noveltyMean = 0
  for (let i = 1; i < energy.length; i++) {
    novelty[i] = Math.max(0, energy[i] - energy[i - 1])
    noveltyMean += novelty[i]
  }
  noveltyMean /= novelty.length
  let noveltyVariance = 0
  for (const value of novelty) noveltyVariance += (value - noveltyMean) ** 2
  noveltyVariance /= novelty.length
  if (noveltyVariance < 1e-8) return null

  const envelopeRate = sampleRate / hop
  const minLag = Math.floor(envelopeRate * 60 / 200)
  const maxLag = Math.ceil(envelopeRate * 60 / 60)
  // Consecutive onset intervals resolve the common half-tempo ambiguity of a
  // plain autocorrelation (a 120 BPM pulse train also correlates at 60 BPM).
  const threshold = noveltyMean + Math.sqrt(noveltyVariance) * 1.5
  const peaks: number[] = []
  const minPeakDistance = Math.max(1, Math.floor(envelopeRate * 60 / 240))
  for (let i = 1; i < novelty.length - 1; i++) {
    if (novelty[i] < threshold || novelty[i] < novelty[i - 1] || novelty[i] < novelty[i + 1]) continue
    if (peaks.length === 0 || i - peaks[peaks.length - 1] >= minPeakDistance) peaks.push(i)
  }
  const intervalCounts = new Map<number, number>()
  for (let i = 1; i < peaks.length; i++) {
    const interval = peaks[i] - peaks[i - 1]
    if (interval >= minLag && interval <= maxLag) {
      intervalCounts.set(interval, (intervalCounts.get(interval) ?? 0) + 1)
    }
  }
  let onsetLag = 0
  let onsetCount = 0
  for (const [lag, count] of intervalCounts) {
    if (count > onsetCount) { onsetLag = lag; onsetCount = count }
  }
  const onsetBpm = onsetCount >= 3 ? 60 * envelopeRate / onsetLag : null

  let bestLag = 0
  let bestScore = 0
  let scoreSum = 0
  let scoreCount = 0
  for (let lag = minLag; lag <= maxLag; lag++) {
    let score = 0
    for (let i = lag; i < novelty.length; i++) score += novelty[i] * novelty[i - lag]
    score /= novelty.length - lag
    scoreSum += score
    scoreCount++
    if (score > bestScore) { bestScore = score; bestLag = lag }
  }
  if (!bestLag || bestScore < (scoreSum / Math.max(1, scoreCount)) * 1.15) return null
  const autocorrelationBpm = 60 * envelopeRate / bestLag
  // Prefer a direct onset interval in the ordinary musical-tempo range. When
  // it instead locks to fast subdivisions, the global autocorrelation is the
  // better beat-level estimate. This also avoids the autocorrelation's common
  // 60-versus-120 half-tempo ambiguity on sparse pulse trains.
  let bpm = onsetBpm !== null && onsetBpm >= 80 && onsetBpm <= 160
    ? onsetBpm
    : autocorrelationBpm
  // Loop files are trimmed to a whole number of beats, so the file duration
  // constrains the tempo to a discrete grid far more reliably than the raw
  // onset/autocorrelation estimate (which frequently locks to a half- or
  // double-tempo on sparse or busy loops). When a whole-bar tempo sits close to
  // the estimate — allowing for an octave (x2 / /2) error — snap to it. This is
  // what makes same-length loops report the same tempo instead of scattering.
  const gridBpm = wholeBarLoopBpm(duration, bpm)
  if (gridBpm !== null) bpm = gridBpm
  return Math.round(bpm * 10) / 10
}

// Beats-per-bar counts a loop is commonly trimmed to, in 4/4. Power-of-two bar
// counts are strongly preferred, so their beat counts come first and win ties.
const LOOP_BEAT_GRID = [4, 8, 16, 32, 2, 64, 6, 12, 24, 3]
// A raw estimate below this is treated as a likely half-tempo lock, so a
// double-time whole-bar candidate is allowed to win. Loops in these genres
// almost never sit below ~90 BPM, and a slow estimate usually means the beat
// tracker counted every other beat.
const LOOP_SLOW_TEMPO = 90
// The canonical tempo band a resolved loop tempo should prefer to land in.
const LOOP_CANONICAL_MIN = 100
const LOOP_CANONICAL_MAX = 160
// Max relative gap between the raw estimate (or its octave) and a whole-bar grid
// candidate for the snap to apply. Wide because the beat tracker is unreliable
// on loops; the canonical/power-of-two preferences disambiguate the match.
const LOOP_SNAP_TOLERANCE = 0.14

function inCanonicalBand(bpm: number): boolean {
  return bpm >= LOOP_CANONICAL_MIN && bpm <= LOOP_CANONICAL_MAX
}

/**
 * If `duration` is close to a whole number of bars at a tempo near `estimate`
 * (or its octave), return that snapped tempo; otherwise null. Only fires for
 * phrase-length material so short one-shots are never reshaped.
 *
 * Among grid candidates that match, prefer one in the canonical tempo band,
 * then power-of-two bar counts, then closeness to the estimate. This corrects
 * the beat tracker's frequent half-tempo lock (e.g. reporting 70 for a 140 BPM
 * loop) so same-tempo loops report the same tempo.
 */
function wholeBarLoopBpm(duration: number, estimate: number): number | null {
  if (duration < 1.4) return null
  // Consider the estimate and its octave neighbours; a loop mis-detected at half
  // or double tempo still points at the right beat grid after correction. A slow
  // estimate leans harder on the double-time target.
  const targets = estimate < LOOP_SLOW_TEMPO
    ? [estimate * 2, estimate, estimate / 2]
    : [estimate, estimate * 2, estimate / 2]
  let best: { bpm: number; error: number; rank: number; canonical: boolean } | null = null
  for (const beats of LOOP_BEAT_GRID) {
    const candidate = beats * 60 / duration
    if (candidate < 70 || candidate > 180) continue
    const rank = LOOP_BEAT_GRID.indexOf(beats)
    const canonical = inCanonicalBand(candidate)
    for (const target of targets) {
      const error = Math.abs(candidate - target) / target
      // The raw beat-tracker estimate is noisy on real loops, so the tolerance
      // is generous; the canonical-band and power-of-two preferences below keep
      // an over-loose match from landing on an odd bar count.
      if (error > LOOP_SNAP_TOLERANCE) continue
      const better = best === null ||
        (canonical !== best.canonical ? canonical :
          rank !== best.rank ? rank < best.rank :
            error < best.error)
      if (better) best = { bpm: candidate, error, rank, canonical }
    }
  }
  return best?.bpm ?? null
}

const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

function profileScore(chroma: Float64Array, profile: number[], root: number): number {
  let score = 0
  for (let i = 0; i < 12; i++) score += chroma[(i + root) % 12] * profile[i]
  return score
}

interface DetectedMusicalKey {
  key: string
  /** best/second profile-score ratio; barely above 1 means a near-tie. */
  margin: number
}

/**
 * Krumhansl-profile key estimate with its confidence margin. The margin is the
 * ratio between the best and second-best key scores; consumers gate on it
 * because a near-tie reading is usually detection noise, not a real key.
 */
function detectMusicalKeyDetailed(
  samples: Float32Array,
  sampleRate: number
): DetectedMusicalKey | null {
  if (samples.length < sampleRate / 2) return null
  const fftSize = 4096
  const availableFrames = Math.max(1, Math.floor((samples.length - fftSize) / fftSize) + 1)
  const frameStep = Math.max(1, Math.ceil(availableFrames / 96))
  const chroma = new Float64Array(12)
  let tonalEnergy = 0
  for (let frame = 0; frame < availableFrames; frame += frameStep) {
    const mags = fftMagnitudes(samples, frame * fftSize, fftSize)
    for (let bin = 1; bin < mags.length; bin++) {
      const frequency = bin * sampleRate / fftSize
      if (frequency < 55 || frequency > 5000) continue
      const midi = Math.round(69 + 12 * Math.log2(frequency / 440))
      const pitchClass = ((midi % 12) + 12) % 12
      if (mags[bin] < mags[bin - 1] || mags[bin] < (mags[bin + 1] ?? 0)) continue
      const value = Math.sqrt(mags[bin]) * (frequency < 300 ? 2 : 1)
      chroma[pitchClass] += value
      tonalEnergy += value
    }
  }
  if (tonalEnergy < 1e-3) return null
  let bestScore = -Infinity
  let secondScore = -Infinity
  let bestKey = ''
  for (let root = 0; root < 12; root++) {
    for (const [minor, profile] of [[false, MAJOR_PROFILE], [true, MINOR_PROFILE]] as const) {
      const score = profileScore(chroma, profile, root)
      if (score > bestScore) {
        secondScore = bestScore
        bestScore = score
        bestKey = `${NOTE_NAMES[root]}${minor ? 'm' : ''}`
      } else if (score > secondScore) secondScore = score
    }
  }
  if (bestScore <= 0) return null
  return { key: bestKey, margin: bestScore / Math.max(secondScore, 1e-9) }
}

// Minimum best/second score ratio for a key reading to be trusted. Measured on
// a known single-key (A minor) library: wrong-key detections are almost always
// near-ties (166 of 194 under 1.02, all under 1.08), while most correct
// readings clear this bar. Below it the reading is reported as unknown, which
// downstream consumers treat as compatible-but-unranked instead of hard
// rejecting a mislabeled sample.
const KEY_CONFIDENCE_MARGIN = 1.02

export function detectMusicalKey(samples: Float32Array, sampleRate: number): string | null {
  const detected = detectMusicalKeyDetailed(samples, sampleRate)
  return detected !== null && detected.margin > KEY_CONFIDENCE_MARGIN ? detected.key : null
}

export function classifySample(
  features: AudioFeatures,
  duration: number,
  bpm: number | null
): SampleType {
  const {
    rms,
    spectralCentroid: centroid,
    zeroCrossingRate: zcr,
    transientRatio: transient
  } = features
  if (rms < 0.003) return 'Other'
  // A file whose length is a whole number of bars at its tempo is loop-shaped:
  // it was trimmed to tile, so it must never be treated as a drum one-shot even
  // when it is short (a 1-bar loop at 140 BPM lasts only 1.7 s).
  const bars = bpm !== null && bpm > 0 ? duration * bpm / 240 : 0
  const barLoop = bars >= 0.95 && Math.abs(bars - Math.round(bars)) <= 0.06
  if (!barLoop || duration < 1.2) {
    if (duration <= 1.0 && rms >= 0.05 && transient >= 6 && centroid < 350) return 'Kick'
    // A hi-hat is a noise burst: bright AND noisy. A bright tonal stab has a
    // high centroid but a near-zero crossing rate and must not land here.
    if (duration <= 1.0 && transient >= 4 && centroid > 3000 && zcr > 0.12) return 'Hi-hat'
    if (duration <= 1.2 && transient >= 4 && centroid >= 700 && zcr >= 0.03) return 'Snare'
    if (duration <= 1.0 && transient >= 2.5 && !(centroid > 2000 && zcr < 0.02)) return 'Percussion'
  }
  // Sustained low-motion beds stay atmospheric even when they are bar-trimmed.
  if (duration >= 6 && rms < 0.25 && centroid < 1800 && transient < 4) return 'Atmosphere'
  if (barLoop && duration >= 1.5) {
    if (centroid < 550 && zcr < 0.12) return 'Bass'
    return 'Loop'
  }
  if (centroid < 550 && zcr < 0.12) return 'Bass'
  if (duration >= 3 && zcr > 0.1 && centroid > 1200 && centroid < 4000) return 'Vocal'
  if (duration >= 5 && (centroid > 4000 || zcr > 0.25)) return 'FX'
  if (centroid > 0 && centroid < 5000) return 'Synth'
  return 'Other'
}

export function analyzeDecodedAudio(decoded: DecodedPcm): SampleAnalysisResult {
  const { features, durationSeconds } = extractDecodedAudioFeatures(decoded)
  const bpm = detectBpm(decoded.samples, decoded.sampleRate)
  const musicalKey = detectMusicalKey(decoded.samples, decoded.sampleRate)
  return {
    bpm,
    musicalKey,
    sampleType: classifySample(features, durationSeconds, bpm),
    features,
    durationSeconds
  }
}

export function extractDecodedAudioFeatures(decoded: DecodedPcm): {
  features: AudioFeatures
  durationSeconds: number
} {
  return {
    features: extractFeatures(decoded.samples, decoded.sampleRate),
    durationSeconds: decoded.samples.length / decoded.sampleRate
  }
}

export function analyzeWav(buffer: ArrayBuffer): SampleAnalysisResult | null {
  const decoded = decodeWav(buffer)
  return decoded ? analyzeDecodedAudio(decoded) : null
}
