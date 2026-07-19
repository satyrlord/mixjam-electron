// @vitest-environment node
import sqlite3InitModule, { type Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DB } from './sql'
import { initSchema } from './schema'
import {
  applyAnalysisResult,
  applyContextualAnalysisResult,
  analysisGroupContainsRelpath,
  getCanonicalRootAnalysisSummary,
  listStoredAnalysisEvidence,
  reconcileAnalysisGroups,
  updateSampleAnalysis
} from './analysis-persistence'
import { querySamples } from './browser-library-persistence'
import {
  ensureScanRoot,
  updateMetadata,
  upsertStub
} from './indexed-sample-persistence'
import { canonicalMusicalKey, parseMusicalKey } from './musical-key'

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

describe('musical key normalization', () => {
  it.each([
    ['C', { root: 0, minor: false }, 'C'],
    ['Db', { root: 1, minor: false }, 'C#'],
    ['E#m', { root: 5, minor: true }, 'Fm'],
    ['Cbm', { root: 11, minor: true }, 'Bm']
  ])('parses and canonicalizes %s', (input, parsed, canonical) => {
    expect(parseMusicalKey(input)).toEqual(parsed)
    expect(canonicalMusicalKey(input)).toBe(canonical)
  })

  it.each(['', 'H', 'c', 'C##', 'C major'])('rejects invalid key %j', (input) => {
    expect(parseMusicalKey(input)).toBeNull()
    expect(canonicalMusicalKey(input)).toBeNull()
  })
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
    expect(listStoredAnalysisEvidence(db, db.prepare(
      'SELECT root_id FROM samples WHERE id = ?'
    ).get<{ root_id: number }>(sampleId)!.root_id)[0]).toMatchObject({
      bpm: 120,
      musicalKey: 'C'
    })
    applyContextualAnalysisResult(db, sampleId, { bpm: 140, musicalKey: 'Dm' })
    expect(querySamples(db, { rootId: 'analysis-root' }).rows[0]).toMatchObject({
      bpm: 133,
      bpmSource: 'manual',
      musicalKey: 'Am',
      musicalKeySource: 'manual'
    })
  })

  it('reconciles only changed group summaries and exposes canonical clusters', () => {
    const rootId = db.prepare('SELECT root_id FROM samples WHERE id = ?')
      .get<{ root_id: number }>(sampleId)!.root_id
    const groups = [
      {
        relpathPrefix: '', depth: 0, sampleCount: 8, state: 'mixed' as const,
        bpm: null, musicalKey: null, bpmSupport: 0, keySupport: 0, confidence: 0
      },
      {
        relpathPrefix: 'Product/Slow', depth: 2, sampleCount: 4, state: 'resolved' as const,
        bpm: 100, musicalKey: 'Am', bpmSupport: 1, keySupport: 1, confidence: 1
      },
      {
        relpathPrefix: 'Product/Fast', depth: 2, sampleCount: 4, state: 'resolved' as const,
        bpm: 140, musicalKey: 'Dm', bpmSupport: 1, keySupport: 1, confidence: 1
      }
    ]
    reconcileAnalysisGroups(db, rootId, groups)
    const before = db.prepare(
      `SELECT rowid FROM analysis_groups
       WHERE root_id = ? AND relpath_prefix = 'Product/Slow'`
    ).get<{ rowid: number }>(rootId)!.rowid

    reconcileAnalysisGroups(db, rootId, [
      { ...groups[0]!, confidence: 0.1 },
      groups[1]!,
      groups[2]!
    ])

    expect(db.prepare(
      `SELECT rowid FROM analysis_groups
       WHERE root_id = ? AND relpath_prefix = 'Product/Slow'`
    ).get<{ rowid: number }>(rootId)!.rowid).toBe(before)
    expect(getCanonicalRootAnalysisSummary(db, 'analysis-root')).toMatchObject({
      state: 'mixed',
      clusters: [
        { relpathPrefix: 'Product/Fast', bpm: 140 },
        { relpathPrefix: 'Product/Slow', bpm: 100 }
      ]
    })
  })

  it('removes stale groups and handles cohort paths and an empty root summary', () => {
    const rootId = db.prepare('SELECT root_id FROM samples WHERE id = ?')
      .get<{ root_id: number }>(sampleId)!.root_id
    reconcileAnalysisGroups(db, rootId, [{
      relpathPrefix: 'Drums', depth: 1, sampleCount: 1, state: 'resolved',
      bpm: 120, musicalKey: 'C', bpmSupport: 1, keySupport: 1, confidence: 1
    }])
    reconcileAnalysisGroups(db, rootId, [])
    expect(getCanonicalRootAnalysisSummary(db, 'analysis-root')).toBeNull()
    expect(analysisGroupContainsRelpath('@cohort/Drums/kick', 'Drums/kick_01.wav')).toBe(true)
    expect(analysisGroupContainsRelpath('@cohort/Drums/kick', 'Bass/kick_01.wav')).toBe(false)
    expect(analysisGroupContainsRelpath('@cohort', 'kick.wav')).toBe(false)
    expect(analysisGroupContainsRelpath('Drums', 'Drums/Kicks/kick.wav')).toBe(true)
  })

  it('replaces prior automatic values, including newly absent results', () => {
    applyAnalysisResult(db, sampleId, { bpm: 90, musicalKey: 'C', sampleType: 'Kick' })
    applyAnalysisResult(db, sampleId, { bpm: null, musicalKey: null, sampleType: 'Bass' })

    expect(querySamples(db, { rootId: 'analysis-root' }).rows[0]).toMatchObject({
      bpm: null,
      bpmSource: null,
      musicalKey: null,
      musicalKeySource: null,
      sampleType: 'Bass',
      sampleTypeSource: 'analysis'
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

  it('validates a multi-field patch before writing any field', () => {
    expect(() => updateSampleAnalysis(db, sampleId, { bpm: 128, musicalKey: 'H' }))
      .toThrow('Musical key must look like C, C#, Am, or Bbm')

    expect(querySamples(db, { rootId: 'analysis-root' }).rows[0]).toMatchObject({
      bpm: null,
      bpmSource: null,
      musicalKey: null,
      musicalKeySource: null
    })
  })

  it('preserves the accepted spelling of manual flat keys', () => {
    updateSampleAnalysis(db, sampleId, { musicalKey: 'Bbm' })

    expect(querySamples(db, { rootId: 'analysis-root' }).rows[0]).toMatchObject({
      musicalKey: 'Bbm',
      musicalKeySource: 'manual'
    })
  })

  it('rejects invalid sample type values', () => {
    expect(() => updateSampleAnalysis(db, sampleId, { sampleType: 'Guitar' as never }))
      .toThrow('Invalid sample type')
  })

  it('accepts an empty manual-analysis patch as a no-op', () => {
    expect(() => updateSampleAnalysis(db, sampleId, {})).not.toThrow()
  })
})
