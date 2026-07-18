// @vitest-environment node
import sqlite3InitModule, { type Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  runPendingAnalysis,
  runSingleAnalysis,
  runUniformFolderCalibration,
  type AnalysisPhaseProgress,
  type CalibrationPhaseProgress
} from './analysis-runner'
import { querySamples } from './browser-library-persistence'
import { ensureScanRoot, updateMetadata, upsertStub } from './indexed-sample-persistence'
import { initSchema } from './schema'
import { DB } from './sql'

function makeWav(name: string, duration = 0.25, sampleRate = 8000, amplitude = 16000): File {
  const frames = Math.round(duration * sampleRate)
  const dataSize = frames * 2
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const writeAscii = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index++) {
      view.setUint8(offset + index, value.charCodeAt(index))
    }
  }

  writeAscii(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(36, 'data')
  view.setUint32(40, dataSize, true)
  for (let frame = 0; frame < frames; frame++) {
    const sample = Math.sin(2 * Math.PI * 120 * frame / sampleRate)
    view.setInt16(44 + frame * 2, Math.round(sample * amplitude), true)
  }

  return new File([buffer], name, { type: 'audio/wav' })
}

function makePulseWav(name: string, bpm: number, duration: number, sampleRate = 8000): File {
  const frames = Math.round(duration * sampleRate)
  const dataSize = frames * 2
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const ascii = (offset: number, text: string): void => {
    for (let index = 0; index < text.length; index++) {
      view.setUint8(offset + index, text.charCodeAt(index))
    }
  }
  ascii(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); ascii(8, 'WAVE')
  ascii(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true)
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true)
  view.setUint16(34, 16, true); ascii(36, 'data'); view.setUint32(40, dataSize, true)
  const beatFrames = Math.round(sampleRate * 60 / bpm)
  const pulseFrames = Math.round(sampleRate * 0.08)
  for (let beat = 0; beat < frames; beat += beatFrames) {
    for (let offset = 0; offset < pulseFrames && beat + offset < frames; offset++) {
      const envelope = Math.exp(-offset / (sampleRate * 0.015))
      const sample = envelope * Math.sin(2 * Math.PI * 80 * offset / sampleRate)
      view.setInt16(44 + (beat + offset) * 2, Math.round(sample * 32767), true)
    }
  }
  return new File([buffer], name, { type: 'audio/wav' })
}

let sqlite3: Sqlite3Static
let db: DB
let rootId: number

beforeAll(async () => { sqlite3 = await sqlite3InitModule() })
beforeEach(() => {
  db = new DB(sqlite3, new sqlite3.oo1.DB(':memory:'))
  initSchema(db)
  rootId = ensureScanRoot(db, 'analysis-runner-root')
})
afterEach(() => db.close())

function addCandidate(relpath: string): number {
  upsertStub(db, rootId, relpath, relpath, 'wav', 4044, 100)
  updateMetadata(db, rootId, relpath, 0.25, 8000, 1)
  return db.prepare('SELECT id FROM samples WHERE relpath = ?').get<{ id: number }>(relpath)!.id
}

