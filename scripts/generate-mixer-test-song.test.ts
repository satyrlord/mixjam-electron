import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { placementDurationTicks } from '../src/renderer/src/lib/arrangement'
import { isProjectRelativePath, parseProject } from '../src/renderer/src/project/project-file'
import { createDefaultMasterBusState } from '../src/renderer/src/project/project-state'
import {
  bpmFromMetadataOrName,
  generateMixerTestSong,
  parseCliArgs,
  REQUIRED_CATEGORIES,
  SONG_BPM,
  SONG_DURATION_SECONDS,
  SONG_SECTIONS,
  TOTAL_BARS,
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
  'Drum/perc-01.wav',
  'Drum/perc-02.wav',
  'Loop/tribal-pulse-01.wav',
  'Loop/deep-space-groove-01.wav',
  'Bass/deep-bass-01.wav',
  'Bass/sub-bass-01.wav',
  'Seq/starlight-arp.wav',
  'Seq/cosmic-pulse.wav',
  'Keys/dark-chord-stab.wav',
  'Keys/deep-organ-stab.wav',
  'Layer/cosmic-pad-1-l.wav',
  'Layer/cosmic-pad-1-r.wav',
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

function sectionNamed(name: typeof SONG_SECTIONS[number]['name']): typeof SONG_SECTIONS[number] {
  const section = SONG_SECTIONS.find((candidate) => candidate.name === name)
  if (!section) throw new Error(`Unknown section: ${name}`)
  return section
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
  ])('resolves metadata $metadata and filename $name to $expected BPM', ({ metadata, name, expected }) => {
    expect(bpmFromMetadataOrName(metadata, name)).toBe(expected)
  })

  it('keeps plausible metadata authoritative over an explicit filename label', () => {
    expect(bpmFromMetadataOrName(126, 'kick 128 BPM.wav')).toBe(126)
  })

  it('writes a production-parseable three-minute ambient cosmic-techno arrangement with all categories and empty return FX', async () => {
    const { samplesDir, outputDir } = await createFixture()
    const result = await generateMixerTestSong({ samplesDir, outputDir, seed: 'fixture-seed' })
    const project = parseProject(await readFile(result.filePath, 'utf8'))

    expect(project.song).toEqual({
      bpm: SONG_BPM,
      masterGain: 0.82,
      clipEdgeMicroFades: { enabled: true, fadeInMs: 2, fadeOutMs: 4 }
    })
    expect(result.durationSeconds).toBeCloseTo(SONG_DURATION_SECONDS, 6)
    expect(result.durationSeconds).toBeCloseTo(180, 6)
    expect(project.lanes).toHaveLength(16)
    expect(project.lanes.every((lane) => lane.placements.length > 0)).toBe(true)
    // Kick, hats, percussion, bass, stabs, and sequences always alternate two
    // clips; groove, voice, rap, and texture may add more depending on seed.
    expect(project.lanes.filter((lane) =>
      new Set(lane.placements.map((placement) => placement.samplePath)).size > 1
    ).length).toBeGreaterThanOrEqual(8)

    const placements = project.lanes.flatMap((lane) => lane.placements)
    const endTicks = placements.map((placement) => placement.startTick + placement.durationTicks)
    expect(Math.max(...endTicks)).toBe(TOTAL_TICKS)
    expect(endTicks.every((endTick) => endTick <= TOTAL_TICKS)).toBe(true)
    expect(placements.every((placement) => isProjectRelativePath(placement.samplePath))).toBe(true)

    // Every placement of one sample keeps a single natural span (AC-016).
    const spanBySample = new Map<string, number>()
    for (const placement of placements) {
      const existing = spanBySample.get(placement.samplePath)
      if (existing !== undefined) expect(placement.durationTicks).toBe(existing)
      spanBySample.set(placement.samplePath, placement.durationTicks)
    }

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

    // The void breakdown removes the rhythm section (kick, clap/snare, hats,
    // percussion, bass) while melodic and atmospheric material continues.
    const breakdown = sectionNamed('void breakdown')
    const breakdownStart = breakdown.startBar * 32
    const breakdownEnd = breakdown.endBar * 32
    expect(project.lanes.slice(0, 5).flatMap((lane) => lane.placements).some((placement) =>
      overlaps(placement.startTick, placement.durationTicks, breakdownStart, breakdownEnd)
    )).toBe(false)

    // The supernova peak restores kick, clap/snare, hats, percussion, bass,
    // stabs, sequences, spheres, and voice.
    const peak = sectionNamed('supernova peak')
    const peakStart = peak.startBar * 32
    const peakEnd = peak.endBar * 32
    for (const laneIndex of [0, 1, 2, 3, 4, 5, 6, 9, 10, 11]) {
      expect(project.lanes[laneIndex]!.placements.some((placement) =>
        overlaps(placement.startTick, placement.durationTicks, peakStart, peakEnd)
      ), project.lanes[laneIndex]!.name).toBe(true)
    }

    // The bass answers the kick off the beat: every bass hit starts off the
    // beat and at least one lands on the 4-tick offbeat so the two lanes
    // interlock rather than double. Because kick and bass clips share one
    // natural span, an on-beat bass hit could still ring under the kick; the
    // offbeat trigger placement is what keeps the groove complementary.
    const bassStarts = project.lanes[4]!.placements.map((placement) => placement.startTick)
    expect(bassStarts.length).toBeGreaterThan(0)
    expect(bassStarts.every((tick) => tick % 8 !== 0)).toBe(true)
    expect(bassStarts.some((tick) => tick % 8 === 4)).toBe(true)

    // The kick breathes at phrase boundaries: at least one 8-bar phrase-final
    // bar (bar % 8 === 7) outside the breakdown carries no kick hit.
    const kickTicks = project.lanes[0]!.placements.map((placement) => placement.startTick)
    const kickedBars = new Set(kickTicks.map((tick) => Math.floor(tick / 32)))
    const breakdownBars = new Set(
      Array.from({ length: breakdownEnd / 32 - breakdownStart / 32 }, (_, index) => breakdownStart / 32 + index)
    )
    const phraseFinalBars = Array.from({ length: Math.ceil(TOTAL_BARS / 8) }, (_, index) => index * 8 + 7)
      .filter((bar) => bar < TOTAL_BARS && !breakdownBars.has(bar))
    expect(phraseFinalBars.some((bar) => !kickedBars.has(bar))).toBe(true)

    const styleBiasedSamples = [
      result.selectedSamples.groovePrimary,
      result.selectedSamples.grooveAlternate,
      result.selectedSamples.sequencePrimary,
      result.selectedSamples.sequenceAlternate,
      result.selectedSamples.stabPrimary,
      result.selectedSamples.stabAlternate,
      result.selectedSamples.layerLeft,
      result.selectedSamples.layerRight
    ]
    expect(styleBiasedSamples.every((sample) =>
      /tribal|pulse|space|groove|star|cosmic|dark|chord|stab|organ|pad|dream|deep/i.test(sample.sampleName)
    )).toBe(true)

    expect(project.lanes.every((lane) => lane.sends?.every((send) => send === 0))).toBe(true)
    expect(project.fxBuses?.every((bus) => bus.module.type === 'empty')).toBe(true)
    expect(project.masterBus).toEqual(createDefaultMasterBusState())
    expect(project.masterBus.preset).toBe('Cheat Sheet')
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

    expect(first.fileName).toBe('Ambient-Cosmic-Techno-Mixer-Test-001.mixjam')
    expect(second.fileName).toBe('Ambient-Cosmic-Techno-Mixer-Test-002.mixjam')
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

    const sentinelPath = join(outputDir, 'Ambient-Cosmic-Techno-Mixer-Test-010.mixjam')
    await writeFile(sentinelPath, 'do not overwrite')
    const afterGap = await generateMixerTestSong({ samplesDir, outputDir, seed: 'repeatable' })
    expect(afterGap.fileName).toBe('Ambient-Cosmic-Techno-Mixer-Test-011.mixjam')
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
