import { randomBytes } from 'node:crypto'
import {
  mkdir,
  open,
  readFile,
  readdir,
  unlink
} from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseFile } from 'music-metadata'
import {
  createDefaultLanes,
  placeSampleOnLane,
  placementDurationTicks,
  type LaneState
} from '../src/renderer/src/lib/arrangement'
import { categorySlot } from '../src/renderer/src/lib/sample-utils'
import {
  parseProject,
  serializeProject,
  type ProjectData,
  type ProjectDocument
} from '../src/renderer/src/project/project-file'
import {
  applyEffectPreset,
  createDefaultEffect,
  type EffectSlot,
  type EffectType
} from '../src/renderer/src/engine/effects'
import { TICKS_PER_BAR, tickDurationSeconds } from '../src/renderer/src/engine/transport'
import type { ChannelState } from '../src/renderer/src/hooks/useMixer'

export const SONG_BPM = 140
export const TOTAL_BARS = 70
export const TOTAL_TICKS = TOTAL_BARS * TICKS_PER_BAR
export const SONG_DURATION_SECONDS = TOTAL_TICKS * tickDurationSeconds(SONG_BPM)

export const SONG_SECTIONS = [
  { name: 'sunset DJ intro', startBar: 0, endBar: 8 },
  { name: 'tropical groove', startBar: 8, endBar: 20 },
  { name: 'melodic ascent', startBar: 20, endBar: 30 },
  { name: 'ocean-air breakdown', startBar: 30, endBar: 40 },
  { name: 'terrace buildup', startBar: 40, endBar: 50 },
  { name: 'Ibiza peak', startBar: 50, endBar: 62 },
  { name: 'sunrise mix-out', startBar: 62, endBar: 70 }
] as const

export const REQUIRED_CATEGORIES = [
  'Bass',
  'Drum',
  'Effect',
  'Keys',
  'Layer',
  'Loop',
  'Rap',
  'Seq',
  'Sphere',
  'Voice',
  'Xtra'
] as const

const OUTPUT_BASENAME = 'Ibiza-Melodic-Techno-Mixer-Test'
const DEFAULT_SAMPLES_DIR = 'tmp/test-samples'
const DEFAULT_OUTPUT_DIR = 'tmp/generated-songs'
const MIN_SAMPLE_BPM = 20
const MAX_SAMPLE_BPM = 400

const LANE_NAMES = [
  'Kick Phrases',
  'Clap / Snare',
  'Hi-Hat / Percussion',
  'Groove Loops',
  'Bass',
  'Sequences',
  'Keys',
  'Layer L',
  'Layer R',
  'Sphere L',
  'Sphere R',
  'Voice',
  'Rap',
  'Extra Texture',
  'Transition FX L',
  'Transition FX R'
] as const

