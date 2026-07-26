// @vitest-environment node
import sqlite3InitModule, { type Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  analysisOwnsAnyFieldSql,
  analysisOwnsFieldSql,
  analyzedFieldChangesSql,
  assignAnalyzedFieldSql,
  clearAnalyzedFieldSql,
  PROVENANCE_FIELDS
} from './analysis-provenance'
import { initSchema } from './schema'
import { ensureScanRoot, updateMetadata, upsertStub } from './indexed-sample-persistence'
import { DB } from './sql'

let sqlite3: Sqlite3Static
let db: DB
let sampleId: number

beforeAll(async () => { sqlite3 = await sqlite3InitModule() })
beforeEach(() => {
  db = new DB(sqlite3, new sqlite3.oo1.DB(':memory:'))
  initSchema(db)
  const root = ensureScanRoot(db, 'provenance-root')
  upsertStub(db, root, 'kick.wav', 'kick.wav', 'wav', 100, 100)
  updateMetadata(db, root, 'kick.wav', 0.5, 44100, 1)
  sampleId = db.prepare('SELECT id FROM samples WHERE relpath = ?')
    .get<{ id: number }>('kick.wav')!.id
})
afterEach(() => db.close())

function pin(field: string, value: string | number): void {
  db.prepare(`UPDATE samples SET ${field} = ?, ${field}_source = 'manual' WHERE id = ?`)
    .run(value, sampleId)
}

describe('provenance predicates run as valid SQL', () => {
  it.each(PROVENANCE_FIELDS)('%s is analysis-owned until it is pinned', (field) => {
    const owns = (): number => db.prepare(
      `SELECT COUNT(*) AS count FROM samples WHERE id = ? AND ${analysisOwnsFieldSql(field)}`
    ).get<{ count: number }>(sampleId)!.count

    expect(owns()).toBe(1)
    pin(field, field === 'bpm' ? 128 : 'Am')
    expect(owns()).toBe(0)
  })

  it('a row stays a re-analysis candidate until every field is pinned', () => {
    const anyOwned = (): number => db.prepare(
      `SELECT COUNT(*) AS count FROM samples WHERE id = ? AND (${analysisOwnsAnyFieldSql()})`
    ).get<{ count: number }>(sampleId)!.count

    expect(anyOwned()).toBe(1)
    pin('bpm', 128)
    expect(anyOwned()).toBe(1)
    pin('musical_key', 'Am')
    expect(anyOwned()).toBe(1)
    pin('sample_type', 'Bass')
    expect(anyOwned()).toBe(0)
  })
})

describe('assignAnalyzedFieldSql', () => {
  it('writes an analysis value and stamps its source', () => {
    db.prepare(`UPDATE samples SET ${assignAnalyzedFieldSql('bpm')} WHERE id = ?`)
      .run(128, 128, sampleId)
    expect(db.prepare('SELECT bpm, bpm_source FROM samples WHERE id = ?')
      .get<{ bpm: number; bpm_source: string }>(sampleId))
      .toEqual({ bpm: 128, bpm_source: 'analysis' })
  })

  it('clears the source when the analyzer produces no value', () => {
    db.prepare(`UPDATE samples SET ${assignAnalyzedFieldSql('bpm')} WHERE id = ?`)
      .run(128, 128, sampleId)
    db.prepare(`UPDATE samples SET ${assignAnalyzedFieldSql('bpm')} WHERE id = ?`)
      .run(null, null, sampleId)
    expect(db.prepare('SELECT bpm, bpm_source FROM samples WHERE id = ?')
      .get<{ bpm: number | null; bpm_source: string | null }>(sampleId))
      .toEqual({ bpm: null, bpm_source: null })
  })

  it('leaves a manual value untouched', () => {
    pin('bpm', 133)
    db.prepare(`UPDATE samples SET ${assignAnalyzedFieldSql('bpm')} WHERE id = ?`)
      .run(128, 128, sampleId)
    expect(db.prepare('SELECT bpm, bpm_source FROM samples WHERE id = ?')
      .get<{ bpm: number; bpm_source: string }>(sampleId))
      .toEqual({ bpm: 133, bpm_source: 'manual' })
  })
})

describe('clearAnalyzedFieldSql', () => {
  it('clears an analysis value but preserves a manual one', () => {
    db.prepare(`UPDATE samples SET ${assignAnalyzedFieldSql('bpm')} WHERE id = ?`)
      .run(128, 128, sampleId)
    pin('musical_key', 'Am')

    db.prepare(
      `UPDATE samples SET ${clearAnalyzedFieldSql('bpm')}, ${clearAnalyzedFieldSql('musical_key')}
       WHERE id = ?`
    ).run(sampleId)

    expect(db.prepare(
      'SELECT bpm, bpm_source, musical_key, musical_key_source FROM samples WHERE id = ?'
    ).get(sampleId)).toEqual({
      bpm: null,
      bpm_source: null,
      musical_key: 'Am',
      musical_key_source: 'manual'
    })
  })
})

describe('analyzedFieldChangesSql', () => {
  it('detects only a real change to an analysis-owned field', () => {
    const changes = (value: number | null): number => db.prepare(
      `SELECT COUNT(*) AS count FROM samples
       WHERE id = ? AND ${analyzedFieldChangesSql('bpm')}`
    ).get<{ count: number }>(sampleId, value)!.count

    expect(changes(null)).toBe(0)
    expect(changes(128)).toBe(1)

    db.prepare(`UPDATE samples SET ${assignAnalyzedFieldSql('bpm')} WHERE id = ?`)
      .run(128, 128, sampleId)
    expect(changes(128)).toBe(0)
    expect(changes(140)).toBe(1)

    // A pinned field never reports a change, however different the value.
    pin('bpm', 133)
    expect(changes(140)).toBe(0)
  })
})
