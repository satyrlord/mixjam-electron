import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { placementDurationTicks } from '../src/renderer/src/lib/arrangement'
import { isProjectRelativePath, parseProject } from '../src/renderer/src/project/project-file'
import {
  bpmFromMetadataOrName,
  generateMixerTestSong,
  parseCliArgs,
  REQUIRED_CATEGORIES,
  SONG_BPM,
  SONG_DURATION_SECONDS,
  SONG_SECTIONS,
  TOTAL_TICKS,
  variationForSeed
} from './generate-mixer-test-song'

const TEST_SAMPLE_REFS = [
  'Drum/kick-01.wav',
  'Drum/kick-02.wav',
  'Drum/clap-01.wav',
  'Drum/snare-01.wav',
  'Drum/hihat-01.wav',
  'Drum/hihat-02.wav',
  'Loop/at-the-beach-01.wav',
  'Loop/tribal-01.wav',
  'Bass/warm-bass-01.wav',
  'Bass/deep-bass-01.wav',
  'Seq/sun.wav',
  'Seq/summer.wav',
  'Keys/cool-water.wav',
  'Keys/sunburst-01.wav',
  'Layer/sunny-times-1-l.wav',
  'Layer/sunny-times-1-r.wav',
  'Sphere/dreampad-1-l.wav',
  'Sphere/dreampad-1-r.wav',
  'Voice/a-yeyea-01.wav',
  'Voice/clear-space-01.wav',
  'Rap/feel-rhythm.wav',
  'Rap/dance-beat.wav',
  'Xtra/airwalk.wav',
  'Xtra/warm-wind.wav',
  'Effect/gusts-of-wind-1-l.wav',
  'Effect/gusts-of-wind-1-r.wav'
] as const

const temporaryRoots: string[] = []

function makePcmWav(durationSeconds: number): Buffer {
  const sampleRate = 8000
  const frames = Math.round(durationSeconds * sampleRate)
  const dataSize = frames * 2
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8, 'ascii')
  buffer.write('fmt ', 12, 'ascii')
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36, 'ascii')
  buffer.writeUInt32LE(dataSize, 40)
  return buffer
}

async function createFixture(options: {
  kickBpm?: number
  kickNameToken?: string
} = {}): Promise<{ samplesDir: string; outputDir: string }> {
  const root = await mkdtemp(join(tmpdir(), 'mixjam-generator-'))
  temporaryRoots.push(root)
  const samplesDir = join(root, 'samples')
  const outputDir = join(root, 'songs')
  for (const sampleRef of TEST_SAMPLE_REFS) {
    const isKick = sampleRef.startsWith('Drum/kick-')
    const referenceBpm = isKick && options.kickBpm ? options.kickBpm : SONG_BPM
    const fixtureRef = isKick
      ? sampleRef.replace('.wav', options.kickBpm
        ? ` ${options.kickBpm} BPM.wav`
        : `${options.kickNameToken ?? ''}.wav`)
      : sampleRef
    const filePath = join(samplesDir, ...fixtureRef.split('/'))
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, makePcmWav(4 * 60 / referenceBpm))
  }
  return { samplesDir, outputDir }
}

function overlaps(startTick: number, durationTicks: number, sectionStart: number, sectionEnd: number): boolean {
  return startTick < sectionEnd && startTick + durationTicks > sectionStart
}

function normalizedArrangement(project: ReturnType<typeof parseProject>): unknown {
  return {
    song: project.song,
    lanes: project.lanes.map((lane) => ({
      name: lane.name,
      pan: lane.pan,
      placements: lane.placements.map((placement) => ({
        samplePath: placement.samplePath,
        startTick: placement.startTick,
        durationTicks: placement.durationTicks,
        durationSeconds: placement.durationSeconds,
        nativeBPM: placement.nativeBPM,
        slot: placement.slot
      }))
    }))
  }
}