const SINGLE_SAMPLE_ROLE_DEFINITIONS = [
  { key: 'kickPrimary', name: 'primary kick phrase', category: 'Drum', pattern: /kick/i, maxDurationBars: 2 },
  { key: 'kickAlternate', name: 'alternate kick phrase', category: 'Drum', pattern: /kick/i, maxDurationBars: 2 },
  { key: 'clap', name: 'clap phrase', category: 'Drum', pattern: /clap/i, maxDurationBars: 2 },
  { key: 'snare', name: 'snare phrase', category: 'Drum', pattern: /snare/i, maxDurationBars: 2 },
  { key: 'percussionPrimary', name: 'primary percussion phrase', category: 'Drum', pattern: /hihat|perc|shak|conga|bongo|tamb|cow|stick|rim/i, maxDurationBars: 2 },
  { key: 'percussionAlternate', name: 'alternate percussion phrase', category: 'Drum', pattern: /hihat|perc|shak|conga|bongo|tamb|cow|stick|rim/i, maxDurationBars: 2 },
  { key: 'groovePrimary', name: 'primary groove loop', category: 'Loop', pattern: /.*/, stylePattern: /beach|afrika|africa|tribal|latin|tropic|island|samba|bongo|conga/i, maxDurationBars: 4 },
  { key: 'grooveAlternate', name: 'alternate groove loop', category: 'Loop', pattern: /.*/, stylePattern: /beach|afrika|africa|tribal|latin|tropic|island|samba|bongo|conga/i, maxDurationBars: 4 },
  { key: 'bassPrimary', name: 'primary bass phrase', category: 'Bass', pattern: /.*/, stylePattern: /warm|deep|sub|swing|sun|summer|tropic|island|beach/i, maxDurationBars: 4 },
  { key: 'bassAlternate', name: 'alternate bass phrase', category: 'Bass', pattern: /.*/, stylePattern: /warm|deep|sub|swing|sun|summer|tropic|island|beach/i, maxDurationBars: 4 },
  { key: 'sequencePrimary', name: 'primary sequence', category: 'Seq', pattern: /.*/, stylePattern: /sun|summer|beach|tequila|thai|andorra|island|tropic|bali|sea|ocean|water|(?:^|[-_])air(?:[-_.]|$)/i, maxDurationBars: 4 },
  { key: 'sequenceAlternate', name: 'alternate sequence', category: 'Seq', pattern: /.*/, stylePattern: /sun|summer|beach|tequila|thai|andorra|island|tropic|bali|sea|ocean|water|(?:^|[-_])air(?:[-_.]|$)/i, maxDurationBars: 4 },
  { key: 'keysPrimary', name: 'primary keys phrase', category: 'Keys', pattern: /.*/, stylePattern: /sun|water|cielo|chiquita|chico|chica|casa|gracias|fuego|iglesias|madre|santiago|tango|toro|verde|tribal|orient|melodica/i, maxDurationBars: 4 },
  { key: 'keysAlternate', name: 'alternate keys phrase', category: 'Keys', pattern: /.*/, stylePattern: /sun|water|cielo|chiquita|chico|chica|casa|gracias|fuego|iglesias|madre|santiago|tango|toro|verde|tribal|orient|melodica/i, maxDurationBars: 4 },
  { key: 'voicePrimary', name: 'primary voice motif', category: 'Voice', pattern: /.*/, stylePattern: /a-ha|yeyea|a-ouh|batida|clear-space|alright|feel|love|summer|sun|beach/i, maxDurationBars: 4 },
  { key: 'voiceAlternate', name: 'alternate voice motif', category: 'Voice', pattern: /.*/, stylePattern: /a-ha|yeyea|a-ouh|batida|clear-space|alright|feel|love|summer|sun|beach/i, maxDurationBars: 4 },
  { key: 'rapPrimary', name: 'primary rap motif', category: 'Rap', pattern: /.*/, stylePattern: /feel|dance|body|free|love|nice|sky|spark|sun|summer|beach|sea/i, maxDurationBars: 4 },
  { key: 'rapAlternate', name: 'alternate rap motif', category: 'Rap', pattern: /.*/, stylePattern: /feel|dance|body|free|love|nice|sky|spark|sun|summer|beach|sea/i, maxDurationBars: 4 },
  { key: 'extraPrimary', name: 'primary extra texture', category: 'Xtra', pattern: /.*/, stylePattern: /air|sun|summer|sea|ocean|beach|tropic|island|warm|wind|water/i, maxDurationBars: 4 },
  { key: 'extraAlternate', name: 'alternate extra texture', category: 'Xtra', pattern: /.*/, stylePattern: /air|sun|summer|sea|ocean|beach|tropic|island|warm|wind|water/i, maxDurationBars: 4 }
] as const

