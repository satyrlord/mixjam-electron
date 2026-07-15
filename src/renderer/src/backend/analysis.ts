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

export interface BatchAnalysisCalibration {
  bpm: number | null
  musicalKey: string | null
}

export interface CalibratedAnalysisBatch {
  results: SampleAnalysisResult[]
  calibration: BatchAnalysisCalibration
}

const SAMPLE_TYPES = new Set<SampleType>(SAMPLE_TYPE_VALUES)
const MIN_CALIBRATION_BATCH_SIZE = 16
const MIN_UNIFORM_TEMPO_BPM = 80
const MAX_UNIFORM_TEMPO_BPM = 180
const TEMPO_ALIAS_MULTIPLIERS = [0.75, 1, 1.5, 2] as const
const TEMPO_COMPATIBILITY_TOLERANCE = 0.02
const MIN_ACOUSTIC_TEMPO_DETECTIONS = 16
const MIN_ACOUSTIC_TEMPO_SUPPORT = 0.55

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
  // Long loop files are commonly trimmed to 4, 8, 16, 32, or 64 beats. If
  // the consecutive-onset estimate landed on fast subdivisions, use that
  // duration grid to select its nearest beat-level candidate.
  if (duration >= 3.5 && onsetBpm !== null && onsetBpm > 160) {
    const durationCandidates = [4, 8, 16, 32, 64]
      .map((beats) => beats * 60 / duration)
      .filter((candidate) => candidate >= 60 && candidate <= 200)
      .sort((a, b) => Math.abs(a - onsetBpm) - Math.abs(b - onsetBpm))
    const candidate = durationCandidates[0]
    if (candidate !== undefined && Math.abs(candidate - onsetBpm) / onsetBpm <= 0.35) bpm = candidate
  }
  return Math.round(bpm * 10) / 10
}

const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

function profileScore(chroma: Float64Array, profile: number[], root: number): number {
  let score = 0
  for (let i = 0; i < 12; i++) score += chroma[(i + root) % 12] * profile[i]
  return score
}

export function detectMusicalKey(samples: Float32Array, sampleRate: number): string | null {
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
  return bestScore > 0 && bestScore > secondScore * 1.005 ? bestKey : null
}

function isTempoCandidateCompatible(candidate: number, detectedBpm: number): boolean {
  return TEMPO_ALIAS_MULTIPLIERS.some(
    (multiplier) => Math.abs(detectedBpm * multiplier - candidate) / candidate
      <= TEMPO_COMPATIBILITY_TOLERANCE
  )
}

function detectUniformBatchTempo(results: readonly SampleAnalysisResult[]): number | null {
  if (results.length < MIN_CALIBRATION_BATCH_SIZE) return null
  const votes = new Map<number, number>()
  for (const result of results) {
    const duration = result.durationSeconds
    if (!Number.isFinite(duration) || duration <= 0) continue
    const firstBeatCount = Math.max(1, Math.ceil(duration * MIN_UNIFORM_TEMPO_BPM / 60))
    const lastBeatCount = Math.floor(duration * MAX_UNIFORM_TEMPO_BPM / 60)
    const fileBins = new Set<number>()
    for (let beatCount = firstBeatCount; beatCount <= lastBeatCount; beatCount++) {
      const candidate = beatCount * 60 / duration
      fileBins.add(Math.round(candidate * 2))
    }
    for (const bin of fileBins) votes.set(bin, (votes.get(bin) ?? 0) + 1)
  }

  const ranked = [...votes.entries()].sort((left, right) => right[1] - left[1])
  const [bestBin, bestVotes] = ranked[0] ?? [0, 0]
  const secondVotes = ranked[1]?.[1] ?? 0
  if (bestVotes / results.length < 0.9) return null
  if (secondVotes > 0 && bestVotes / secondVotes < 1.05) return null
  const candidate = bestBin / 2
  const detectedBpms = results
    .map(({ bpm }) => bpm)
    .filter((bpm): bpm is number => bpm !== null && Number.isFinite(bpm) && bpm > 0)
  if (detectedBpms.length < MIN_ACOUSTIC_TEMPO_DETECTIONS) return null
  const compatibleDetections = detectedBpms.filter(
    (bpm) => isTempoCandidateCompatible(candidate, bpm)
  ).length
  if (compatibleDetections / detectedBpms.length < MIN_ACOUSTIC_TEMPO_SUPPORT) return null
  return candidate
}

