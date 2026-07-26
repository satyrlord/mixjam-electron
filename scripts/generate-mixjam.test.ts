import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseProject } from '../src/renderer/src/project/project-file'
import { serializeProject } from '../src/renderer/src/project/project-file'
import { createDefaultProjectState } from '../src/renderer/src/project/project-state'
import { computeMixJamMetrics } from '../src/shared/mixjam-metrics'
import { parseAuditArgs, readAuditProject, runAuditMixJam } from './audit-mixjam'
import { loadCorpusCandidates } from './generate-mixjam-corpus'
import { parseGenerateMixJamArgs, runGenerateMixJam } from './generate-mixjam'
import { measurableProjectFromDocument } from './mixjam-metrics-project'

let temporaryRoot = ''

beforeEach(() => {
  temporaryRoot = mkdtempSync(join(tmpdir(), 'mixjam-cli-test-'))
})

afterEach(() => {
  rmSync(temporaryRoot, { recursive: true, force: true })
})

function wavBytes(durationSeconds: number): Buffer {
  const sampleRate = 8_000
  const channels = 1
  const bytesPerSample = 2
  const dataBytes = Math.round(durationSeconds * sampleRate * channels * bytesPerSample)
  const buffer = Buffer.alloc(44 + dataBytes)
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(36 + dataBytes, 4)
  buffer.write('WAVE', 8, 'ascii')
  buffer.write('fmt ', 12, 'ascii')
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(channels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28)
  buffer.writeUInt16LE(channels * bytesPerSample, 32)
  buffer.writeUInt16LE(bytesPerSample * 8, 34)
  buffer.write('data', 36, 'ascii')
  buffer.writeUInt32LE(dataBytes, 40)
  return buffer
}

function writeSample(root: string, relpath: string, durationSeconds: number): void {
  const target = join(root, ...relpath.split('/'))
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, wavBytes(durationSeconds))
}

function createCorpus(root: string): void {
  const samples: ReadonlyArray<readonly [string, number]> = [
    ['Drum/KICK001.wav', 0.25],
    ['Drum/KICK002.wav', 0.3],
    ['Drum/SNARE001.wav', 0.25],
    ['Drum/SNARE002.wav', 0.3],
    ['Drum/HIHAT001.wav', 0.15],
    ['Drum/HIHAT002.wav', 0.2],
    ['Drum/PERC001.wav', 0.25],
    ['Drum/PERC002.wav', 0.3],
    ['Bass/BASS001_140_A_SC1.wav', 240 / 140],
    ['Bass/BASS002_140_A_SC1.wav', 480 / 140],
    ['Keys/SYNTH001_140_A_SC1.wav', 240 / 140],
    ['Keys/SYNTH002_140_A_SC1.wav', 480 / 140],
    ['Loop/LOOP001_140_A_SC1.wav', 240 / 140],
    ['Loop/LOOP002_140_A_SC1.wav', 480 / 140],
    ['Voice/VOCAL001_140_A_SC1.wav', 240 / 140],
    ['Voice/VOCAL002_140_A_SC1.wav', 480 / 140],
    ['Sphere/SPHERE001_140_A_SC1.wav', 960 / 140],
    ['Sphere/SPHERE002_140_A_SC1.wav', 1_920 / 140],
    ['Effect/RISER001.wav', 2],
    ['Effect/RISER002.wav', 2.5],
    ['Effect/IMPACT001.wav', 0.25],
    ['Effect/IMPACT002.wav', 0.3],
    ['Xtra/TEXTURE001.wav', 2],
    ['Xtra/TEXTURE002.wav', 2.5]
  ]
  for (const [relpath, duration] of samples) writeSample(root, relpath, duration)
}

describe('MixJam CLI arguments', () => {
  it('rejects unknown, missing, and invalid generator options', () => {
    expect(() => parseGenerateMixJamArgs(['--unknown', 'value'])).toThrow('Unknown option: --unknown')
    expect(() => parseGenerateMixJamArgs(['--profile', 'techno'])).toThrow('Missing required option --bpm')
    expect(() => parseGenerateMixJamArgs([
      '--profile', 'techno', '--bpm', 'fast', '--samples-dir', temporaryRoot
    ])).toThrow('Option --bpm must be a number')
    expect(() => parseGenerateMixJamArgs(['--profile'])).toThrow('Option --profile needs a value')
  })

  it('parses a complete generator invocation and audit options', () => {
    const parsed = parseGenerateMixJamArgs([
      '--profile', 'techno', '--bpm', '140', '--duration', '180',
      '--samples-dir', temporaryRoot, '--seed', 'stable', '--intensity', 'high'
    ])
    expect(parsed).toMatchObject({
      profile: 'techno', bpm: 140, durationSeconds: 180, seed: 'stable', intensity: 'high'
    })
    expect(parseAuditArgs(['project.mixjam', '--baseline'])).toEqual({
      inputs: ['project.mixjam'], baseline: true, emitBaseline: null
    })
    expect(() => parseAuditArgs(['--unknown'])).toThrow('Unknown option: --unknown')
    expect(() => parseAuditArgs([])).toThrow('Usage: audit-mixjam')
  })
})