const STEREO_SAMPLE_ROLE_DEFINITIONS = [
  {
    leftKey: 'layerLeft',
    rightKey: 'layerRight',
    name: 'stereo layer',
    category: 'Layer',
    pattern: /.*/,
    stylePattern: /sun|summer|sea|ocean|water|beach|air|dream/i,
    maxDurationBars: 4
  },
  {
    leftKey: 'sphereLeft',
    rightKey: 'sphereRight',
    name: 'stereo sphere',
    category: 'Sphere',
    pattern: /.*/,
    stylePattern: /dream|amor|warm|sun|sea|ocean|water|air/i,
    maxDurationBars: 10
  },
  {
    leftKey: 'transitionLeft',
    rightKey: 'transitionRight',
    name: 'stereo transition effect',
    category: 'Effect',
    pattern: /rise|sweep|swish|crash|uplift|transition|impact|noise|wind|reverse|roll/i,
    stylePattern: /wind|wave|sea|ocean|air|sweep|swish/i,
    maxDurationBars: 4
  }
] as const

const ARRANGEMENT_VARIATIONS = [
  {
    name: 'sunset call and response',
    grooveReturnBar: 42,
    voiceBars: [14, 24, 34, 52, 64],
    rapBars: [18, 28, 44, 58, 68],
    textureRegions: [[4, 8], [16, 20], [30, 34], [40, 44], [54, 58], [64, 70]]
  },
  {
    name: 'late terrace lift',
    grooveReturnBar: 46,
    voiceBars: [12, 26, 36, 54, 66],
    rapBars: [18, 28, 46, 60, 68],
    textureRegions: [[6, 12], [20, 24], [34, 40], [44, 50], [58, 62], [66, 70]]
  },
  {
    name: 'ocean-air dialogue',
    grooveReturnBar: 42,
    voiceBars: [16, 32, 38, 56, 66],
    rapBars: [12, 28, 46, 60, 68],
    textureRegions: [[6, 10], [22, 30], [32, 38], [42, 46], [56, 62], [66, 70]]
  },
  {
    name: 'Ibiza peak answers',
    grooveReturnBar: 46,
    voiceBars: [10, 26, 36, 58, 64],
    rapBars: [18, 28, 44, 54, 68],
    textureRegions: [[4, 12], [24, 30], [34, 40], [46, 50], [56, 62], [64, 70]]
  }
] as const

type SingleSampleRole = typeof SINGLE_SAMPLE_ROLE_DEFINITIONS[number]
type StereoSampleRole = typeof STEREO_SAMPLE_ROLE_DEFINITIONS[number]
export type SampleRoleKey =
  | SingleSampleRole['key']
  | StereoSampleRole['leftKey']
  | StereoSampleRole['rightKey']

interface DiscoveredSample {
  absolutePath: string
  sampleRef: string
  sampleName: string
  category: string
}

interface StereoPair {
  baseName: string
  left: DiscoveredSample
  right: DiscoveredSample
}

export interface SelectedSample extends DiscoveredSample {
  durationSeconds: number
  durationTicks: number
  nativeBPM: number | null
}

export type SelectedSamples = Record<SampleRoleKey, SelectedSample>

export interface GeneratorOptions {
  samplesDir?: string
  outputDir?: string
  seed?: string
}

export interface GeneratorResult {
  filePath: string
  fileName: string
  seed: string
  variation: number
  variationName: string
  durationSeconds: number
  selectedSamples: SelectedSamples
  project: ProjectDocument
}

interface CliOptions extends GeneratorOptions {
  help: boolean
}

const HELP_TEXT = `Generate a two-minute Ibiza-inspired melodic-techno project for Mixer and FX testing.

Usage:
  npm run generate:mixer-test-song -- [options]

Options:
  --samples-dir <path>  Sample Folder to read (default: ${DEFAULT_SAMPLES_DIR})
  --output-dir <path>   Directory for .mixjam files (default: ${DEFAULT_OUTPUT_DIR})
  --seed <value>        Reproduce sample selection and arrangement
  --help                Show this help
`