function detectUniformBatchKey(
  results: readonly SampleAnalysisResult[],
  uniformTempo: number | null
): string | null {
  if (uniformTempo === null || results.length < MIN_CALIBRATION_BATCH_SIZE) return null
  const votes = new Map<string, number>()
  for (const { musicalKey } of results) {
    if (musicalKey !== null) votes.set(musicalKey, (votes.get(musicalKey) ?? 0) + 1)
  }
  const ranked = [...votes.entries()].sort((left, right) => right[1] - left[1])
  const [bestKey, bestVotes] = ranked[0] ?? ['', 0]
  const detected = ranked.reduce((sum, [, count]) => sum + count, 0)
  const secondVotes = ranked[1]?.[1] ?? 0
  if (detected < MIN_CALIBRATION_BATCH_SIZE) return null
  if (bestVotes / detected < 0.55) return null
  if (secondVotes > 0 && bestVotes / secondVotes < 2) return null
  return bestKey
}

/** Reconciles per-file aliases when duration and acoustic evidence prove a
 * uniform-tempo batch with one dominant key. A passing calibration replaces
 * automatic batch results; provenance-aware persistence protects manual data. */
export function calibrateConfirmedUniformBatch(
  results: readonly SampleAnalysisResult[]
): CalibratedAnalysisBatch {
  const bpm = detectUniformBatchTempo(results)
  const musicalKey = detectUniformBatchKey(results, bpm)
  if (bpm === null && musicalKey === null) {
    return { results: [...results], calibration: { bpm, musicalKey } }
  }
  return {
    results: results.map((result) => ({
      ...result,
      bpm: bpm ?? result.bpm,
      musicalKey: musicalKey ?? result.musicalKey
    })),
    calibration: { bpm, musicalKey }
  }
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
  if (duration >= 3.5 && bpm !== null) return 'Loop'
  if (duration >= 8 && rms < 0.25 && centroid < 1800 && transient < 8) return 'Atmosphere'
  if (duration <= 1.5 && rms >= 0.05 && transient >= 6 && centroid < 350) return 'Kick'
  if (duration <= 1.5 && transient >= 4 && (centroid > 3500 || zcr > 0.18)) return 'Hi-hat'
  if (duration <= 2 && transient >= 4 && centroid >= 700) return 'Snare'
  if (duration <= 2.5 && transient >= 2.5) return 'Percussion'
  if (centroid < 550 && zcr < 0.12) return 'Bass'
  if (duration >= 3 && zcr > 0.1 && centroid > 1200 && centroid < 4000) return 'Vocal'
  if (duration >= 5 && (centroid > 4000 || zcr > 0.25)) return 'FX'
  if (centroid > 0 && centroid < 5000) return 'Synth'
  return 'Other'
}

export function analyzeDecodedAudio(decoded: DecodedPcm): SampleAnalysisResult {
  const features = extractFeatures(decoded.samples, decoded.sampleRate)
  const bpm = detectBpm(decoded.samples, decoded.sampleRate)
  const musicalKey = detectMusicalKey(decoded.samples, decoded.sampleRate)
  const durationSeconds = decoded.samples.length / decoded.sampleRate
  return {
    bpm,
    musicalKey,
    sampleType: classifySample(features, durationSeconds, bpm),
    features,
    durationSeconds
  }
}

export function analyzeWav(buffer: ArrayBuffer): SampleAnalysisResult | null {
  const decoded = decodeWav(buffer)
  return decoded ? analyzeDecodedAudio(decoded) : null
}
