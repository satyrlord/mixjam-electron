// @vitest-environment node
import sqlite3InitModule, { type Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import { beforeAll, describe, expect, it } from 'vitest'
import { DB } from './sql'
import { initSchema } from './schema'

let sqlite3: Sqlite3Static
beforeAll(async () => { sqlite3 = await sqlite3InitModule() })

describe('schema migrations', () => {
  it('creates a fresh v2 database from scratch', () => {
    const db = new DB(sqlite3, new sqlite3.oo1.DB(':memory:'))
    expect(() => initSchema(db)).not.toThrow()
    expect(() => initSchema(db)).not.toThrow()

    const version = db.prepare('SELECT version FROM schema_version').get<{ version: number }>()
    expect(version?.version).toBe(2)
    db.close()
  })

  it('idempotently re-runs on an already v2 database', () => {
    const db = new DB(sqlite3, new sqlite3.oo1.DB(':memory:'))
    initSchema(db)
    expect(() => initSchema(db)).not.toThrow()
    expect(() => initSchema(db)).not.toThrow()
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
      .toBe(2)
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
      .toBe(2)
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
      .toBe(2)
    db.close()
  })
})
