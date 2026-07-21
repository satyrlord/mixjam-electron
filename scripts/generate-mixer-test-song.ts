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
  placeSampleOnLane,
  placementDurationTicks
} from '../src/renderer/src/lib/arrangement'
import { categorySlot } from '../src/renderer/src/lib/sample-utils'
import {
  parseProject,
  serializeProject,
  type ProjectData,
  type ProjectDocument
} from '../src/renderer/src/project/project-file'
import { TICKS_PER_BAR, tickDurationSeconds } from '../src/renderer/src/engine/transport'
import {
  createDefaultFxBuses,
  createDefaultLanes,
  createDefaultMasterBusState,
  createDefaultProjectSongState,
  type LaneState
} from '../src/renderer/src/project/project-state'

export const SONG_BPM = 140
export const TOTAL_BARS = 105
export const TOTAL_TICKS = TOTAL_BARS * TICKS_PER_BAR
export const SONG_DURATION_SECONDS = TOTAL_TICKS * tickDurationSeconds(SONG_BPM)

// One bar is 32 ticks, one beat 8, one sixteenth 2. The "and" offbeat of a
// beat sits 4 ticks after the beat; a swung off-sixteenth sits 1 tick late.
const TICKS_PER_BEAT = 8
const SIXTEENTH_TICKS = 2
const OFFBEAT_TICKS = 4
const SWING_TICKS = 1