function hashSeed(seed: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function variationForSeed(seed: string): number {
  return (hashSeed(seed) % ARRANGEMENT_VARIATIONS.length) + 1
}

function normalizedRelativePath(root: string, absolutePath: string): string {
  return relative(root, absolutePath).split(sep).join('/')
}

async function discoverWavFiles(samplesDir: string): Promise<DiscoveredSample[]> {
  const discovered: DiscoveredSample[] = []

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const absolutePath = resolve(directory, entry.name)
      if (entry.isDirectory()) {
        await visit(absolutePath)
        continue
      }
      if (!entry.isFile() || !/\.wav$/i.test(entry.name)) continue
      const sampleRef = normalizedRelativePath(samplesDir, absolutePath)
      const slashIndex = sampleRef.indexOf('/')
      discovered.push({
        absolutePath,
        sampleRef,
        sampleName: entry.name,
        category: slashIndex === -1 ? 'Unsorted' : sampleRef.slice(0, slashIndex)
      })
    }
  }

  await visit(samplesDir)
  return discovered
}

function stereoSide(sampleName: string): { baseName: string; side: 'left' | 'right' } | null {
  const match = /^(.*?)(?:-|\()?([lr])\)?\.wav$/i.exec(sampleName)
  if (!match?.[1] || !match[2]) return null
  return {
    baseName: match[1].replace(/[-_(]+$/, ''),
    side: match[2].toLowerCase() === 'l' ? 'left' : 'right'
  }
}

function discoverStereoPairs(inventory: readonly DiscoveredSample[]): StereoPair[] {
  const partialPairs = new Map<string, Partial<StereoPair>>()
  for (const sample of inventory) {
    const descriptor = stereoSide(sample.sampleName)
    if (!descriptor) continue
    const pairKey = `${sample.category}/${descriptor.baseName.toLowerCase()}`
    const pair = partialPairs.get(pairKey) ?? { baseName: descriptor.baseName }
    pair[descriptor.side] = sample
    partialPairs.set(pairKey, pair)
  }
  return [...partialPairs.values()].filter((pair): pair is StereoPair =>
    pair.baseName !== undefined && pair.left !== undefined && pair.right !== undefined
  )
}

function seededOrder<T>(
  candidates: readonly T[],
  seed: string,
  roleKey: string,
  identity: (candidate: T) => string
): T[] {
  return [...candidates].sort((left, right) => {
    const leftIdentity = identity(left)
    const rightIdentity = identity(right)
    const scoreDifference = hashSeed(`${seed}:${roleKey}:${leftIdentity}`) -
      hashSeed(`${seed}:${roleKey}:${rightIdentity}`)
    return scoreDifference || leftIdentity.localeCompare(rightIdentity)
  })
}

function isPlausibleSampleBpm(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= MIN_SAMPLE_BPM && value <= MAX_SAMPLE_BPM
}

export function bpmFromMetadataOrName(metadataBpm: number | undefined, sampleName: string): number | null {
  if (isPlausibleSampleBpm(metadataBpm)) {
    return metadataBpm
  }
  const match = sampleName.match(/(?:\b(\d{1,3})\s*BPM\b|\bBPM\s*(\d{1,3})\b)/i)
  const filenameBpm = match ? Number(match[1] ?? match[2]) : undefined
  return isPlausibleSampleBpm(filenameBpm) ? filenameBpm : null
}

async function selectSamples(
  samplesDir: string,
  seed: string
): Promise<{ variation: number; samples: SelectedSamples }> {
  const inventory = await discoverWavFiles(samplesDir)
  const variation = variationForSeed(seed)
  const stereoPairs = discoverStereoPairs(inventory)
  const pairedSampleRefs = new Set(stereoPairs.flatMap((pair) => [pair.left.sampleRef, pair.right.sampleRef]))
  const usedSampleRefs = new Set<string>()
  const entries: Array<readonly [SampleRoleKey, SelectedSample]> = []

  const readSelectedSample = async (candidate: DiscoveredSample): Promise<SelectedSample> => {
    const metadata = await parseFile(candidate.absolutePath)
    const durationSeconds = metadata.format.duration
    if (durationSeconds === undefined || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new Error(`Could not read a positive WAV duration for ${candidate.sampleRef}.`)
    }
    const nativeBPM = bpmFromMetadataOrName(metadata.common.bpm, candidate.sampleName)
    return {
      ...candidate,
      durationSeconds,
      durationTicks: placementDurationTicks(durationSeconds, nativeBPM ?? SONG_BPM),
      nativeBPM
    }
  }

  for (const role of SINGLE_SAMPLE_ROLE_DEFINITIONS) {
    const eligibleCandidates = inventory.filter((sample) =>
      sample.category === role.category &&
      role.pattern.test(sample.sampleName) &&
      !pairedSampleRefs.has(sample.sampleRef) &&
      !usedSampleRefs.has(sample.sampleRef)
    )
    const preferredCandidates = 'stylePattern' in role
      ? eligibleCandidates.filter((sample) => role.stylePattern.test(sample.sampleName))
      : []
    const candidates = preferredCandidates.length > 0 ? preferredCandidates : eligibleCandidates
    const orderedCandidates = seededOrder(candidates, seed, role.key, (sample) => sample.sampleRef)
    let selected: SelectedSample | undefined
    for (const candidate of orderedCandidates) {
      try {
        const inspected = await readSelectedSample(candidate)
        if (inspected.durationTicks <= role.maxDurationBars * TICKS_PER_BAR) {
          selected = inspected
          break
        }
      } catch {
        // Keep trying the seeded candidate order so one unreadable fixture does not block generation.
      }
    }
    if (!selected) {
      throw new Error(
        `No readable ${role.name} WAV of at most ${role.maxDurationBars} bars found in ${role.category}.`
      )
    }
    usedSampleRefs.add(selected.sampleRef)
    entries.push([role.key, selected])
  }

  for (const role of STEREO_SAMPLE_ROLE_DEFINITIONS) {
    const eligibleCandidates = stereoPairs.filter((pair) =>
      pair.left.category === role.category &&
      role.pattern.test(pair.baseName) &&
      !usedSampleRefs.has(pair.left.sampleRef) &&
      !usedSampleRefs.has(pair.right.sampleRef)
    )
    const preferredCandidates = eligibleCandidates.filter((pair) => role.stylePattern.test(pair.baseName))
    const candidates = preferredCandidates.length > 0 ? preferredCandidates : eligibleCandidates
    const orderedCandidates = seededOrder(candidates, seed, role.leftKey, (pair) => pair.baseName)
    let selectedPair: readonly [SelectedSample, SelectedSample] | undefined
    for (const pair of orderedCandidates) {
      try {
        const [left, right] = await Promise.all([
          readSelectedSample(pair.left),
          readSelectedSample(pair.right)
        ])
        const maxDurationTicks = role.maxDurationBars * TICKS_PER_BAR
        if (
          left.durationTicks <= maxDurationTicks &&
          right.durationTicks <= maxDurationTicks &&
          left.durationTicks === right.durationTicks
        ) {
          selectedPair = [left, right]
          break
        }
      } catch {
        // A later complete pair may still be suitable.
      }
    }
    if (!selectedPair) {
      throw new Error(
        `No readable, duration-matched ${role.name} WAV pair of at most ` +
        `${role.maxDurationBars} bars found in ${role.category}.`
      )
    }
    const [left, right] = selectedPair
    usedSampleRefs.add(left.sampleRef)
    usedSampleRefs.add(right.sampleRef)
    entries.push([role.leftKey, left], [role.rightKey, right])
  }

  return {
    variation,
    samples: Object.fromEntries(entries) as SelectedSamples
  }
}

function createEffect(
  id: string,
  type: EffectType,
  presetName: string
): EffectSlot {
  return { ...applyEffectPreset(createDefaultEffect(type), presetName), id }
}

function createMixerChannels(): ChannelState[] {
  const gains = [0.78, 0.58, 0.46, 0.52, 0.68, 0.44, 0.5, 0.36, 0.36, 0.34, 0.34, 0.52, 0.48, 0.34, 0.5, 0.5]
  const pans = [0, 0.04, -0.16, 0.1, 0, -0.2, 0.18, -0.72, 0.72, -0.58, 0.58, -0.08, 0.14, -0.28, -0.82, 0.82]
  const effects = new Map<number, EffectSlot[]>([
    [0, [createEffect('fx-mixer-test-01-compressor', 'compressor', 'Gentle Glue')]],
    [3, [createEffect('fx-mixer-test-04-compressor', 'compressor', 'Classic Control')]],
    [4, [createEffect('fx-mixer-test-05-compressor', 'compressor', 'Leveler')]],
    [5, [createEffect('fx-mixer-test-06-delay', 'delay', 'Classic Echo')]],
    [6, [createEffect('fx-mixer-test-07-delay', 'delay', 'Ping-Pong Eighths'), createEffect('fx-mixer-test-07-reverb', 'reverb', 'Studio Room')]],
    [7, [createEffect('fx-mixer-test-08-reverb', 'reverb', 'Long Hall')]],
    [8, [createEffect('fx-mixer-test-09-reverb', 'reverb', 'Long Hall')]],
    [9, [createEffect('fx-mixer-test-10-reverb', 'reverb', 'Long Hall')]],
    [10, [createEffect('fx-mixer-test-11-reverb', 'reverb', 'Long Hall')]],
    [11, [createEffect('fx-mixer-test-12-delay', 'delay', 'Classic Echo'), createEffect('fx-mixer-test-12-compressor', 'compressor', 'Gentle Glue')]],
    [12, [createEffect('fx-mixer-test-13-delay', 'delay', 'Slapback')]],
    [14, [createEffect('fx-mixer-test-15-reverb', 'reverb', 'Long Hall')]],
    [15, [createEffect('fx-mixer-test-16-reverb', 'reverb', 'Long Hall')]]
  ])

  return gains.map((gain, channelIndex) => ({
    channelIndex,
    gain,
    pan: pans[channelIndex]!,
    muted: false,
    solo: false,
    effects: effects.get(channelIndex) ?? []
  }))
}

function buildArrangement(samples: SelectedSamples, variationNumber: number): LaneState[] {
  const variation = ARRANGEMENT_VARIATIONS[variationNumber - 1]!
  const lanePans = [0, 0.04, -0.12, 0.08, 0, -0.16, 0.14, -0.62, 0.62, -0.5, 0.5, -0.06, 0.12, -0.22, -0.7, 0.7]
  let lanes: LaneState[] = createDefaultLanes().map((lane, index) => ({
    ...lane,
    name: LANE_NAMES[index]!,
    pan: lanePans[index]!
  }))

  const place = (laneIndex: number, sample: SelectedSample, startTick: number): void => {
    if (startTick < 0 || startTick + sample.durationTicks > TOTAL_TICKS) return
    lanes = placeSampleOnLane(
      lanes,
      laneIndex,
      sample.sampleRef,
      sample.sampleName,
      startTick,
      sample.durationTicks,
      sample.durationSeconds,
      categorySlot(sample.category),
      sample.nativeBPM
    )
  }

  const tileBars = (
    laneIndex: number,
    sample: SelectedSample,
    startBar: number,
    endBar: number
  ): void => {
    const endTick = endBar * TICKS_PER_BAR
    for (
      let tick = startBar * TICKS_PER_BAR;
      tick + sample.durationTicks <= endTick;
      tick += sample.durationTicks
    ) {
      place(laneIndex, sample, tick)
    }
  }

  const tileAlternatingRegions = (
    laneIndex: number,
    primary: SelectedSample,
    alternate: SelectedSample,
    regions: readonly (readonly [number, number])[]
  ): void => {
    const phase = variationNumber % 2
    regions.forEach(([startBar, endBar], index) => {
      tileBars(laneIndex, (index + phase) % 2 === 0 ? primary : alternate, startBar, endBar)
    })
  }

  const placeAlternatingBars = (
    laneIndex: number,
    primary: SelectedSample,
    alternate: SelectedSample,
    bars: readonly number[]
  ): void => {
    const phase = variationNumber % 2
    bars.forEach((bar, index) => {
      place(laneIndex, (index + phase) % 2 === 0 ? primary : alternate, bar * TICKS_PER_BAR)
    })
  }

  tileAlternatingRegions(0, samples.kickPrimary, samples.kickAlternate, [
    [0, 8], [8, 20], [20, 30], [46, 50], [50, 62], [62, 70]
  ])
  tileAlternatingRegions(1, samples.clap, samples.snare, [
    [4, 20], [20, 30], [46, 50], [50, 62], [62, 68]
  ])
  tileAlternatingRegions(2, samples.percussionPrimary, samples.percussionAlternate, [
    [6, 20], [20, 30], [44, 50], [50, 62], [62, 66]
  ])
  tileAlternatingRegions(3, samples.groovePrimary, samples.grooveAlternate, [
    [4, 20],
    [20, 30],
    [variation.grooveReturnBar, 50],
    [50, 62],
    [62, 70]
  ])
  tileAlternatingRegions(4, samples.bassPrimary, samples.bassAlternate, [
    [8, 20], [20, 30], [46, 50], [50, 62], [62, 70]
  ])
  tileAlternatingRegions(5, samples.sequencePrimary, samples.sequenceAlternate, [
    [12, 20], [20, 30], [30, 40], [40, 50], [50, 62], [62, 66]
  ])
  tileAlternatingRegions(6, samples.keysPrimary, samples.keysAlternate, [
    [16, 20], [20, 30], [30, 40], [44, 50], [50, 62]
  ])

  for (const [startBar, endBar] of [[0, 8], [20, 40], [50, 62], [62, 70]] as const) {
    tileBars(7, samples.layerLeft, startBar, endBar)
    tileBars(8, samples.layerRight, startBar, endBar)
  }
  for (const startBar of [8, 30, 50]) {
    place(9, samples.sphereLeft, startBar * TICKS_PER_BAR)
    place(10, samples.sphereRight, startBar * TICKS_PER_BAR)
  }

  placeAlternatingBars(11, samples.voicePrimary, samples.voiceAlternate, variation.voiceBars)
  placeAlternatingBars(12, samples.rapPrimary, samples.rapAlternate, variation.rapBars)
  tileAlternatingRegions(13, samples.extraPrimary, samples.extraAlternate, variation.textureRegions)

  for (const endBar of SONG_SECTIONS.map((section) => section.endBar)) {
    place(14, samples.transitionLeft, endBar * TICKS_PER_BAR - samples.transitionLeft.durationTicks)
    place(15, samples.transitionRight, endBar * TICKS_PER_BAR - samples.transitionRight.durationTicks)
  }

  const emptyLane = lanes.find((lane) => lane.placements.length === 0)
  if (emptyLane) throw new Error(`The ${emptyLane.name} lane has no placements.`)
  const placementEnds = lanes.flatMap((lane) => lane.placements.map(
    (placement) => placement.startTick + placement.durationTicks
  ))
  if (placementEnds.some((endTick) => endTick > TOTAL_TICKS)) {
    throw new Error(`The arrangement contains a placement after tick ${TOTAL_TICKS}.`)
  }
  if (Math.max(...placementEnds) !== TOTAL_TICKS) {
    throw new Error(`The arrangement must end exactly at tick ${TOTAL_TICKS}.`)
  }
  return lanes
}

async function packageAppVersion(): Promise<string> {
  const packagePath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'package.json')
  const packageData = JSON.parse(await readFile(packagePath, 'utf8')) as { version?: unknown }
  if (typeof packageData.version !== 'string' || packageData.version.length === 0) {
    throw new Error('package.json does not contain a version string.')
  }
  return `v${packageData.version}`
}