describe('MixJam CLI project validation', () => {
  it('rejects malformed and old project documents through the canonical parser', () => {
    const malformed = join(temporaryRoot, 'malformed.mixjam')
    const old = join(temporaryRoot, 'old.mixjam')
    writeFileSync(malformed, JSON.stringify({ song: { bpm: 140 }, lanes: [] }), 'utf8')
    writeFileSync(old, JSON.stringify({ formatVersion: 6, song: { bpm: 140 }, lanes: [] }), 'utf8')

    expect(() => readAuditProject(malformed)).toThrow(/unsupported format version.*version 7/i)
    expect(() => readAuditProject(old)).toThrow(/old\.mixjam.*unsupported format version/i)
  })

  it('audits only persisted stereo-pair evidence as pair pan', () => {
    const project = createDefaultProjectState()
    project.lanes = project.lanes.slice(0, 4).map((lane, index) => ({
      ...lane,
      pan: [-0.5, 0.5, -0.3, 0.3][index]!,
      stereoPairId: index < 2 ? 'stereo-pair-1234abcd' : null,
      placements: [{
        id: `placement-${index}`,
        samplePath: `Samples/sample-${index}.wav`,
        sampleName: `sample-${index}.wav`,
        nativeBPM: 140,
        startTick: 0,
        durationTicks: 32,
        durationSeconds: 1,
        slot: index
      }]
    }))
    const projectPath = join(temporaryRoot, 'pan-evidence.mixjam')
    writeFileSync(projectPath, serializeProject(project, {
      appVersion: 'test',
      createdAt: '2026-07-26T00:00:00.000Z',
      modifiedAt: '2026-07-26T00:00:00.000Z'
    }), 'utf8')
    const measurable = measurableProjectFromDocument(parseProject(readFileSync(projectPath, 'utf8')))
    const metrics = computeMixJamMetrics(measurable)
    expect(metrics.maxAbsPanPair).toBe(0.5)
    expect(metrics.maxAbsPanNonPair).toBe(0.3)

    let output = ''
    runAuditMixJam([projectPath], (text) => { output += text })
    expect(output).toContain('0.30 / 0.50')
  })

  it('loads WAV candidates, generates a strict project, and emits a baseline', () => {
    const corpus = join(temporaryRoot, 'corpus')
    const output = join(temporaryRoot, 'output')
    createCorpus(corpus)
    writeFileSync(join(corpus, 'broken.wav'), 'not a wave', 'utf8')

    const loaded = loadCorpusCandidates(corpus, null)
    expect(loaded.skipped).toBe(1)
    expect(loaded.candidates).toHaveLength(24)
    expect(loaded.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ relpath: 'Drum/KICK001.wav', sampleType: 'Kick', duration: 0.25 }),
      expect.objectContaining({ relpath: 'Effect/RISER001.wav', plannerKind: 'riser' }),
      expect.objectContaining({ relpath: 'Bass/BASS001_140_A_SC1.wav', bpm: 140, poolToken: '140/A' })
    ]))

    let generatorOutput = ''
    const projectPath = runGenerateMixJam([
      '--profile', 'techno', '--bpm', '140', '--duration', '180',
      '--samples-dir', corpus, '--output-dir', output, '--name', 'integration', '--seed', 'stable'
    ], (text) => { generatorOutput += text })
    const parsed = parseProject(readFileSync(projectPath, 'utf8'))
    expect(parsed.formatVersion).toBe(7)
    expect(parsed.generator).toMatchObject({ profileId: 'techno', seed: 'stable' })
    expect(generatorOutput).toContain('Envelope:')
    const measurable = measurableProjectFromDocument(parsed)
    expect(measurable.lanes.flatMap((lane) => lane.placements).some((placement) =>
      placement.sampleRef.includes('_140_A_SC1.wav') && placement.nativeBPM === 140
    )).toBe(true)

    const baselinePath = join(temporaryRoot, 'baseline.json')
    let auditOutput = ''
    expect(runAuditMixJam([projectPath, '--emit-baseline', baselinePath], (text) => {
      auditOutput += text
    })).toBe(0)
    expect(auditOutput).toContain('Wrote 1 reference projects')
    expect(JSON.parse(readFileSync(baselinePath, 'utf8'))).toMatchObject({
      generatedFrom: ['integration'],
      projects: { integration: expect.any(Object) }
    })
  })
})