// Sections sit on 8-bar phrase boundaries so the arc stays DJ-mixable. The
// drift-out absorbs the one leftover bar that makes 105 bars land on exactly
// 180 seconds at 140 BPM. The arc stages density and element count, not FX.
export const SONG_SECTIONS = [
  { name: 'deep-space intro', startBar: 0, endBar: 16 },
  { name: 'orbital groove', startBar: 16, endBar: 32 },
  { name: 'first contact build', startBar: 32, endBar: 40 },
  { name: 'cosmic peak', startBar: 40, endBar: 56 },
  { name: 'void breakdown', startBar: 56, endBar: 72 },
  { name: 'ignition build', startBar: 72, endBar: 80 },
  { name: 'supernova peak', startBar: 80, endBar: 96 },
  { name: 'drift-out', startBar: 96, endBar: 105 }
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

const OUTPUT_BASENAME = 'Ambient-Cosmic-Techno-Mixer-Test'
const DEFAULT_SAMPLES_DIR = 'tmp/test-samples'
const DEFAULT_OUTPUT_DIR = 'tmp/generated-songs'
const MIN_SAMPLE_BPM = 20
const MAX_SAMPLE_BPM = 400

const LANE_NAMES = [
  'Kick',
  'Groove Loop',
  'Offbeat Hats',
  'Clap / Percussion',
  'Offbeat Bass',
  'Dub Stabs',
  'Sequence Motifs',
  'Pad L',
  'Pad R',
  'Sphere L',
  'Sphere R',
  'Voice',
  'Rap',
  'Texture',
  'Transition FX L',
  'Transition FX R'
] as const

// Gains stage the techno hierarchy: kick and bass lead, hats and stabs sit
// under, pads and spheres stay low so they read as space rather than a wall.
const LANE_GAINS = [0.8, 0.56, 0.42, 0.44, 0.66, 0.46, 0.44, 0.3, 0.3, 0.32, 0.32, 0.5, 0.46, 0.3, 0.48, 0.48] as const
const LANE_PANS = [0, 0.04, 0.18, -0.14, 0, -0.2, 0.16, -0.62, 0.62, -0.5, 0.5, -0.06, 0.12, -0.24, -0.7, 0.7] as const

const COSMIC_DRONE = /cosmos|cosmic|space|star|astro|nebula|galaxy|orbit|lunar|moon|solar|eclipse|void|dark|night|dream|deep|drone|ambient|pad|atmo|sphere|air|wind|ocean|sea|water/i
const COSMIC_TENSION = /dark|night|void|shadow|echo|drone|deep|cosmic|space|tension|myster|hypno|pulse|siren|alarm|signal|static|noise|air|wind|wave/i

const SINGLE_SAMPLE_ROLE_DEFINITIONS = [
  { key: 'kickPrimary', name: 'primary kick hit', category: 'Drum', pattern: /kick/i, maxDurationBars: 2 },
  { key: 'kickAlternate', name: 'alternate kick hit', category: 'Drum', pattern: /kick/i, maxDurationBars: 2 },
  { key: 'clap', name: 'clap hit', category: 'Drum', pattern: /clap|snap/i, maxDurationBars: 2 },
  { key: 'snare', name: 'snare hit', category: 'Drum', pattern: /snare|rim/i, maxDurationBars: 2 },
  { key: 'hatPrimary', name: 'primary offbeat hat', category: 'Drum', pattern: /hihat|hat|ride|shak|tamb|open|perc/i, maxDurationBars: 2 },
  { key: 'hatAlternate', name: 'alternate offbeat hat', category: 'Drum', pattern: /hihat|hat|ride|shak|tamb|open|perc/i, maxDurationBars: 2 },
  { key: 'percussionPrimary', name: 'primary syncopated percussion', category: 'Drum', pattern: /perc|conga|bongo|cow|stick|rim|tom|clave|wood|metal|click|shak|tamb|hihat|hat/i, maxDurationBars: 2 },
  { key: 'percussionAlternate', name: 'alternate syncopated percussion', category: 'Drum', pattern: /perc|conga|bongo|cow|stick|rim|tom|clave|wood|metal|click|shak|tamb|hihat|hat/i, maxDurationBars: 2 },
  { key: 'groovePrimary', name: 'primary groove loop', category: 'Loop', pattern: /.*/, stylePattern: /tribal|afrika|africa|latin|samba|bongo|conga|dark|deep|hypno|pulse|drive|space|cosmic|night/i, maxDurationBars: 4 },
  { key: 'grooveAlternate', name: 'alternate groove loop', category: 'Loop', pattern: /.*/, stylePattern: /tribal|afrika|africa|latin|samba|bongo|conga|dark|deep|hypno|pulse|drive|space|cosmic|night/i, maxDurationBars: 4 },
  { key: 'bassPrimary', name: 'primary offbeat bass hit', category: 'Bass', pattern: /.*/, stylePattern: /deep|sub|dark|warm|pulse|drive|night|space|cosmic|void|reese|acid|sine/i, maxDurationBars: 4 },
  { key: 'bassAlternate', name: 'alternate offbeat bass hit', category: 'Bass', pattern: /.*/, stylePattern: /deep|sub|dark|warm|pulse|drive|night|space|cosmic|void|reese|acid|sine/i, maxDurationBars: 4 },
  { key: 'sequencePrimary', name: 'primary sequence motif', category: 'Seq', pattern: /.*/, stylePattern: /arp|seq|pulse|space|cosmic|star|astro|dark|night|echo|signal|sine|air|water|ocean|sea/i, maxDurationBars: 4 },
  { key: 'sequenceAlternate', name: 'alternate sequence motif', category: 'Seq', pattern: /.*/, stylePattern: /arp|seq|pulse|space|cosmic|star|astro|dark|night|echo|signal|sine|air|water|ocean|sea/i, maxDurationBars: 4 },
  { key: 'stabPrimary', name: 'primary dub stab', category: 'Keys', pattern: /.*/, stylePattern: /chord|stab|minor|dark|deep|dub|organ|pad|space|cosmic|night|water|dream|orient|melodica|tribal/i, maxDurationBars: 4 },
  { key: 'stabAlternate', name: 'alternate dub stab', category: 'Keys', pattern: /.*/, stylePattern: /chord|stab|minor|dark|deep|dub|organ|pad|space|cosmic|night|water|dream|orient|melodica|tribal/i, maxDurationBars: 4 },
  { key: 'voicePrimary', name: 'primary voice motif', category: 'Voice', pattern: /.*/, stylePattern: COSMIC_TENSION, maxDurationBars: 4 },
  { key: 'voiceAlternate', name: 'alternate voice motif', category: 'Voice', pattern: /.*/, stylePattern: COSMIC_TENSION, maxDurationBars: 4 },
  { key: 'rapPrimary', name: 'primary rap motif', category: 'Rap', pattern: /.*/, stylePattern: COSMIC_TENSION, maxDurationBars: 4 },
  { key: 'rapAlternate', name: 'alternate rap motif', category: 'Rap', pattern: /.*/, stylePattern: COSMIC_TENSION, maxDurationBars: 4 },
  { key: 'extraPrimary', name: 'primary texture', category: 'Xtra', pattern: /.*/, stylePattern: COSMIC_DRONE, maxDurationBars: 4 },
  { key: 'extraAlternate', name: 'alternate texture', category: 'Xtra', pattern: /.*/, stylePattern: COSMIC_DRONE, maxDurationBars: 4 }
] as const

const STEREO_SAMPLE_ROLE_DEFINITIONS = [
  {
    leftKey: 'layerLeft',
    rightKey: 'layerRight',
    name: 'stereo pad',
    category: 'Layer',
    pattern: /.*/,
    stylePattern: COSMIC_DRONE,
    maxDurationBars: 8
  },
  {
    leftKey: 'sphereLeft',
    rightKey: 'sphereRight',
    name: 'stereo sphere',
    category: 'Sphere',
    pattern: /.*/,
    stylePattern: COSMIC_DRONE,
    maxDurationBars: 16
  },
  {
    leftKey: 'transitionLeft',
    rightKey: 'transitionRight',
    name: 'stereo transition effect',
    category: 'Effect',
    pattern: /rise|sweep|swish|crash|uplift|transition|impact|noise|wind|reverse|roll|downlift|fall/i,
    stylePattern: /wind|wave|sea|ocean|air|sweep|swish|noise|cosmic|space|dark|rise|fall/i,
    maxDurationBars: 4
  }
] as const

const ARRANGEMENT_VARIATIONS = [
  {
    name: 'cosmic call and response',
    voiceBars: [18, 36, 52, 82, 98],
    rapBars: [26, 44, 74, 88, 100],
    textureRegions: [[8, 16], [24, 32], [56, 64], [64, 72], [84, 92], [96, 105]]
  },
  {
    name: 'late supernova lift',
    voiceBars: [16, 40, 54, 84, 100],
    rapBars: [28, 46, 76, 90, 98],
    textureRegions: [[12, 24], [32, 40], [60, 72], [76, 84], [86, 94], [98, 105]]
  },
  {
    name: 'void-air dialogue',
    voiceBars: [24, 48, 58, 88, 96],
    rapBars: [20, 44, 76, 92, 100],
    textureRegions: [[8, 20], [36, 48], [58, 66], [64, 72], [84, 94], [96, 105]]
  },
  {
    name: 'supernova answers',
    voiceBars: [16, 40, 56, 86, 96],
    rapBars: [28, 44, 72, 80, 100],
    textureRegions: [[8, 20], [36, 44], [60, 68], [72, 78], [82, 92], [98, 105]]
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

const HELP_TEXT = `Generate a three-minute ambient cosmic-techno project for Mixer and FX testing.

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

function buildArrangement(samples: SelectedSamples, variationNumber: number): LaneState[] {
  const variation = ARRANGEMENT_VARIATIONS[variationNumber - 1]!
  let lanes: LaneState[] = Array.from({ length: 16 }, (_, index) => createDefaultLanes()[index % 8]!).map((lane, index) => ({
    ...lane,
    id: `mixer-test-lane-${index + 1}`,
    index,
    name: LANE_NAMES[index]!,
    gain: LANE_GAINS[index]!,
    pan: LANE_PANS[index]!,
    sends: [0, 0, 0, 0]
  }))

  // A single hit event at the clip's natural span. The audio voice is
  // monophonic per lane, so a dense trigger cuts the previous voice; the stored
  // durationTicks stays the clip's one natural span, which keeps every placement
  // of a given sample on the same durationTicks (spec-011 AC-016).
  const hit = (laneIndex: number, sample: SelectedSample, tick: number): void => {
    if (!Number.isFinite(tick) || tick < 0 || tick + sample.durationTicks > TOTAL_TICKS) return
    lanes = placeSampleOnLane(
      lanes,
      laneIndex,
      sample.sampleRef,
      sample.sampleName,
      Math.round(tick),
      sample.durationTicks,
      sample.durationSeconds,
      categorySlot(sample.category),
      sample.nativeBPM
    )
  }

  // A continuous bed covering a bar range, tiled back-to-back at the clip's
  // natural span. Used for pads and spheres that should read as sustained space.
  const sustain = (
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
      hit(laneIndex, sample, tick)
    }
  }

  const phase = variationNumber % 2

  // Alternate between two clips on a per-hit basis so a lane keeps its rhythm
  // identity while its timbre evolves. `accentStep` marks one hit per cycle for
  // a subtle lane-volume-independent push (we cannot author per-hit velocity,
  // so accents live in pattern density and clip choice).
  const alternate = (index: number, primary: SelectedSample, alt: SelectedSample): SelectedSample =>
    (index + phase) % 2 === 0 ? primary : alt

  // Section lookup so the arc drives which lanes play and how dense they are.
  const sectionAt = (bar: number): typeof SONG_SECTIONS[number] =>
    SONG_SECTIONS.find((section) => bar >= section.startBar && bar < section.endBar) ??
    SONG_SECTIONS[SONG_SECTIONS.length - 1]!

  const isBreakdownBar = (bar: number): boolean => sectionAt(bar).name === 'void breakdown'
  const isBuildBar = (bar: number): boolean => /build/.test(sectionAt(bar).name)
  const isPeakBar = (bar: number): boolean => /peak/.test(sectionAt(bar).name)
  const isOutroBar = (bar: number): boolean => sectionAt(bar).name === 'drift-out'

  // The breakdown must be a true void for the rhythm section. Because every
  // clip keeps its full natural span (AC-016), a hit triggered just before the
  // breakdown would ring into it. Rhythm lanes therefore stay silent for a
  // clearance window ahead of the breakdown that covers the longest clip.
  const breakdown = SONG_SECTIONS.find((section) => section.name === 'void breakdown')!
  const longestRhythmBars = Math.ceil(Math.max(
    samples.kickPrimary.durationTicks,
    samples.kickAlternate.durationTicks,
    samples.groovePrimary.durationTicks,
    samples.grooveAlternate.durationTicks,
    samples.clap.durationTicks,
    samples.snare.durationTicks,
    samples.hatPrimary.durationTicks,
    samples.hatAlternate.durationTicks,
    samples.percussionPrimary.durationTicks,
    samples.percussionAlternate.durationTicks,
    samples.bassPrimary.durationTicks,
    samples.bassAlternate.durationTicks
  ) / TICKS_PER_BAR)
  const rhythmClearanceStart = breakdown.startBar - longestRhythmBars
  const ringsIntoBreakdown = (bar: number): boolean => bar >= rhythmClearanceStart && bar < breakdown.endBar

  // Phrase-boundary kick drop: mute the kick on the last bar of every 8-bar
  // phrase, throughout the breakdown, and in the clearance that keeps a natural
  // clip tail from ringing into the void.
  const kickMutedForBar = (bar: number): boolean => ringsIntoBreakdown(bar) || bar % 8 === 7

  // --- Kick: four-on-the-floor anchor with phrase-boundary breaths. ---
  for (let bar = 0; bar < TOTAL_BARS; bar += 1) {
    if (kickMutedForBar(bar)) continue
    // Outro strips to kick + hats near the very end, then nothing but texture.
    for (let beat = 0; beat < 4; beat += 1) {
      const tick = bar * TICKS_PER_BAR + beat * TICKS_PER_BEAT
      hit(0, alternate(bar * 4 + beat, samples.kickPrimary, samples.kickAlternate), tick)
    }
  }

  // --- Groove loop: the rhythmic backbone that enters with the groove and
  // rides both peaks, lifting out for the intro and the breakdown clearance so
  // its return is an arrangement event. ---
  for (const [startBar, endBar] of [[16, 32], [32, Math.min(56, rhythmClearanceStart)], [72, 96], [96, 105]] as const) {
    sustain(1, alternate(startBar, samples.groovePrimary, samples.grooveAlternate), startBar, endBar)
  }

  // --- Clap / snare backbeat (beats 2 and 4) interlocked with sparse
  // syncopated percussion on the same lane. The backbeat stays on-grid while
  // the percussion answers on off-sixteenths, and the lane rests in the intro
  // and through the breakdown clearance. ---
  for (let bar = 0; bar < TOTAL_BARS; bar += 1) {
    const name = sectionAt(bar).name
    if (name === 'deep-space intro' || ringsIntoBreakdown(bar)) continue
    const base = bar * TICKS_PER_BAR
    hit(3, samples.clap, base + 1 * TICKS_PER_BEAT)
    hit(3, samples.snare, base + 3 * TICKS_PER_BEAT)
    // On the last bar of an 8-bar phrase, double the beat-4 hit for a push.
    if (bar % 8 === 7 && !isOutroBar(bar)) {
      hit(3, samples.clap, base + 3 * TICKS_PER_BEAT + OFFBEAT_TICKS)
    }
    // A 3-against-4 dotted-eighth percussion motif cycles against the kick and
    // resolves with a rest every third bar, setting up the next phrase.
    if (bar % 3 !== 2) {
      for (let step = 0; step < 2; step += 1) {
        const tick = base + OFFBEAT_TICKS + step * 3 * SIXTEENTH_TICKS + (step % 2 === 1 ? SWING_TICKS : 0)
        hit(3, alternate(bar * 2 + step, samples.percussionPrimary, samples.percussionAlternate), tick)
      }
    }
  }

  // --- Offbeat hats on the "and" of each beat with swing and a 4-step accent
  // cycle. They rest in the intro and through the breakdown clearance so their
  // return is an event. ---
  for (let bar = 0; bar < TOTAL_BARS; bar += 1) {
    const name = sectionAt(bar).name
    if (name === 'deep-space intro' || ringsIntoBreakdown(bar)) continue
    // Builds raise hat density by adding the off-sixteenth; peaks keep it high.
    const dense = isBuildBar(bar) || isPeakBar(bar)
    for (let beat = 0; beat < 4; beat += 1) {
      const swing = beat % 2 === 1 ? SWING_TICKS : 0
      const tick = bar * TICKS_PER_BAR + beat * TICKS_PER_BEAT + OFFBEAT_TICKS + swing
      hit(2, alternate(bar * 4 + beat, samples.hatPrimary, samples.hatAlternate), tick)
      if (dense && beat % 2 === 0) {
        // Ghost sixteenth before the next offbeat, swung, reads as lift.
        hit(2, samples.hatAlternate, tick + SIXTEENTH_TICKS + SWING_TICKS)
      }
    }
  }

  // --- Offbeat bass answering the kick, resting at phrase ends and through
  // the breakdown clearance. Enters at the groove so the intro stays spacious. ---
  for (let bar = 0; bar < TOTAL_BARS; bar += 1) {
    const name = sectionAt(bar).name
    if (name === 'deep-space intro' || ringsIntoBreakdown(bar)) continue
    // Rest the bass on the last bar of each 16-bar half-phrase for a pickup.
    if (bar % 16 === 15) continue
    for (let beat = 0; beat < 4; beat += 1) {
      const tick = bar * TICKS_PER_BAR + beat * TICKS_PER_BEAT + OFFBEAT_TICKS
      hit(4, alternate(bar * 4 + beat, samples.bassPrimary, samples.bassAlternate), tick)
    }
  }

  // --- Dub stabs: sparse offbeat chord events, one per bar normally, rising
  // to two per bar in builds and peaks. They answer across the breakdown where
  // almost everything else is silent. ---
  for (let bar = 0; bar < TOTAL_BARS; bar += 1) {
    const name = sectionAt(bar).name
    if (name === 'deep-space intro') continue
    const base = bar * TICKS_PER_BAR
    const stab = alternate(bar, samples.stabPrimary, samples.stabAlternate)
    if (isBreakdownBar(bar)) {
      // In the void, a lone stab every two bars carries the harmony.
      if (bar % 2 === 0) hit(5, stab, base + OFFBEAT_TICKS)
      continue
    }
    hit(5, stab, base + 1 * TICKS_PER_BEAT + OFFBEAT_TICKS)
    if (isBuildBar(bar) || isPeakBar(bar)) {
      hit(5, alternate(bar + 1, samples.stabPrimary, samples.stabAlternate), base + 3 * TICKS_PER_BEAT + OFFBEAT_TICKS)
    }
  }

  // --- Sequence motifs: the cosmic arp-like voice. Enters at the first build,
  // rides both peaks, and thins in the breakdown to a single motif per 2 bars. ---
  for (let bar = 0; bar < TOTAL_BARS; bar += 1) {
    const name = sectionAt(bar).name
    if (name === 'deep-space intro' || name === 'orbital groove') continue
    const base = bar * TICKS_PER_BAR
    const seq = alternate(bar, samples.sequencePrimary, samples.sequenceAlternate)
    if (isBreakdownBar(bar)) {
      if (bar % 2 === 1) hit(6, seq, base + 2 * TICKS_PER_BEAT)
      continue
    }
    hit(6, seq, base)
    if (isPeakBar(bar)) hit(6, alternate(bar + 1, samples.sequencePrimary, samples.sequenceAlternate), base + 2 * TICKS_PER_BEAT)
  }

  // --- Pads: sustained stereo bed under the groove and peaks, muted in the
  // breakdown so the stab alone carries harmony, back for the peaks. ---
  for (const [startBar, endBar] of [[16, 32], [32, 56], [80, 96], [96, 105]] as const) {
    sustain(7, samples.layerLeft, startBar, endBar)
    sustain(8, samples.layerRight, startBar, endBar)
  }

  // --- Spheres: long cosmic drones marking the largest structural arrivals. ---
  for (const startBar of [0, 32, 56, 80]) {
    sustain(9, samples.sphereLeft, startBar, Math.min(startBar + 16, TOTAL_BARS))
    sustain(10, samples.sphereRight, startBar, Math.min(startBar + 16, TOTAL_BARS))
  }

  // --- Voice / rap motifs: seeded call-and-response on the variation grid. ---
  variation.voiceBars.forEach((bar, index) => {
    hit(11, alternate(index, samples.voicePrimary, samples.voiceAlternate), bar * TICKS_PER_BAR)
  })
  variation.rapBars.forEach((bar, index) => {
    hit(12, alternate(index, samples.rapPrimary, samples.rapAlternate), bar * TICKS_PER_BAR)
  })

  // --- Texture: alternating ambient regions from the variation profile. ---
  variation.textureRegions.forEach(([startBar, endBar], index) => {
    sustain(13, alternate(index, samples.extraPrimary, samples.extraAlternate), startBar, endBar)
  })

  // --- Transition FX at every section boundary, placed to end on the boundary. ---
  for (const endBar of SONG_SECTIONS.map((section) => section.endBar)) {
    hit(14, samples.transitionLeft, endBar * TICKS_PER_BAR - samples.transitionLeft.durationTicks)
    hit(15, samples.transitionRight, endBar * TICKS_PER_BAR - samples.transitionRight.durationTicks)
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
    song: createDefaultProjectSongState({ bpm: SONG_BPM, masterGain: 0.82 }),
    lanes: buildArrangement(samples, variation),
    fxBuses: createDefaultFxBuses(),
    masterBus: createDefaultMasterBusState()
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
  const effectTypes = new Set((result.project.fxBuses ?? []).map((bus) => bus.module.type))
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
