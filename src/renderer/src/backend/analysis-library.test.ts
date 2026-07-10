// @vitest-environment node
import sqlite3InitModule, { type Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DB } from './sql'
import { initSchema } from './schema'
import {
  applyAnalysisResult,
  ensureScanRoot,
  querySamples,
  updateMetadata,
  updateSampleAnalysis,
  upsertStub
} from './library'

let sqlite3: Sqlite3Static
let db: DB
let sampleId: number

beforeAll(async () => { sqlite3 = await sqlite3InitModule() })
beforeEach(() => {
  db = new DB(sqlite3, new sqlite3.oo1.DB(':memory:'))
  initSchema(db)
  const root = ensureScanRoot(db, 'analysis-root')
  upsertStub(db, root, 'kick.wav', 'kick.wav', 'wav', 100, 100)
  updateMetadata(db, root, 'kick.wav', 0.5, 44100, 1)
  sampleId = db.prepare('SELECT id FROM samples WHERE relpath = ?').get<{ id: number }>('kick.wav')!.id
})
afterEach(() => db.close())

describe('analysis persistence', () => {
  it('stores automatic values with analysis provenance', () => {
    applyAnalysisResult(db, sampleId, { bpm: 120, musicalKey: 'C', sampleType: 'Kick' })
    const sample = querySamples(db, { rootId: 'analysis-root' }).rows[0]
    expect(sample).toMatchObject({
      bpm: 120,
      bpmSource: 'analysis',
      musicalKey: 'C',
      musicalKeySource: 'analysis',
      sampleType: 'Kick',
      sampleTypeSource: 'analysis'
    })
  })

  it('AC-006/007: manual overrides are not overwritten by later analysis', () => {
    updateSampleAnalysis(db, sampleId, { bpm: 133, musicalKey: 'Am', sampleType: 'Bass' })
    applyAnalysisResult(db, sampleId, { bpm: 120, musicalKey: 'C', sampleType: 'Kick' })
    expect(querySamples(db, { rootId: 'analysis-root' }).rows[0]).toMatchObject({
      bpm: 133,
      bpmSource: 'manual',
      musicalKey: 'Am',
      musicalKeySource: 'manual',
      sampleType: 'Bass',
      sampleTypeSource: 'manual'
    })
  })

  it('AC-008: clearing one override makes that field analyzable again', () => {
    updateSampleAnalysis(db, sampleId, { bpm: 133, musicalKey: 'Am' })
    updateSampleAnalysis(db, sampleId, { bpm: null })
    applyAnalysisResult(db, sampleId, { bpm: 120, musicalKey: 'C', sampleType: 'Kick' })
    expect(querySamples(db, { rootId: 'analysis-root' }).rows[0]).toMatchObject({
      bpm: 120,
      bpmSource: 'analysis',
      musicalKey: 'Am',
      musicalKeySource: 'manual'
    })
  })

  it('rejects BPM values outside the 20-400 range', () => {
    expect(() => updateSampleAnalysis(db, sampleId, { bpm: 10 }))
      .toThrow('BPM must be between 20 and 400')
    expect(() => updateSampleAnalysis(db, sampleId, { bpm: 500 }))
      .toThrow('BPM must be between 20 and 400')
    expect(() => updateSampleAnalysis(db, sampleId, { bpm: Number.NaN }))
      .toThrow('BPM must be between 20 and 400')
  })

  it('rejects invalid musical key formats', () => {
    expect(() => updateSampleAnalysis(db, sampleId, { musicalKey: 'H' }))
      .toThrow('Musical key must look like C, C#, Am, or Bbm')
    expect(() => updateSampleAnalysis(db, sampleId, { musicalKey: 'Xm' }))
      .toThrow('Musical key must look like C, C#, Am, or Bbm')
  })

  it('rejects invalid sample type values', () => {
    expect(() => updateSampleAnalysis(db, sampleId, { sampleType: 'Guitar' as never }))
      .toThrow('Invalid sample type')
  })
})