function placementTiming(project: ReturnType<typeof parseProject>): unknown {
  return project.lanes.map((lane) => lane.placements.map((placement) => ({
    startTick: placement.startTick,
    durationTicks: placement.durationTicks
  })))
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('generateMixerTestSong', () => {
  it.each([
    { metadata: 20, name: 'kick.wav', expected: 20 },
    { metadata: 400, name: 'kick.wav', expected: 400 },
    { metadata: 19, name: 'kick.wav', expected: null },
    { metadata: 401, name: 'kick.wav', expected: null },
    { metadata: Number.NaN, name: 'kick.wav', expected: null },
    { metadata: undefined, name: 'kick 128 BPM.wav', expected: 128 },
    { metadata: undefined, name: 'kick BPM 128.wav', expected: 128 },
    { metadata: undefined, name: 'kick 20 BPM.wav', expected: 20 },
    { metadata: undefined, name: 'kick BPM 400.wav', expected: 400 },
    { metadata: undefined, name: 'kick 19 BPM.wav', expected: null },
    { metadata: undefined, name: 'kick BPM 401.wav', expected: null },
    { metadata: undefined, name: 'kick_128_loop.wav', expected: null },
    { metadata: undefined, name: 'kick_01_loop.wav', expected: null }
  ])('accepts only plausible metadata or explicitly labeled filename BPM: $name', ({ metadata, name, expected }) => {
    expect(bpmFromMetadataOrName(metadata, name)).toBe(expected)
  })

  it('keeps plausible metadata authoritative over an explicit filename label', () => {
    expect(bpmFromMetadataOrName(126, 'kick 128 BPM.wav')).toBe(126)
  })

  it('writes a production-parseable two-minute Ibiza melodic-techno arrangement with all categories and empty return FX', async () => {
    const { samplesDir, outputDir } = await createFixture()
    const result = await generateMixerTestSong({ samplesDir, outputDir, seed: 'fixture-seed' })
    const project = parseProject(await readFile(result.filePath, 'utf8'))

    expect(project.song).toEqual({
      bpm: SONG_BPM,
      masterGain: 0.82,
      clipEdgeMicroFades: { enabled: true, fadeInMs: 2, fadeOutMs: 4 }
    })
    expect(result.durationSeconds).toBeCloseTo(SONG_DURATION_SECONDS, 6)
    expect(result.durationSeconds).toBeCloseTo(120, 6)
    expect(project.lanes).toHaveLength(16)
    expect(project.lanes.every((lane) => lane.placements.length > 0)).toBe(true)
    expect(project.lanes.filter((lane) =>
      new Set(lane.placements.map((placement) => placement.samplePath)).size > 1
    )).toHaveLength(10)

    const placements = project.lanes.flatMap((lane) => lane.placements)
    const endTicks = placements.map((placement) => placement.startTick + placement.durationTicks)
    expect(Math.max(...endTicks)).toBe(TOTAL_TICKS)
    expect(endTicks.every((endTick) => endTick <= TOTAL_TICKS)).toBe(true)
    expect(placements.every((placement) => isProjectRelativePath(placement.samplePath))).toBe(true)

    const categories = new Set(placements.map((placement) =>
      placement.samplePath.includes('/') ? placement.samplePath.split('/')[0]! : 'Unsorted'
    ))
    expect([...categories].sort()).toEqual([...REQUIRED_CATEGORIES].sort())

    for (const section of SONG_SECTIONS) {
      const startTick = section.startBar * 32
      const endTick = section.endBar * 32
      expect(placements.some((placement) =>
        overlaps(placement.startTick, placement.durationTicks, startTick, endTick)
      ), section.name).toBe(true)
    }

    const breakdownStart = 30 * 32
    const breakdownEnd = 40 * 32
    expect(project.lanes.slice(0, 5).flatMap((lane) => lane.placements).some((placement) =>
      overlaps(placement.startTick, placement.durationTicks, breakdownStart, breakdownEnd)
    )).toBe(false)

    const peakStart = 50 * 32
    const peakEnd = 62 * 32
    for (const laneIndex of [0, 1, 2, 3, 4, 5, 6, 9, 10, 11]) {
      expect(project.lanes[laneIndex]!.placements.some((placement) =>
        overlaps(placement.startTick, placement.durationTicks, peakStart, peakEnd)
      ), project.lanes[laneIndex]!.name).toBe(true)
    }

    const styleBiasedSamples = [
      result.selectedSamples.groovePrimary,
      result.selectedSamples.grooveAlternate,
      result.selectedSamples.sequencePrimary,
      result.selectedSamples.sequenceAlternate,
      result.selectedSamples.keysPrimary,
      result.selectedSamples.keysAlternate,
      result.selectedSamples.layerLeft,
      result.selectedSamples.layerRight
    ]
    expect(styleBiasedSamples.every((sample) =>
      /beach|tribal|sun|summer|water|sunny/i.test(sample.sampleName)
    )).toBe(true)

    expect(project.lanes.every((lane) => lane.sends?.every((send) => send === 0))).toBe(true)
    expect(project.fxBuses?.every((bus) => bus.module.type === 'empty')).toBe(true)
    expect(new Set(project.lanes.map((lane) => lane.gain)).size).toBeGreaterThan(4)
    expect(project.lanes.some((lane) => lane.pan < 0)).toBe(true)
    expect(project.lanes.some((lane) => lane.pan > 0)).toBe(true)
  })

  it('uses a selected sample native BPM when establishing its generated placement span', async () => {
    const kickBpm = 128
    const { samplesDir, outputDir } = await createFixture({ kickBpm })
    const result = await generateMixerTestSong({ samplesDir, outputDir, seed: 'native-bpm' })
    const kicks = [result.selectedSamples.kickPrimary, result.selectedSamples.kickAlternate]

    for (const kick of kicks) {
      expect(kick.nativeBPM).toBe(kickBpm)
      expect(kick.durationTicks).toBe(placementDurationTicks(kick.durationSeconds, kickBpm))
      expect(kick.durationTicks).toBe(32)
    }

    const kickRefs = new Set(kicks.map((kick) => kick.sampleRef))
    const kickPlacements = result.project.lanes[0]!.placements.filter((placement) =>
      kickRefs.has(placement.samplePath)
    )
    expect(kickPlacements.length).toBeGreaterThan(0)
    expect(kickPlacements.every((placement) =>
      placement.nativeBPM === kickBpm && placement.durationTicks === 32
    )).toBe(true)
  })

  it('treats bare numeric filename tokens as identifiers and falls back to song BPM', async () => {
    const { samplesDir, outputDir } = await createFixture({ kickNameToken: '_01_loop' })
    const result = await generateMixerTestSong({ samplesDir, outputDir, seed: 'numeric-identifier' })
    const kicks = [result.selectedSamples.kickPrimary, result.selectedSamples.kickAlternate]

    for (const kick of kicks) {
      expect(kick.nativeBPM).toBeNull()
      expect(kick.durationTicks).toBe(placementDurationTicks(kick.durationSeconds, SONG_BPM))
    }
  })

  it('reproduces seeded musical data and reserves monotonically increasing files', async () => {
    const { samplesDir, outputDir } = await createFixture()
    const first = await generateMixerTestSong({ samplesDir, outputDir, seed: 'repeatable' })
    const second = await generateMixerTestSong({ samplesDir, outputDir, seed: 'repeatable' })

    expect(first.fileName).toBe('Ibiza-Melodic-Techno-Mixer-Test-001.mixjam')
    expect(second.fileName).toBe('Ibiza-Melodic-Techno-Mixer-Test-002.mixjam')
    expect(Object.values(first.selectedSamples).map((sample) => sample.sampleRef)).toEqual(
      Object.values(second.selectedSamples).map((sample) => sample.sampleRef)
    )
    expect(normalizedArrangement(first.project)).toEqual(normalizedArrangement(second.project))

    const alternateSeed = Array.from({ length: 20 }, (_, index) => `alternate-${index}`)
      .find((seed) => variationForSeed(seed) !== first.variation)
    expect(alternateSeed).toBeDefined()
    const alternate = await generateMixerTestSong({ samplesDir, outputDir, seed: alternateSeed! })
    expect(alternate.variation).not.toBe(first.variation)
    expect(placementTiming(alternate.project)).not.toEqual(placementTiming(first.project))
    expect(Object.values(alternate.selectedSamples).map((sample) => sample.sampleRef)).not.toEqual(
      Object.values(first.selectedSamples).map((sample) => sample.sampleRef)
    )

    const sentinelPath = join(outputDir, 'Ibiza-Melodic-Techno-Mixer-Test-010.mixjam')
    await writeFile(sentinelPath, 'do not overwrite')
    const afterGap = await generateMixerTestSong({ samplesDir, outputDir, seed: 'repeatable' })
    expect(afterGap.fileName).toBe('Ibiza-Melodic-Techno-Mixer-Test-011.mixjam')
    expect(await readFile(sentinelPath, 'utf8')).toBe('do not overwrite')
  })
})

describe('parseCliArgs', () => {
  it('parses supported flags and rejects missing or unknown values', () => {
    expect(parseCliArgs([
      '--samples-dir', 'samples',
      '--output-dir', 'songs',
      '--seed', 'stable'
    ])).toEqual({
      help: false,
      samplesDir: 'samples',
      outputDir: 'songs',
      seed: 'stable'
    })
    expect(parseCliArgs(['--help'])).toEqual({ help: true })
    expect(() => parseCliArgs(['--seed'])).toThrow('--seed requires a value')
    expect(() => parseCliArgs(['--wat'])).toThrow('Unknown option: --wat')
  })
})