async function reserveNextOutput(contents: string, outputDir: string): Promise<string> {
  await mkdir(outputDir, { recursive: true })
  const outputPattern = new RegExp(`^${OUTPUT_BASENAME}-(\\d+)\\.mixjam$`)
  const existingNumbers = (await readdir(outputDir))
    .map((name) => outputPattern.exec(name)?.[1])
    .filter((value): value is string => value !== undefined)
    .map(Number)
  let sequence = Math.max(0, ...existingNumbers) + 1

  while (true) {
    const fileName = `${OUTPUT_BASENAME}-${String(sequence).padStart(3, '0')}.mixjam`
    const filePath = resolve(outputDir, fileName)
    let fileHandle
    try {
      fileHandle = await open(filePath, 'wx')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        sequence += 1
        continue
      }
      throw error
    }

    try {
      await fileHandle.writeFile(contents, 'utf8')
      await fileHandle.close()
      return filePath
    } catch (error) {
      await fileHandle.close().catch(() => undefined)
      await unlink(filePath).catch(() => undefined)
      throw error
    }
  }
}

export async function generateMixerTestSong(options: GeneratorOptions = {}): Promise<GeneratorResult> {
  const samplesDir = resolve(options.samplesDir ?? DEFAULT_SAMPLES_DIR)
  const outputDir = resolve(options.outputDir ?? DEFAULT_OUTPUT_DIR)
  const seed = options.seed ?? randomBytes(8).toString('hex')
  if (seed.length === 0) throw new Error('The seed must not be empty.')

  const { variation, samples } = await selectSamples(samplesDir, seed)
  const variationName = ARRANGEMENT_VARIATIONS[variation - 1]!.name
  const project: ProjectData = {
    song: { bpm: SONG_BPM, masterGain: 0.82 },
    lanes: buildArrangement(samples, variation),
    channels: createMixerChannels()
  }
  const timestamp = new Date().toISOString()
  const contents = serializeProject(project, {
    appVersion: await packageAppVersion(),
    createdAt: timestamp,
    modifiedAt: timestamp
  })
  const parsedProject = parseProject(contents)
  const filePath = await reserveNextOutput(contents, outputDir)

  return {
    filePath,
    fileName: filePath.split(/[\\/]/).pop()!,
    seed,
    variation,
    variationName,
    durationSeconds: SONG_DURATION_SECONDS,
    selectedSamples: samples,
    project: parsedProject
  }
}

