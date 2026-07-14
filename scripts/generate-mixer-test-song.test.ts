import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { isProjectRelativePath, parseProject } from '../src/renderer/src/project/project-file'
import {
  generateMixerTestSong,
  parseCliArgs,
  REQUIRED_CATEGORIES,
  SONG_BPM,
  SONG_DURATION_SECONDS,
  TOTAL_TICKS,
  TRANCE_SECTIONS
} from './generate-mixer-test-song'

const TEST_SAMPLE_REFS = [
  'Drum/KICK001_TRNCE_140_X_SC4.wav',
  'Drum/CLAP001_TRNCE_140_X_SC4.wav',
  'Drum/PERCUSSN001_TRNCE_140_X_SC4.wav',
  'Beats/TRANCE_BEATS001_140_X_SL1.wav',
  'Loop/DRUMLOOP001_TRNCE_140_X_SC4(L).wav',
  'Loop/DRUMLOOP001_TRNCE_140_X_SC4(R).wav',
  'Bass/SNTHBASS001_TRNCE_140_A_SC4.wav',
  'Sphere/SPHERE001_TRNCE_140_A_SC4(L).wav',
  'Sphere/SPHERE001_TRNCE_140_A_SC4(R).wav',
  'Keys/SYNTH001_TRNCE_140_A_SC4(L).wav',
  'Keys/SYNTH001_TRNCE_140_A_SC4(R).wav',
  'honey piano A.wav',
  'Vocals/TRANCE_VOCALS001_140_X_SL1.wav',
  'Xtra/TRANCE_EXTRA001_140_A_SL1.wav',
  'FX/FX001_TRNCE_140_X_SC4(L).wav',
  'FX/FX001_TRNCE_140_X_SC4(R).wav'
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

async function createFixture(): Promise<{ samplesDir: string; outputDir: string }> {
  const root = await mkdtemp(join(tmpdir(), 'mixjam-generator-'))
  temporaryRoots.push(root)
  const samplesDir = join(root, 'samples')
  const outputDir = join(root, 'songs')
  const oneBarSeconds = 4 * 60 / SONG_BPM
  for (const sampleRef of TEST_SAMPLE_REFS) {
    const filePath = join(samplesDir, ...sampleRef.split('/'))
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, makePcmWav(oneBarSeconds))
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
    })),
    channels: project.channels
  }
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('generateMixerTestSong', () => {
  it('writes a production-parseable 48-bar trance arrangement with all categories and FX types', async () => {
    const { samplesDir, outputDir } = await createFixture()
    const result = await generateMixerTestSong({ samplesDir, outputDir, seed: 'fixture-seed' })
    const project = parseProject(await readFile(result.filePath, 'utf8'))

    expect(project.song.bpm).toBe(SONG_BPM)
    expect(result.durationSeconds).toBeCloseTo(SONG_DURATION_SECONDS, 6)
    expect(project.lanes).toHaveLength(16)
    expect(project.lanes.every((lane) => lane.placements.length > 0)).toBe(true)

    const placements = project.lanes.flatMap((lane) => lane.placements)
    const endTicks = placements.map((placement) => placement.startTick + placement.durationTicks)
    expect(Math.max(...endTicks)).toBe(TOTAL_TICKS)
    expect(endTicks.every((endTick) => endTick <= TOTAL_TICKS)).toBe(true)
    expect(placements.every((placement) => isProjectRelativePath(placement.samplePath))).toBe(true)

    const categories = new Set(placements.map((placement) =>
      placement.samplePath.includes('/') ? placement.samplePath.split('/')[0]! : 'Unsorted'
    ))
    expect([...categories].sort()).toEqual([...REQUIRED_CATEGORIES].sort())

    for (const section of TRANCE_SECTIONS) {
      const startTick = section.startBar * 32
      const endTick = section.endBar * 32
      expect(placements.some((placement) =>
        overlaps(placement.startTick, placement.durationTicks, startTick, endTick)
      ), section.name).toBe(true)
    }

    const breakdownStart = 16 * 32
    const breakdownEnd = 24 * 32
    expect(project.lanes.slice(0, 7).flatMap((lane) => lane.placements).some((placement) =>
      overlaps(placement.startTick, placement.durationTicks, breakdownStart, breakdownEnd)
    )).toBe(false)

    const anthemStart = 32 * 32
    const anthemEnd = 40 * 32
    for (const laneIndex of [0, 1, 2, 3, 4, 5, 6, 9, 10, 11]) {
      expect(project.lanes[laneIndex]!.placements.some((placement) =>
        overlaps(placement.startTick, placement.durationTicks, anthemStart, anthemEnd)
      ), project.lanes[laneIndex]!.name).toBe(true)
    }

    const effectTypes = new Set(project.channels.flatMap((channel) =>
      channel.effects.map((effect) => effect.type)
    ))
    expect(effectTypes).toEqual(new Set(['delay', 'reverb', 'compressor']))
    expect(new Set(project.channels.map((channel) => channel.gain)).size).toBeGreaterThan(4)
    expect(project.channels.some((channel) => channel.pan < 0)).toBe(true)
    expect(project.channels.some((channel) => channel.pan > 0)).toBe(true)
  })

  it('reproduces seeded musical data and reserves monotonically increasing files', async () => {
    const { samplesDir, outputDir } = await createFixture()
    const first = await generateMixerTestSong({ samplesDir, outputDir, seed: 'repeatable' })
    const second = await generateMixerTestSong({ samplesDir, outputDir, seed: 'repeatable' })

    expect(first.fileName).toBe('Classic-Trance-Mixer-Test-001.mixjam')
    expect(second.fileName).toBe('Classic-Trance-Mixer-Test-002.mixjam')
    expect(Object.values(first.selectedSamples).map((sample) => sample.sampleRef)).toEqual(
      Object.values(second.selectedSamples).map((sample) => sample.sampleRef)
    )
    expect(normalizedArrangement(first.project)).toEqual(normalizedArrangement(second.project))

    const sentinelPath = join(outputDir, 'Classic-Trance-Mixer-Test-010.mixjam')
    await writeFile(sentinelPath, 'do not overwrite')
    const afterGap = await generateMixerTestSong({ samplesDir, outputDir, seed: 'repeatable' })
    expect(afterGap.fileName).toBe('Classic-Trance-Mixer-Test-011.mixjam')
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
