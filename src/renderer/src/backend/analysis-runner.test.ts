// @vitest-environment node
import sqlite3InitModule, { type Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { AnalysisProgress } from '../../../shared/backend-api'
import { runPendingAnalysis, runSingleAnalysis } from './analysis-runner'
import { ensureScanRoot, querySamples, updateMetadata, upsertStub } from './library'
import { initSchema } from './schema'
import { DB } from './sql'

function makeWav(name: string, duration = 0.25, sampleRate = 8000): File {
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
    view.setInt16(44 + frame * 2, Math.round(sample * 16000), true)
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
    const events: AnalysisProgress[] = []

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

  it('stops a stale batch before reading or updating candidates', async () => {
    addCandidate('cancelled.wav')
    const events: AnalysisProgress[] = []

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

  it('advances past missing and unsupported candidate files', async () => {
    addCandidate('missing.wav')
    addCandidate('unsupported.wav')
    const events: AnalysisProgress[] = []

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
        expect.objectContaining({ relpath: 'missing.wav', sampleType: null }),
        expect.objectContaining({ relpath: 'unsupported.wav', sampleType: null })
      ]))
  })

  it('reports and persists a single-sample analysis', async () => {
    const sampleId = addCandidate('single.wav')
    const events: AnalysisProgress[] = []

    await runSingleAnalysis(db, sampleId, makeWav('single.wav'), (progress) => events.push(progress))

    expect(events).toEqual([
      { status: 'analyzing', analyzed: 0, total: 1 },
      { status: 'analyzing', analyzed: 1, total: 1 }
    ])
    expect(querySamples(db, { rootId: 'analysis-runner-root' }).rows[0].sampleTypeSource).toBe('analysis')
  })

  it('completes single-sample progress when decoding is unsupported', async () => {
    const sampleId = addCandidate('unsupported-single.wav')
    const events: AnalysisProgress[] = []

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