function readOptionValue(args: readonly string[], index: number, flag: string): string {
  const value = args[index + 1]
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${flag} requires a value.`)
  }
  return value
}

export function parseCliArgs(args: readonly string[]): CliOptions {
  const options: CliOptions = { help: false }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!
    if (arg === '--help') {
      options.help = true
    } else if (arg === '--samples-dir') {
      options.samplesDir = readOptionValue(args, index, arg)
      index += 1
    } else if (arg === '--output-dir') {
      options.outputDir = readOptionValue(args, index, arg)
      index += 1
    } else if (arg === '--seed') {
      options.seed = readOptionValue(args, index, arg)
      index += 1
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }
  return options
}

function printSummary(result: GeneratorResult): void {
  const effectTypes = new Set(result.project.channels.flatMap((channel) =>
    channel.effects.map((effect) => effect.type)
  ))
  console.log(`Created ${result.filePath}`)
  console.log(
    `Seed: ${result.seed} (arrangement variation ${result.variation}/${ARRANGEMENT_VARIATIONS.length}: ` +
    `${result.variationName})`
  )
  console.log(`Song: ${SONG_BPM} BPM, ${TOTAL_BARS} bars, ${result.durationSeconds.toFixed(3)} seconds`)
  console.log(`Arrangement: ${SONG_SECTIONS.map((section) => section.name).join(' -> ')}`)
  console.log(
    `Lanes: ${result.project.lanes.length} non-empty; selected clips: ` +
    `${Object.keys(result.selectedSamples).length}; categories: ${REQUIRED_CATEGORIES.join(', ')}`
  )
  console.log(`Mixer FX: ${[...effectTypes].sort().join(', ')}`)
}

export async function runCli(args: readonly string[] = process.argv.slice(2)): Promise<void> {
  const options = parseCliArgs(args)
  if (options.help) {
    console.log(HELP_TEXT)
    return
  }
  printSummary(await generateMixerTestSong(options))
}

function isMainModule(): boolean {
  return process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
}

if (isMainModule()) {
  runCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
