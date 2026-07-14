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
export const TOTAL_BARS = 48
export const TOTAL_TICKS = TOTAL_BARS * TICKS_PER_BAR
export const SONG_DURATION_SECONDS = TOTAL_TICKS * tickDurationSeconds(SONG_BPM)

export const TRANCE_SECTIONS = [
  { name: 'DJ-style intro', startBar: 0, endBar: 8 },
  { name: 'theme build', startBar: 8, endBar: 16 },
  { name: 'percussion-free breakdown', startBar: 16, endBar: 24 },
  { name: 'buildup', startBar: 24, endBar: 32 },
  { name: 'full anthem', startBar: 32, endBar: 40 },
  { name: 'mix-out', startBar: 40, endBar: 48 }
] as const

export const REQUIRED_CATEGORIES = [
  'Bass',
  'Beats',
  'Drum',
  'FX',
  'Keys',
  'Loop',
  'Sphere',
  'Vocals',
  'Xtra',
  'Unsorted'
] as const

const OUTPUT_BASENAME = 'Classic-Trance-Mixer-Test'
const DEFAULT_SAMPLES_DIR = 'tmp/test-samples'
const DEFAULT_OUTPUT_DIR = 'tmp/generated-songs'

const LANE_ROLE_DEFINITIONS = [
  { key: 'kick', name: 'Kick', category: 'Drum', pattern: /^Drum\/KICK(\d{3})_TRNCE_140_X_SC4\.wav$/i },
  { key: 'clap', name: 'Clap / Build', category: 'Drum', pattern: /^Drum\/CLAP(\d{3})_TRNCE_140_X_SC4\.wav$/i },
  { key: 'percussion', name: 'Percussion', category: 'Drum', pattern: /^Drum\/PERCUSSN(\d{3})_TRNCE_140_X_SC4\.wav$/i },
  { key: 'beatLoop', name: 'Beat Loop', category: 'Beats', pattern: /^Beats\/TRANCE_BEATS(\d{3})_140_X_SL1\.wav$/i },
  { key: 'drumLoopLeft', name: 'Drum Loop L', category: 'Loop', pattern: /^Loop\/DRUMLOOP(\d{3})_TRNCE_140_X_SC4\(L\)\.wav$/i },
  { key: 'drumLoopRight', name: 'Drum Loop R', category: 'Loop', pattern: /^Loop\/DRUMLOOP(\d{3})_TRNCE_140_X_SC4\(R\)\.wav$/i },
  { key: 'bass', name: 'Offbeat Bass', category: 'Bass', pattern: /^Bass\/SNTHBASS(\d{3})_TRNCE_140_A_SC4\.wav$/i },
  { key: 'atmosphereLeft', name: 'Atmosphere L', category: 'Sphere', pattern: /^Sphere\/SPHERE(\d{3})_TRNCE_140_A_SC4\(L\)\.wav$/i },
  { key: 'atmosphereRight', name: 'Atmosphere R', category: 'Sphere', pattern: /^Sphere\/SPHERE(\d{3})_TRNCE_140_A_SC4\(R\)\.wav$/i },
  { key: 'anthemLeadLeft', name: 'Anthem Lead L', category: 'Keys', pattern: /^Keys\/SYNTH(\d{3})_TRNCE_140_A_SC4\(L\)\.wav$/i },
  { key: 'anthemLeadRight', name: 'Anthem Lead R', category: 'Keys', pattern: /^Keys\/SYNTH(\d{3})_TRNCE_140_A_SC4\(R\)\.wav$/i },
  { key: 'pianoHarmony', name: 'Piano Harmony', category: 'Unsorted', pattern: /^honey piano A\.wav$/i },
  { key: 'vocalMotif', name: 'Vocal Motif', category: 'Vocals', pattern: /^Vocals\/TRANCE_VOCALS(\d{3})_140_X_SL1\.wav$/i },
  { key: 'extraTexture', name: 'Extra Texture', category: 'Xtra', pattern: /^Xtra\/TRANCE_EXTRA(\d{3})_140_A_SL1\.wav$/i },
  { key: 'transitionFxLeft', name: 'Transition FX L', category: 'FX', pattern: /^FX\/FX(\d{3})_TRNCE_140_X_SC4\(L\)\.wav$/i },
  { key: 'transitionFxRight', name: 'Transition FX R', category: 'FX', pattern: /^FX\/FX(\d{3})_TRNCE_140_X_SC4\(R\)\.wav$/i }
] as const