describe('analysis runner', () => {
  it('reports batch progress and isolates an unreadable file', async () => {
    addCandidate('good.wav')
    addCandidate('unreadable.wav')
    const unreadable = {
      arrayBuffer: async () => { throw new Error('file disappeared') }
    } as unknown as File
    const events: AnalysisPhaseProgress[] = []

    await runPendingAnalysis(
      db,
      rootId,
      new Map([['good.wav', makeWav('good.wav')], ['unreadable.wav', unreadable]]),
      (progress) => events.push(progress),
      () => true
    )

    expect(events).toEqual([
      { status: 'analyzing', analyzed: 0, total: 2 },
      { status: 'analyzing', analyzed: 1, total: 2 },
      { status: 'analyzing', analyzed: 2, total: 2 }
    ])
    const rows = querySamples(db, { rootId: 'analysis-runner-root' }).rows
    expect(rows.find((sample) => sample.relpath === 'good.wav')?.sampleTypeSource).toBe('analysis')
    expect(rows.find((sample) => sample.relpath === 'unreadable.wav')?.sampleType).toBeNull()
  })

  it('persists each raw result before advancing its progress', async () => {
    addCandidate('first.wav')
    addCandidate('second.wav')
    const observedSources: Array<string | null> = []

    await runPendingAnalysis(
      db,
      rootId,
      new Map([
        ['first.wav', makeWav('first.wav')],
        ['second.wav', makeWav('second.wav')]
      ]),
      (progress) => {
        if (progress.analyzed === 1) {
          observedSources.push(querySamples(db, { rootId: 'analysis-runner-root' }).rows
            .find((sample) => sample.relpath === 'first.wav')?.sampleTypeSource ?? null)
        }
      },
      () => true
    )

    expect(observedSources).toEqual(['analysis'])
  })

  it('performs zero decodes on a second unchanged automatic analysis pass', async () => {
    addCandidate('unchanged.wav')
    const bytes = await makeWav('unchanged.wav').arrayBuffer()
    let decodeReads = 0
    const countedFile = {
      arrayBuffer: async () => {
        decodeReads++
        return bytes
      }
    } as unknown as File
    const files = new Map([['unchanged.wav', countedFile]])

    await runPendingAnalysis(db, rootId, files, () => undefined, () => true)
    await runPendingAnalysis(db, rootId, files, () => undefined, () => true)

    expect(decodeReads).toBe(1)
  })

  it('stops a stale batch before reading or updating candidates', async () => {
    addCandidate('cancelled.wav')
    const events: AnalysisPhaseProgress[] = []

    await runPendingAnalysis(
      db,
      rootId,
      new Map([['cancelled.wav', makeWav('cancelled.wav')]]),
      (progress) => events.push(progress),
      () => false
    )

    expect(events).toEqual([{ status: 'analyzing', analyzed: 0, total: 1 }])
    expect(querySamples(db, { rootId: 'analysis-runner-root' }).rows[0].sampleType).toBeNull()
  })

  it('does not persist a result when the batch becomes stale during decoding', async () => {
    addCandidate('stale-after-analysis.wav')
    let currentChecks = 0

    await runPendingAnalysis(
      db,
      rootId,
      new Map([['stale-after-analysis.wav', makeWav('stale-after-analysis.wav')]]),
      () => undefined,
      () => ++currentChecks === 1
    )

    expect(querySamples(db, { rootId: 'analysis-runner-root' }).rows[0].sampleType).toBeNull()
  })

  it('advances past missing and unsupported candidate files', async () => {
    const missingId = addCandidate('missing.wav')
    const unsupportedId = addCandidate('unsupported.wav')
    for (const sampleId of [missingId, unsupportedId]) {
      db.prepare(
        `UPDATE samples SET bpm = 90, bpm_source = 'analysis',
         musical_key = 'C', musical_key_source = 'analysis',
         sample_type = 'Bass', sample_type_source = 'analysis' WHERE id = ?`
      ).run(sampleId)
    }
    const events: AnalysisPhaseProgress[] = []

    await runPendingAnalysis(
      db,
      rootId,
      new Map([['unsupported.wav', new File([new ArrayBuffer(12)], 'unsupported.wav')]]),
      (progress) => events.push(progress),
      () => true
    )

    expect(events.at(-1)).toEqual({ status: 'analyzing', analyzed: 2, total: 2 })
    expect(querySamples(db, { rootId: 'analysis-runner-root' }).rows)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          relpath: 'missing.wav', bpm: 90, musicalKey: 'C', sampleType: 'Bass'
        }),
        expect.objectContaining({
          relpath: 'unsupported.wav', bpm: null, musicalKey: null, sampleType: null
        })
      ]))
  })

  it('preserves stale analysis when reading current file bytes fails', async () => {
    const sampleId = addCandidate('read-failure.wav')
    db.prepare(
      `UPDATE samples SET bpm = 90, bpm_source = 'analysis',
       musical_key = 'C', musical_key_source = 'analysis',
       sample_type = 'Bass', sample_type_source = 'analysis' WHERE id = ?`
    ).run(sampleId)
    const unreadable = {
      arrayBuffer: async () => { throw new Error('temporarily locked') }
    } as unknown as File

    await runPendingAnalysis(
      db,
      rootId,
      new Map([['read-failure.wav', unreadable]]),
      () => undefined,
      () => true
    )

    expect(querySamples(db, { rootId: 'analysis-runner-root' }).rows[0]).toMatchObject({
      bpm: 90,
      bpmSource: 'analysis',
      musicalKey: 'C',
      musicalKeySource: 'analysis',
      sampleType: 'Bass',
      sampleTypeSource: 'analysis'
    })
  })

  it('reports progress after an unreadable first candidate and stops if that read makes the job stale', async () => {
    addCandidate('unreadable-first.wav')
    addCandidate('never-read.wav')
    let currentChecks = 0
    const unreadable = {
      arrayBuffer: async () => { throw new Error('temporarily locked') }
    } as unknown as File
    const events: AnalysisPhaseProgress[] = []

    await runPendingAnalysis(
      db,
      rootId,
      new Map([
        ['unreadable-first.wav', unreadable],
        ['never-read.wav', makeWav('never-read.wav')]
      ]),
      (progress) => events.push(progress),
      () => ++currentChecks === 1
    )

    expect(events).toEqual([{ status: 'analyzing', analyzed: 0, total: 2 }])
  })

  it('regular analysis preserves a mixed 24-file 100/150 BPM collection', async () => {
    const files = new Map<string, File>()
    for (let index = 0; index < 24; index++) {
      const bpm = index < 12 ? 100 : 150
      const relpath = `mixed-${bpm}-${index}.wav`
      addCandidate(relpath)
      files.set(relpath, makePulseWav(relpath, bpm, 8 * 60 / bpm))
    }

    await runPendingAnalysis(db, rootId, files, () => undefined, () => true)

    const rows = querySamples(db, { rootId: 'analysis-runner-root', limit: 30 }).rows
    const low = rows.filter((sample) => sample.relpath.includes('mixed-100-'))
    const high = rows.filter((sample) => sample.relpath.includes('mixed-150-'))
    expect(low).toHaveLength(12)
    expect(high).toHaveLength(12)
    expect(low.every((sample) => sample.bpm !== null && Math.abs(sample.bpm - 100) <= 5)).toBe(true)
    expect(high.every((sample) => sample.bpm !== null && Math.abs(sample.bpm - 150) <= 5)).toBe(true)
  })

  it('persists uniform-batch tempo calibration after per-file analysis', async () => {
    const files = new Map<string, File>()
    for (let index = 0; index < 16; index++) {
      const relpath = `uniform-${index}.wav`
      addCandidate(relpath)
      files.set(relpath, makePulseWav(relpath, 140, (index + 8) * 60 / 140))
    }

    await runUniformFolderCalibration(db, rootId, files, () => undefined, () => true)

    const rows = querySamples(db, { rootId: 'analysis-runner-root', limit: 20 }).rows
    expect(rows).toHaveLength(16)
    expect(rows.every((sample) => sample.bpm === 140 && sample.bpmSource === 'analysis')).toBe(true)
  })

  it('refuses calibration when any indexed candidate cannot be inspected', async () => {
    addCandidate('missing.wav')
    const files = new Map<string, File>()
    for (let index = 0; index < 16; index++) {
      const relpath = `uniform-readable-${index}.wav`
      addCandidate(relpath)
      files.set(relpath, makePulseWav(relpath, 140, (index + 8) * 60 / 140))
    }
    const events: CalibrationPhaseProgress[] = []

    await expect(runUniformFolderCalibration(
      db,
      rootId,
      files,
      (progress) => events.push(progress),
      () => true
    )).rejects.toThrow('Calibration requires a readable file: missing.wav')

    expect(events).toEqual([{ status: 'calibrating', analyzed: 0, total: 17 }])
    expect(querySamples(db, { rootId: 'analysis-runner-root', limit: 20 }).rows
      .every((sample) => sample.sampleTypeSource === null)).toBe(true)
  })

  it('reports calibration read failures and unsupported current bytes', async () => {
    addCandidate('read-error.wav')
    const unreadable = {
      arrayBuffer: async () => { throw 'locked' }
    } as unknown as File
    await expect(runUniformFolderCalibration(
      db,
      rootId,
      new Map([['read-error.wav', unreadable]]),
      () => undefined,
      () => true
    )).rejects.toThrow('Calibration could not read read-error.wav: locked')

    db.close()
    db = new DB(sqlite3, new sqlite3.oo1.DB(':memory:'))
    initSchema(db)
    rootId = ensureScanRoot(db, 'analysis-runner-root')
    addCandidate('unsupported-calibration.wav')
    await expect(runUniformFolderCalibration(
      db,
      rootId,
      new Map([['unsupported-calibration.wav', new File([new ArrayBuffer(12)], 'unsupported.wav')]]),
      () => undefined,
      () => true
    )).rejects.toThrow('Calibration does not support unsupported-calibration.wav')
  })

  it('calibrates an empty folder without terminal progress', async () => {
    const events: CalibrationPhaseProgress[] = []
    await runUniformFolderCalibration(db, rootId, new Map(), (progress) => events.push(progress), () => true)
    expect(events).toEqual([{ status: 'calibrating', analyzed: 0, total: 0 }])
  })

  it('refreshes automatic values on re-scan while preserving manual fields', async () => {
    const files = new Map<string, File>()
    for (let index = 0; index < 16; index++) {
      const relpath = `refresh-${index}.wav`
      const sampleId = addCandidate(relpath)
      files.set(relpath, makeWav(relpath, (index + 1) * 60 / 140, 8000, 0))
      db.prepare(
        `UPDATE samples SET bpm = 90, bpm_source = 'analysis',
         musical_key = 'C', musical_key_source = 'analysis',
         sample_type = 'Bass', sample_type_source = 'analysis' WHERE id = ?`
      ).run(sampleId)
    }
    db.prepare(
      `UPDATE samples SET bpm = 133, bpm_source = 'manual',
       musical_key = 'Am', musical_key_source = 'manual',
       sample_type = 'Snare', sample_type_source = 'manual' WHERE relpath = 'refresh-0.wav'`
    ).run()

    await runPendingAnalysis(db, rootId, files, () => undefined, () => true)

    const rows = querySamples(db, { rootId: 'analysis-runner-root', limit: 20 }).rows
    expect(rows.find((sample) => sample.relpath === 'refresh-0.wav')).toMatchObject({
      bpm: 133,
      bpmSource: 'manual',
      musicalKey: 'Am',
      musicalKeySource: 'manual',
      sampleType: 'Snare',
      sampleTypeSource: 'manual'
    })
    expect(rows.filter((sample) => sample.relpath !== 'refresh-0.wav')
      .every((sample) => sample.bpm !== 90 && sample.sampleType !== 'Bass')).toBe(true)
  })

  it('keeps raw results durable but does not report completion when calibration is stale', async () => {
    const files = new Map<string, File>()
    for (let index = 0; index < 16; index++) {
      const relpath = `stale-calibration-${index}.wav`
      addCandidate(relpath)
      files.set(relpath, makeWav(relpath, (index + 1) * 60 / 140, 8000, 0))
    }
    const events: CalibrationPhaseProgress[] = []
    let currentChecks = 0

    await runUniformFolderCalibration(
      db,
      rootId,
      files,
      (progress) => events.push(progress),
      () => ++currentChecks <= 32
    )

    const rows = querySamples(db, { rootId: 'analysis-runner-root', limit: 20 }).rows
    expect(rows.every((sample) => sample.sampleTypeSource === 'analysis')).toBe(true)
    expect(rows.some((sample) => sample.bpm !== 140)).toBe(true)
    expect(events.at(-1)).toEqual({ status: 'calibrating', analyzed: 15, total: 16 })
  })

  it('reports and persists a single-sample analysis', async () => {
    const sampleId = addCandidate('single.wav')
    const events: AnalysisPhaseProgress[] = []

    await runSingleAnalysis(db, sampleId, makeWav('single.wav'), (progress) => events.push(progress))

    expect(events).toEqual([
      { status: 'analyzing', analyzed: 0, total: 1 },
      { status: 'analyzing', analyzed: 1, total: 1 }
    ])
    expect(querySamples(db, { rootId: 'analysis-runner-root' }).rows[0].sampleTypeSource).toBe('analysis')
  })

  it('completes single-sample progress when decoding is unsupported', async () => {
    const sampleId = addCandidate('unsupported-single.wav')
    const events: AnalysisPhaseProgress[] = []

    await runSingleAnalysis(
      db,
      sampleId,
      new File([new ArrayBuffer(12)], 'unsupported-single.wav'),
      (progress) => events.push(progress)
    )

    expect(events.at(-1)).toEqual({ status: 'analyzing', analyzed: 1, total: 1 })
    expect(querySamples(db, { rootId: 'analysis-runner-root' }).rows[0].sampleType).toBeNull()
  })
})
