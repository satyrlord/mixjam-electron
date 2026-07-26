
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
  it('creates a fresh v6 database from scratch', () => {
    const db = new DB(sqlite3, new sqlite3.oo1.DB(':memory:'))
    expect(() => initSchema(db)).not.toThrow()
    expect(() => initSchema(db)).not.toThrow()

    const version = db.prepare('SELECT version FROM schema_version').get<{ version: number }>()
    expect(version?.version).toBe(6)
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
    expect(db.prepare('PRAGMA table_info(folder_tag_sources)').all<{ name: string }>()
      .map(({ name }) => name)).toEqual(['tag_id', 'root_id'])
    expect(db.prepare('PRAGMA table_info(samples)').all<{ name: string }>()
      .map(({ name }) => name)).not.toContain('category_id')
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%categor%'").all())
      .toEqual([])
    db.close()
  })

  it('idempotently re-runs on an already v6 database', () => {
    const db = new DB(sqlite3, new sqlite3.oo1.DB(':memory:'))
    initSchema(db)
    expect(() => initSchema(db)).not.toThrow()
    expect(() => initSchema(db)).not.toThrow()
    db.close()
  })

  it('migrates v5 categories, saved rules, and existing user tags into flat tags', () => {
    const db = new DB(sqlite3, new sqlite3.oo1.DB(':memory:'))
    initSchema(db)
    db.exec(`
      ALTER TABLE samples ADD COLUMN category_id INTEGER;
      CREATE TABLE categories (
        id INTEGER PRIMARY KEY, name TEXT NOT NULL,
        parent_id INTEGER REFERENCES categories(id), UNIQUE(parent_id, name)
      );
      CREATE TABLE category_sources (
        category_id INTEGER NOT NULL, root_id INTEGER NOT NULL,
        source TEXT NOT NULL, PRIMARY KEY(category_id, root_id, source)
      );
      CREATE TABLE sample_categories (
        sample_id INTEGER NOT NULL, category_id INTEGER NOT NULL,
        PRIMARY KEY(sample_id, category_id)
      );
      DROP TABLE sample_tags;
      CREATE TABLE sample_tags (
        sample_id INTEGER NOT NULL, tag_id INTEGER NOT NULL,
        PRIMARY KEY(sample_id, tag_id)
      );
    `)
    const rootId = db.prepare('INSERT INTO scan_roots (key) VALUES (?)').run('legacy').lastInsertRowid
    const drums = db.prepare('INSERT INTO categories (name, parent_id) VALUES (?, NULL)').run('Drums').lastInsertRowid
    const bass = db.prepare('INSERT INTO categories (name, parent_id) VALUES (?, ?)').run('Bass', drums).lastInsertRowid
    const otherBass = db.prepare('INSERT INTO categories (name, parent_id) VALUES (?, NULL)').run('Bass').lastInsertRowid
    db.prepare("INSERT INTO category_sources VALUES (?, ?, 'folder')").run(drums, rootId)
    db.prepare("INSERT INTO category_sources VALUES (?, ?, 'folder')").run(bass, rootId)
    db.prepare("INSERT INTO category_sources VALUES (?, ?, 'custom')").run(otherBass, rootId)
    const sampleId = db.prepare(
      `INSERT INTO samples (root_id, relpath, filename, date_added, scan_state, category_id)
       VALUES (?, 'Drums/Bass/kick.wav', 'kick.wav', 1, 1, ?)`
    ).run(rootId, drums).lastInsertRowid
    db.prepare('INSERT INTO sample_categories VALUES (?, ?)').run(sampleId, bass)
    const favorite = db.prepare(
      "INSERT INTO tags (name, color, user_created) VALUES ('Favorite', '#fff', 1)"
    ).run().lastInsertRowid
    db.prepare('INSERT INTO sample_tags VALUES (?, ?)').run(sampleId, favorite)
    const libraryId = db.prepare(
      "INSERT INTO libraries (name, created_at) VALUES ('Legacy', 1)"
    ).run().lastInsertRowid
    db.prepare('INSERT INTO library_rules VALUES (?, ?)').run(
      libraryId,
      JSON.stringify({ version: 1, root: { kind: 'group', op: 'and', children: [
        { kind: 'category', quantifier: 'any', categoryIds: [bass], includeDescendants: true },
        { kind: 'tag', quantifier: 'any', tagIds: [favorite] }
      ] } })
    )
    db.prepare('UPDATE schema_version SET version = 5').run()

    initSchema(db)

    expect(db.prepare('SELECT version FROM schema_version').get<{ version: number }>()?.version).toBe(6)
    expect(db.prepare('SELECT name, user_created FROM tags ORDER BY name').all()).toEqual([
      { name: 'Bass', user_created: 1 },
      { name: 'Drums', user_created: 0 },
      { name: 'Favorite', user_created: 1 }
    ])
    expect(db.prepare(
      `SELECT t.name, st.source FROM sample_tags st JOIN tags t ON t.id = st.tag_id
       WHERE st.sample_id = ? ORDER BY t.name`
    ).all(sampleId)).toEqual([
      { name: 'Bass', source: 'folder' },
      { name: 'Drums', source: 'folder' },
      { name: 'Favorite', source: 'user' }
    ])
    expect(JSON.parse(db.prepare('SELECT rule_json FROM library_rules WHERE library_id = ?')
      .get<{ rule_json: string }>(libraryId)!.rule_json).root.children[0]).toEqual({
      kind: 'tag',
      quantifier: 'all',
      tagIds: [db.prepare("SELECT id FROM tags WHERE name = 'Bass'").get<{ id: number }>()!.id]
    })
    expect(JSON.parse(db.prepare('SELECT rule_json FROM library_rules WHERE library_id = ?')
      .get<{ rule_json: string }>(libraryId)!.rule_json).root.children[1]).toEqual({
      kind: 'tag', quantifier: 'all', tagIds: [favorite]
    })
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%categor%'").all())
      .toEqual([])
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    db.close()
  })

  it('resumes a v6 structural swap that stopped before the version stamp', () => {
    const db = new DB(sqlite3, new sqlite3.oo1.DB(':memory:'))
    initSchema(db)
    // The swap transaction commits this sentinel as its last statement, so a
    // crash before the final stamp leaves the database here.
    db.prepare('UPDATE schema_version SET version = 5006').run()

    expect(() => initSchema(db)).not.toThrow()

    expect(db.prepare('SELECT version FROM schema_version').get<{ version: number }>()?.version).toBe(6)
    expect(db.prepare('PRAGMA table_info(sample_tags)').all<{ name: string }>()
      .map(({ name }) => name)).toContain('source')
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    db.close()
  })

  it('re-runs the whole v6 migration when the sentinel is stamped but the swap never landed', () => {
    // The sentinel alone cannot prove the swap committed: initSchema runs the
    // CREATE TABLE IF NOT EXISTS DDL before reading the version, so a v5-shaped
    // database is left untouched by that DDL. Resuming on the stamp alone would
    // skip to the derived rebuild and strand the database v5-shaped but stamped
    // v6 — every later tag write would hit a sample_tags with no `source`.
    const db = new DB(sqlite3, new sqlite3.oo1.DB(':memory:'))
    initSchema(db)
    db.exec(`
      ALTER TABLE samples ADD COLUMN category_id INTEGER;
      CREATE TABLE categories (
        id INTEGER PRIMARY KEY, name TEXT NOT NULL,
        parent_id INTEGER REFERENCES categories(id), UNIQUE(parent_id, name)
      );
      CREATE TABLE category_sources (
        category_id INTEGER NOT NULL, root_id INTEGER NOT NULL,
        source TEXT NOT NULL, PRIMARY KEY(category_id, root_id, source)
      );
      CREATE TABLE sample_categories (
        sample_id INTEGER NOT NULL, category_id INTEGER NOT NULL,
        PRIMARY KEY(sample_id, category_id)
      );
      DROP TABLE sample_tags;
      CREATE TABLE sample_tags (
        sample_id INTEGER NOT NULL, tag_id INTEGER NOT NULL,
        PRIMARY KEY(sample_id, tag_id)
      );
    `)
    const rootId = db.prepare('INSERT INTO scan_roots (key) VALUES (?)').run('legacy').lastInsertRowid
    const drums = db.prepare('INSERT INTO categories (name, parent_id) VALUES (?, NULL)')
      .run('Drums').lastInsertRowid
    db.prepare("INSERT INTO category_sources VALUES (?, ?, 'folder')").run(drums, rootId)
    const sampleId = db.prepare(
      `INSERT INTO samples (root_id, relpath, filename, date_added, scan_state, category_id)
       VALUES (?, 'Drums/kick.wav', 'kick.wav', 1, 1, ?)`
    ).run(rootId, drums).lastInsertRowid
    db.prepare('UPDATE schema_version SET version = 5006').run()

    initSchema(db)

    expect(db.prepare('SELECT version FROM schema_version').get<{ version: number }>()?.version).toBe(6)
    expect(db.prepare('PRAGMA table_info(sample_tags)').all<{ name: string }>()
      .map(({ name }) => name)).toContain('source')
    expect(db.prepare('PRAGMA table_info(samples)').all<{ name: string }>()
      .map(({ name }) => name)).not.toContain('category_id')
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%categor%'").all())
      .toEqual([])
    expect(db.prepare(
      `SELECT t.name, st.source FROM sample_tags st JOIN tags t ON t.id = st.tag_id
       WHERE st.sample_id = ? ORDER BY t.name`
    ).all(sampleId)).toEqual([{ name: 'Drums', source: 'folder' }])
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
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
      .toBe(6)
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
      .toBe(6)
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
      .toBe(6)
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