type LaneRole = typeof LANE_ROLE_DEFINITIONS[number]
export type LaneRoleKey = LaneRole['key']

interface DiscoveredSample {
  absolutePath: string
  sampleRef: string
  sampleName: string
  category: string
}

export interface SelectedSample extends DiscoveredSample {
  durationSeconds: number
  durationTicks: number
  nativeBPM: number | null
}

export type SelectedSamples = Record<LaneRoleKey, SelectedSample>

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
  durationSeconds: number
  selectedSamples: SelectedSamples
  project: ProjectDocument
}

interface CliOptions extends GeneratorOptions {
  help: boolean
}

const HELP_TEXT = `Generate a durable classic-trance project for Mixer and FX testing.

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
  return (hashSeed(seed) % 5) + 1
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

function chooseRoleSample(
  inventory: readonly DiscoveredSample[],
  role: LaneRole,
  variation: number
): DiscoveredSample {
  const candidates = inventory.filter((sample) => role.pattern.test(sample.sampleRef))
  if (candidates.length === 0) {
    throw new Error(`No WAV candidate found for the ${role.name} lane in category ${role.category}.`)
  }
  candidates.sort((left, right) => left.sampleRef.localeCompare(right.sampleRef))
  const exactVariation = candidates.find((sample) => {
    const match = role.pattern.exec(sample.sampleRef)
    return match?.[1] !== undefined && Number(match[1]) === variation
  })
  return exactVariation ?? candidates[(variation - 1) % candidates.length]!
}

function bpmFromMetadataOrName(metadataBpm: number | undefined, sampleName: string): number | null {
  if (metadataBpm !== undefined && Number.isFinite(metadataBpm) && metadataBpm > 0) {
    return metadataBpm
  }
  const match = sampleName.match(/(?:_|\b)(\d{2,3})(?:_|\s+BPM\b)/i)
  return match ? Number(match[1]) : null
}

async function selectSamples(
  samplesDir: string,
  seed: string
): Promise<{ variation: number; samples: SelectedSamples }> {
  const inventory = await discoverWavFiles(samplesDir)
  const variation = variationForSeed(seed)
  const entries = await Promise.all(LANE_ROLE_DEFINITIONS.map(async (role) => {
    const candidate = chooseRoleSample(inventory, role, variation)
    const metadata = await parseFile(candidate.absolutePath)
    const durationSeconds = metadata.format.duration
    if (durationSeconds === undefined || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new Error(`Could not read a positive WAV duration for ${candidate.sampleRef}.`)
    }
    const selected: SelectedSample = {
      ...candidate,
      durationSeconds,
      durationTicks: placementDurationTicks(durationSeconds, SONG_BPM),
      nativeBPM: bpmFromMetadataOrName(metadata.common.bpm, candidate.sampleName)
    }
    return [role.key, selected] as const
  }))

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
  const gains = [0.9, 0.72, 0.66, 0.62, 0.58, 0.58, 0.74, 0.5, 0.5, 0.64, 0.64, 0.56, 0.62, 0.48, 0.55, 0.55]
  const pans = [0, 0.05, -0.18, 0.12, -0.7, 0.7, 0, -0.78, 0.78, -0.62, 0.62, -0.08, 0.18, -0.3, -0.82, 0.82]
  const effects = new Map<number, EffectSlot[]>([
    [0, [createEffect('fx-mixer-test-01-compressor', 'compressor', 'Gentle Glue')]],
    [3, [createEffect('fx-mixer-test-04-compressor', 'compressor', 'Classic Control')]],
    [6, [createEffect('fx-mixer-test-07-compressor', 'compressor', 'Leveler')]],
    [7, [createEffect('fx-mixer-test-08-reverb', 'reverb', 'Long Hall')]],
    [8, [createEffect('fx-mixer-test-09-reverb', 'reverb', 'Long Hall')]],
    [9, [createEffect('fx-mixer-test-10-delay', 'delay', 'Ping-Pong Eighths'), createEffect('fx-mixer-test-10-reverb', 'reverb', 'Studio Room')]],
    [10, [createEffect('fx-mixer-test-11-delay', 'delay', 'Ping-Pong Eighths'), createEffect('fx-mixer-test-11-reverb', 'reverb', 'Studio Room')]],
    [11, [createEffect('fx-mixer-test-12-reverb', 'reverb', 'Long Hall')]],
    [12, [createEffect('fx-mixer-test-13-delay', 'delay', 'Classic Echo'), createEffect('fx-mixer-test-13-compressor', 'compressor', 'Gentle Glue')]],
    [14, [createEffect('fx-mixer-test-15-delay', 'delay', 'Slapback'), createEffect('fx-mixer-test-15-reverb', 'reverb', 'Long Hall')]],
    [15, [createEffect('fx-mixer-test-16-delay', 'delay', 'Slapback'), createEffect('fx-mixer-test-16-reverb', 'reverb', 'Long Hall')]]
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

function buildArrangement(samples: SelectedSamples): LaneState[] {
  const lanePans = [0, 0, -0.12, 0.1, -0.5, 0.5, 0, -0.55, 0.55, -0.45, 0.45, -0.08, 0.12, -0.25, -0.6, 0.6]
  let lanes: LaneState[] = createDefaultLanes().map((lane, index) => ({
    ...lane,
    name: LANE_ROLE_DEFINITIONS[index]!.name,
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

  const beatPattern = (
    laneIndex: number,
    sample: SelectedSample,
    startBar: number,
    endBar: number,
    beatOffsets: readonly number[]
  ): void => {
    const rangeEnd = endBar * TICKS_PER_BAR
    for (let bar = startBar; bar < endBar; bar += 1) {
      for (const beatOffset of beatOffsets) {
        const tick = bar * TICKS_PER_BAR + beatOffset
        if (tick + sample.durationTicks <= rangeEnd) place(laneIndex, sample, tick)
      }
    }
  }

  beatPattern(0, samples.kick, 0, 16, [0, 8, 16, 24])
  beatPattern(0, samples.kick, 28, 48, [0, 8, 16, 24])
  beatPattern(1, samples.clap, 4, 16, [8, 24])
  beatPattern(1, samples.clap, 30, 46, [8, 24])
  beatPattern(2, samples.percussion, 6, 16, [4, 12, 20, 28])
  beatPattern(2, samples.percussion, 28, 44, [4, 12, 20, 28])

  for (const [startBar, endBar] of [[4, 16], [24, 32], [32, 48]] as const) {
    tileBars(3, samples.beatLoop, startBar, endBar)
  }
  for (const [startBar, endBar] of [[8, 16], [28, 44]] as const) {
    tileBars(4, samples.drumLoopLeft, startBar, endBar)
    tileBars(5, samples.drumLoopRight, startBar, endBar)
  }
  for (const [startBar, endBar] of [[4, 16], [28, 48]] as const) {
    tileBars(6, samples.bass, startBar, endBar)
  }
  for (const [startBar, endBar] of [[0, 8], [16, 28], [40, 48]] as const) {
    tileBars(7, samples.atmosphereLeft, startBar, endBar)
    tileBars(8, samples.atmosphereRight, startBar, endBar)
  }
  for (const [startBar, endBar] of [[8, 16], [20, 24], [32, 40]] as const) {
    tileBars(9, samples.anthemLeadLeft, startBar, endBar)
    tileBars(10, samples.anthemLeadRight, startBar, endBar)
  }
  for (const [startBar, endBar] of [[16, 28], [32, 40]] as const) {
    tileBars(11, samples.pianoHarmony, startBar, endBar)
  }
  for (const bar of [12, 20, 30, 36, 44]) {
    place(12, samples.vocalMotif, bar * TICKS_PER_BAR)
  }
  for (const [startBar, endBar] of [[6, 16], [24, 32], [32, 40]] as const) {
    tileBars(13, samples.extraTexture, startBar, endBar)
  }
  for (const endBar of [8, 16, 24, 32, 40, 48]) {
    place(14, samples.transitionFxLeft, endBar * TICKS_PER_BAR - samples.transitionFxLeft.durationTicks)
    place(15, samples.transitionFxRight, endBar * TICKS_PER_BAR - samples.transitionFxRight.durationTicks)
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
  const project: ProjectData = {
    song: { bpm: SONG_BPM, masterGain: 0.82 },
    lanes: buildArrangement(samples),
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
  console.log(`Seed: ${result.seed} (shared variation ${String(result.variation).padStart(3, '0')})`)
  console.log(`Song: ${SONG_BPM} BPM, ${TOTAL_BARS} bars, ${result.durationSeconds.toFixed(3)} seconds`)
  console.log(`Arrangement: ${TRANCE_SECTIONS.map((section) => section.name).join(' -> ')}`)
  console.log(`Lanes: ${result.project.lanes.length} non-empty; categories: ${REQUIRED_CATEGORIES.join(', ')}`)
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
