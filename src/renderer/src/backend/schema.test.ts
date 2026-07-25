// @vitest-environment node
import sqlite3InitModule, { type Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import { beforeAll, describe, expect, it } from 'vitest'
import { listAnalysisCandidates } from './analysis-persistence'
import { getLibraryRootState } from './indexed-sample-persistence'
import { DB } from './sql'
import { initSchema, METADATA_REVISION } from './schema'

let sqlite3: Sqlite3Static
beforeAll(async () => { sqlite3 = await sqlite3InitModule() })

describe('schema migrations', () => {
  it('creates a fresh v5 database from scratch', () => {
    const db = new DB(sqlite3, new sqlite3.oo1.DB(':memory:'))
    expect(() => initSchema(db)).not.toThrow()
    expect(() => initSchema(db)).not.toThrow()

    const version = db.prepare('SELECT version FROM schema_version').get<{ version: number }>()
    expect(version?.version).toBe(5)
    expect(db.prepare('PRAGMA table_info(scan_roots)').all<{ name: string }>()
      .map(({ name }) => name)).toEqual(expect.arrayContaining([
        'last_completed_at', 'legacy_index_available'
      ]))
    expect(db.prepare('PRAGMA table_info(samples)').all<{ name: string }>()
      .map(({ name }) => name)).toEqual(expect.arrayContaining([
        'metadata_revision', 'analysis_revision', 'raw_bpm', 'raw_musical_key'
      ]))
    expect(db.prepare('PRAGMA table_info(analysis_groups)').all<{ name: string }>()
      .map(({ name }) => name)).toEqual(expect.arrayContaining([
        'root_id', 'relpath_prefix', 'state', 'bpm', 'musical_key', 'confidence'
      ]))
    expect(db.prepare('PRAGMA table_info(category_sources)').all<{ name: string }>()
      .map(({ name }) => name)).toEqual(['category_id', 'root_id', 'source'])
    db.close()
  })

  it('idempotently re-runs on an already v5 database', () => {
    const db = new DB(sqlite3, new sqlite3.oo1.DB(':memory:'))
    initSchema(db)
    expect(() => initSchema(db)).not.toThrow()
    expect(() => initSchema(db)).not.toThrow()
    db.close()
  })

  it('migrates root evidence and does not invent ownership for unassigned categories', () => {
    const db = new DB(sqlite3, new sqlite3.oo1.DB(':memory:'))
    initSchema(db)
    const firstRoot = db.prepare('INSERT INTO scan_roots (key) VALUES (?)').run('first').lastInsertRowid
    const secondRoot = db.prepare('INSERT INTO scan_roots (key) VALUES (?)').run('second').lastInsertRowid
    const folderCategory = db.prepare(
      'INSERT INTO categories (name, parent_id) VALUES (?, NULL)'
    ).run('Drum').lastInsertRowid
    const customCategory = db.prepare(
      'INSERT INTO categories (name, parent_id) VALUES (?, NULL)'
    ).run('Favorites').lastInsertRowid
    const unsortedCategory = db.prepare(
      'INSERT INTO categories (name, parent_id) VALUES (?, NULL)'
    ).run('Unsorted').lastInsertRowid
    const sampleId = db.prepare(
      `INSERT INTO samples (root_id, relpath, filename, date_added, scan_state)
       VALUES (?, 'Drum/kick.wav', 'kick.wav', 1, 1)`
    ).run(firstRoot).lastInsertRowid
    db.prepare(
      'INSERT INTO sample_categories (sample_id, category_id) VALUES (?, ?)'
    ).run(sampleId, folderCategory)
    db.prepare('DELETE FROM category_sources').run()
    db.prepare('UPDATE schema_version SET version = 4').run()

    initSchema(db)

    expect(db.prepare(
      'SELECT root_id, source FROM category_sources WHERE category_id = ? ORDER BY root_id, source'
    ).all(folderCategory)).toEqual([{ root_id: firstRoot, source: 'folder' }])
    expect(db.prepare(
      'SELECT root_id, source FROM category_sources WHERE category_id = ? ORDER BY root_id, source'
    ).all(customCategory)).toEqual([])
    expect(db.prepare('SELECT id FROM categories WHERE id = ?').get(customCategory)).toBeUndefined()
    expect(db.prepare(
      'SELECT root_id, source FROM category_sources WHERE category_id = ? ORDER BY root_id, source'
    ).all(unsortedCategory)).toEqual([
      { root_id: firstRoot, source: 'folder' },
      { root_id: secondRoot, source: 'folder' }
    ])
    db.close()
  })

  it('uses a primary sample category as root-specific v4 folder evidence', () => {
    const db = new DB(sqlite3, new sqlite3.oo1.DB(':memory:'))
    initSchema(db)
    const firstRoot = db.prepare('INSERT INTO scan_roots (key) VALUES (?)').run('first').lastInsertRowid
    db.prepare('INSERT INTO scan_roots (key) VALUES (?)').run('second')
    const categoryId = db.prepare(
      'INSERT INTO categories (name, parent_id) VALUES (?, NULL)'
    ).run('Drum').lastInsertRowid
    db.prepare(
      `INSERT INTO samples (root_id, relpath, filename, date_added, scan_state, category_id)
       VALUES (?, 'Drum/kick.wav', 'kick.wav', 1, 1, ?)`
    ).run(firstRoot, categoryId)
    db.prepare('DELETE FROM category_sources').run()
    db.prepare('UPDATE schema_version SET version = 4').run()

    initSchema(db)

    expect(db.prepare(
      'SELECT root_id, source FROM category_sources WHERE category_id = ?'
    ).all(categoryId)).toEqual([{ root_id: firstRoot, source: 'folder' }])
    db.close()
  })

  it('does not use missing v4 samples as current folder evidence', () => {
    const db = new DB(sqlite3, new sqlite3.oo1.DB(':memory:'))
    initSchema(db)
    const rootId = db.prepare('INSERT INTO scan_roots (key) VALUES (?)').run('first').lastInsertRowid
    const primaryCategoryId = db.prepare(
      'INSERT INTO categories (name, parent_id) VALUES (?, NULL)'
    ).run('Removed primary').lastInsertRowid
    const joinedCategoryId = db.prepare(
      'INSERT INTO categories (name, parent_id) VALUES (?, NULL)'
    ).run('Removed joined').lastInsertRowid
    const sampleId = db.prepare(
      `INSERT INTO samples (root_id, relpath, filename, date_added, scan_state, category_id)
       VALUES (?, 'Removed/sample.wav', 'sample.wav', 1, 2, ?)`
    ).run(rootId, primaryCategoryId).lastInsertRowid
    db.prepare(
      'INSERT INTO sample_categories (sample_id, category_id) VALUES (?, ?)'
    ).run(sampleId, joinedCategoryId)
    db.prepare('DELETE FROM category_sources').run()
    db.prepare('UPDATE schema_version SET version = 4').run()

    initSchema(db)

    expect(db.prepare(
      'SELECT category_id, root_id, source FROM category_sources WHERE category_id IN (?, ?)'
    ).all(primaryCategoryId, joinedCategoryId)).toEqual([])
    db.close()
  })

  it('repairs an early v3 database created before the root index-availability marker', () => {
    const db = new DB(sqlite3, new sqlite3.oo1.DB(':memory:'))
    db.exec(`
      CREATE TABLE schema_version (version INTEGER NOT NULL);
      INSERT INTO schema_version (version) VALUES (3);
      CREATE TABLE scan_roots (
        id INTEGER PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        last_completed_at INTEGER
      );
    `)

    expect(() => initSchema(db)).not.toThrow()
    expect(db.prepare('PRAGMA table_info(scan_roots)').all<{ name: string }>()
      .map(({ name }) => name)).toContain('legacy_index_available')
    db.close()
  })

  it('upgrades a v1 database with no migration columns', () => {
    const db = new DB(sqlite3, new sqlite3.oo1.DB(':memory:'))
    db.exec(`
      CREATE TABLE schema_version (version INTEGER NOT NULL);
      INSERT INTO schema_version (version) VALUES (1);
      CREATE TABLE samples (
        id INTEGER PRIMARY KEY,
        root_id INTEGER NOT NULL,
        relpath TEXT NOT NULL,
        filename TEXT NOT NULL,
        ext TEXT,
        size_bytes INTEGER,
        mtime INTEGER,
        duration REAL,
        sample_rate INTEGER,
        channels INTEGER,
        bpm REAL,
        musical_key TEXT,
        date_added INTEGER NOT NULL,
        scan_state INTEGER NOT NULL DEFAULT 0,
        category_id INTEGER,
        UNIQUE (root_id, relpath)
      )
    `)

    expect(() => initSchema(db)).not.toThrow()
    const columns = db.prepare('PRAGMA table_info(samples)').all<{ name: string }>()
      .map((column) => column.name)
    expect(columns).toEqual(expect.arrayContaining([
      'bpm_source', 'musical_key_source', 'sample_type', 'sample_type_source'
    ]))
    expect(db.prepare('SELECT version FROM schema_version').get<{ version: number }>()?.version)
      .toBe(5)
    db.close()
  })

  it('upgrades a v1 database with only bpm_source pre-migrated', () => {
    const db = new DB(sqlite3, new sqlite3.oo1.DB(':memory:'))
    db.exec(`
      CREATE TABLE schema_version (version INTEGER NOT NULL);
      INSERT INTO schema_version (version) VALUES (1);
      CREATE TABLE samples (
        id INTEGER PRIMARY KEY,
        root_id INTEGER NOT NULL,
        relpath TEXT NOT NULL,
        filename TEXT NOT NULL,
        ext TEXT,
        size_bytes INTEGER,
        mtime INTEGER,
        duration REAL,
        sample_rate INTEGER,
        channels INTEGER,
        bpm REAL,
        musical_key TEXT,
        date_added INTEGER NOT NULL,
        scan_state INTEGER NOT NULL DEFAULT 0,
        category_id INTEGER,
        UNIQUE (root_id, relpath)
      );
      ALTER TABLE samples ADD COLUMN bpm_source TEXT;
    `)

    expect(() => initSchema(db)).not.toThrow()
    const columns = db.prepare('PRAGMA table_info(samples)').all<{ name: string }>()
      .map((column) => column.name)
    expect(columns).toEqual(expect.arrayContaining([
      'bpm_source', 'musical_key_source', 'sample_type', 'sample_type_source'
    ]))
    db.close()
  })

  it('upgrades a fully pre-migrated v1 database (all columns already added)', () => {
    const db = new DB(sqlite3, new sqlite3.oo1.DB(':memory:'))
    db.exec(`
      CREATE TABLE schema_version (version INTEGER NOT NULL);
      INSERT INTO schema_version (version) VALUES (1);
      CREATE TABLE samples (
        id INTEGER PRIMARY KEY,
        root_id INTEGER NOT NULL,
        relpath TEXT NOT NULL,
        filename TEXT NOT NULL,
        ext TEXT,
        size_bytes INTEGER,
        mtime INTEGER,
        duration REAL,
        sample_rate INTEGER,
        channels INTEGER,
        bpm REAL,
        musical_key TEXT,
        date_added INTEGER NOT NULL,
        scan_state INTEGER NOT NULL DEFAULT 0,
        category_id INTEGER,
        UNIQUE (root_id, relpath)
      );
      ALTER TABLE samples ADD COLUMN bpm_source TEXT;
      ALTER TABLE samples ADD COLUMN musical_key_source TEXT;
      ALTER TABLE samples ADD COLUMN sample_type TEXT;
      ALTER TABLE samples ADD COLUMN sample_type_source TEXT;
    `)

    expect(() => initSchema(db)).not.toThrow()
    expect(() => initSchema(db)).not.toThrow()
    expect(db.prepare('SELECT version FROM schema_version').get<{ version: number }>()?.version)
      .toBe(5)
    db.close()
  })

  it('upgrades a partially migrated v1 database idempotently', () => {
    const db = new DB(sqlite3, new sqlite3.oo1.DB(':memory:'))
    db.exec(`
      CREATE TABLE schema_version (version INTEGER NOT NULL);
      INSERT INTO schema_version (version) VALUES (1);
      CREATE TABLE samples (
        id INTEGER PRIMARY KEY,
        root_id INTEGER NOT NULL,
        relpath TEXT NOT NULL,
        filename TEXT NOT NULL,
        ext TEXT,
        size_bytes INTEGER,
        mtime INTEGER,
        duration REAL,
        sample_rate INTEGER,
        channels INTEGER,
        bpm REAL,
        musical_key TEXT,
        date_added INTEGER NOT NULL,
        scan_state INTEGER NOT NULL DEFAULT 0,
        category_id INTEGER,
        UNIQUE (root_id, relpath)
      );
      ALTER TABLE samples ADD COLUMN bpm_source TEXT;
    `)

    expect(() => initSchema(db)).not.toThrow()
    expect(() => initSchema(db)).not.toThrow()
    const columns = db.prepare('PRAGMA table_info(samples)').all<{ name: string }>()
      .map((column) => column.name)
    expect(columns).toEqual(expect.arrayContaining([
      'bpm_source', 'musical_key_source', 'sample_type', 'sample_type_source'
    ]))
    expect(db.prepare('SELECT version FROM schema_version').get<{ version: number }>()?.version)
      .toBe(5)
    db.close()
  })

  it('preserves browseability and analysis uncertainty during v3 migration', () => {
    const db = new DB(sqlite3, new sqlite3.oo1.DB(':memory:'))
    initSchema(db)
    const rootId = db.prepare('INSERT INTO scan_roots (key) VALUES (?)').run('legacy').lastInsertRowid
    db.prepare(
      `INSERT INTO samples (
        root_id, relpath, filename, date_added, scan_state,
        metadata_revision, analysis_revision
      ) VALUES (?, 'ready.wav', 'ready.wav', 1, 1, 0, 0),
               (?, 'analyzed.wav', 'analyzed.wav', 1, 1, 0, 0),
               (?, 'pending.wav', 'pending.wav', 1, 0, 0, 0),
               (?, 'missing.wav', 'missing.wav', 1, 2, 0, 0)`
    ).run(rootId, rootId, rootId, rootId)
    db.prepare(
      `UPDATE samples
       SET bpm = 112, bpm_source = 'analysis',
           musical_key = 'C', musical_key_source = 'analysis',
           sample_type = 'Kick', sample_type_source = 'analysis'
       WHERE relpath = 'analyzed.wav'`
    ).run()
    db.prepare('UPDATE schema_version SET version = 2').run()

    initSchema(db)
    initSchema(db)

    expect(db.prepare(
      `SELECT last_completed_at, legacy_index_available
       FROM scan_roots WHERE id = ?`
    ).get(rootId)).toEqual({
      last_completed_at: null,
      legacy_index_available: 1
    })
    expect(db.prepare(
      `SELECT relpath, metadata_revision, analysis_revision
       FROM samples ORDER BY relpath`
    ).all()).toEqual([
      {
        relpath: 'analyzed.wav',
        metadata_revision: METADATA_REVISION,
        analysis_revision: 1
      },
      { relpath: 'missing.wav', metadata_revision: 0, analysis_revision: 0 },
      { relpath: 'pending.wav', metadata_revision: 0, analysis_revision: 0 },
      {
        relpath: 'ready.wav',
        metadata_revision: METADATA_REVISION,
        analysis_revision: 0
      }
    ])
    expect(listAnalysisCandidates(db, rootId).map(({ relpath }) => relpath))
      .toEqual(['ready.wav', 'analyzed.wav'])
    expect(db.prepare(
      `SELECT raw_bpm, raw_musical_key FROM samples WHERE relpath = 'analyzed.wav'`
    ).get()).toEqual({ raw_bpm: 112, raw_musical_key: 'C' })
    db.close()
  })

  it('keeps all-null and manual-only legacy libraries browseable', () => {
    const db = new DB(sqlite3, new sqlite3.oo1.DB(':memory:'))
    initSchema(db)
    const rootId = db.prepare('INSERT INTO scan_roots (key) VALUES (?)').run('manual').lastInsertRowid
    db.prepare(
      `INSERT INTO samples (
        root_id, relpath, filename, date_added, scan_state,
        bpm, bpm_source, metadata_revision, analysis_revision
      ) VALUES (?, 'unknown.wav', 'unknown.wav', 1, 1, NULL, NULL, 0, 0),
               (?, 'manual.wav', 'manual.wav', 1, 1, 90, 'manual', 0, 0)`
    ).run(rootId, rootId)
    db.prepare('UPDATE schema_version SET version = 2').run()

    initSchema(db)

    expect(getLibraryRootState(db, 'manual')).toEqual({
      rootKey: 'manual',
      lastCompletedAt: null,
      hasUsableIndex: true
    })
    db.close()
  })
})
