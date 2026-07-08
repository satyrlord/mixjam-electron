// @vitest-environment node
// SQL-layer tests run against sqlite-wasm with an in-memory database — the
// same engine the backend worker uses, minus the OPFS VFS (Node has no OPFS).
import sqlite3InitModule, { type Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DB } from './sql'
import { initSchema } from './schema'
import {
  assignCategoryFromPath,
  createCategory,
  createTag,
  deleteCategory,
  deleteLibrary,
  deleteTag,
  ensureScanRoot,
  ensureUnsortedCategory,
  hasSamples,
  scanRootId,
  listCategories,
  listLibraries,
  listMissingRelpaths,
  listTags,
  markMissing,
  querySamples,
  renameTag,
  saveLibrary,
  assignTag,
  syncCategoriesFromNames,
  unassignTag,
  tagsForSample,
  toFtsPrefixQuery,
  upsertStub,
  updateMetadata,
  UNSORTED_CATEGORY
} from './library'

let sqlite3: Sqlite3Static
let db: DB
// Shared scan root for tests that need a sample row but don't exercise
// per-root scoping themselves (see the dedicated scoping describe below).
let rootId: number

beforeAll(async () => {
  sqlite3 = await sqlite3InitModule()
})

beforeEach(() => {
  db = new DB(sqlite3, new sqlite3.oo1.DB(':memory:'))
  initSchema(db)
  rootId = ensureScanRoot(db, 'root-main')
})

afterEach(() => {
  db.close()
})

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

describe('ensureUnsortedCategory', () => {
  it('creates the Unsorted root category', () => {
    ensureUnsortedCategory(db)
    const cats = listCategories(db)
    const rootNames = cats.filter((c) => c.parentId === null).map((c) => c.name)
    expect(rootNames).toContain(UNSORTED_CATEGORY)
  })

  it('is idempotent — calling it twice does not create duplicates', () => {
    ensureUnsortedCategory(db)
    ensureUnsortedCategory(db)
    const cats = listCategories(db).filter((c) => c.parentId === null)
    const names = cats.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('createCategory (AC-010a, AC-010b)', () => {
  it('AC-010a: creates a custom root category that appears in the list', () => {
    ensureUnsortedCategory(db)
    const cat = createCategory(db, 'My Custom Category')
    expect(cat.name).toBe('My Custom Category')
    expect(cat.parentId).toBeNull()
    const all = listCategories(db)
    expect(all.find((c) => c.id === cat.id)).toBeDefined()
  })

  it('AC-010b: creates a subcategory under an existing category', () => {
    ensureUnsortedCategory(db)
    const parent = createCategory(db, 'Drums')
    const child = createCategory(db, 'Kicks', parent.id)
    expect(child.parentId).toBe(parent.id)
    const all = listCategories(db)
    expect(all.find((c) => c.id === child.id)).toBeDefined()
  })

  it('returns the existing subcategory id for a duplicate name (no stale rowid)', () => {
    ensureUnsortedCategory(db)
    const parent = createCategory(db, 'Drums')
    // An unrelated insert advances lastInsertRowid on this connection.
    createTag(db, 'unrelated')
    const first = createCategory(db, 'Kicks', parent.id)
    const second = createCategory(db, 'Kicks', parent.id)
    expect(second.id).toBe(first.id)
    // No duplicate row was created.
    const kicks = listCategories(db).filter((c) => c.parentId === parent.id && c.name === 'Kicks')
    expect(kicks).toHaveLength(1)
  })
})

describe('deleteCategory', () => {
  it('removes a custom category', () => {
    const cat = createCategory(db, 'Temp')
    deleteCategory(db, cat.id)
    const all = listCategories(db)
    expect(all.find((c) => c.id === cat.id)).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

describe('createTag (AC-007)', () => {
  it('creates a tag and returns it', () => {
    const tag = createTag(db, 'Kick')
    expect(tag.name).toBe('Kick')
    expect(tag.id).toBeTypeOf('number')
    expect(listTags(db).find((t) => t.id === tag.id)).toBeDefined()
  })

  it('is idempotent — a duplicate name returns the existing tag without throwing', () => {
    const first = createTag(db, 'Kick')
    const second = createTag(db, 'Kick')
    expect(second.id).toBe(first.id)
    expect(listTags(db).filter((t) => t.name === 'Kick')).toHaveLength(1)
  })
})

describe('renameTag (AC-008)', () => {
  it('renames a tag and the new name is visible', () => {
    const tag = createTag(db, 'OldName')
    renameTag(db, tag.id, 'NewName')
    const found = listTags(db).find((t) => t.id === tag.id)
    expect(found?.name).toBe('NewName')
  })
})

function sampleIdFor(relpath: string): number {
  const row = db
    .prepare('SELECT id FROM samples WHERE relpath = ?')
    .get<{ id: number }>(relpath)
  if (!row) throw new Error(`no sample row for ${relpath}`)
  return row.id
}

describe('deleteTag (AC-009)', () => {
  it('deletes a tag and removes it from assigned samples', () => {
    upsertStub(db, rootId, 'samples/kick.wav', 'kick.wav', 'wav', 1024, Date.now())
    const sampleId = sampleIdFor('samples/kick.wav')
    const tag = createTag(db, 'ToDelete')
    assignTag(db, sampleId, tag.id)
    expect(tagsForSample(db, sampleId).find((t) => t.id === tag.id)).toBeDefined()

    deleteTag(db, tag.id)
    expect(listTags(db).find((t) => t.id === tag.id)).toBeUndefined()
    expect(tagsForSample(db, sampleId).find((t) => t.id === tag.id)).toBeUndefined()
  })
})

describe('assignTag / unassignTag', () => {
  it('assigns and unassigns a tag to a sample', () => {
    upsertStub(db, rootId, 'samples/snare.wav', 'snare.wav', 'wav', 512, Date.now())
    const sampleId = sampleIdFor('samples/snare.wav')
    const tag = createTag(db, 'Snare')

    assignTag(db, sampleId, tag.id)
    expect(tagsForSample(db, sampleId).map((t) => t.id)).toContain(tag.id)

    unassignTag(db, sampleId, tag.id)
    expect(tagsForSample(db, sampleId).map((t) => t.id)).not.toContain(tag.id)
  })
})

// ---------------------------------------------------------------------------
// Samples
// ---------------------------------------------------------------------------

describe('upsertStub', () => {
  it('inserts a new stub row with scan_state=0', () => {
    upsertStub(db, rootId, 'samples/hi-hat.wav', 'hi-hat.wav', 'wav', 2048, 1000)
    const row = db
      .prepare('SELECT * FROM samples WHERE relpath = ?')
      .get<{ filename: string; scan_state: number; duration: number | null }>('samples/hi-hat.wav')!
    expect(row.filename).toBe('hi-hat.wav')
    expect(row.scan_state).toBe(0)
    expect(row.duration).toBeNull()
  })

  it('updates an existing stub when called again (preserves user data)', () => {
    upsertStub(db, rootId, 'samples/hi-hat.wav', 'hi-hat.wav', 'wav', 2048, 1000)
    const tag = createTag(db, 'HiHat')
    const sampleId = sampleIdFor('samples/hi-hat.wav')
    assignTag(db, sampleId, tag.id)

    upsertStub(db, rootId, 'samples/hi-hat.wav', 'hi-hat.wav', 'wav', 2049, 2000)
    expect(tagsForSample(db, sampleId).find((t) => t.id === tag.id)).toBeDefined()
  })

  it('leaves a fully-scanned row untouched when size and mtime are unchanged', () => {
    upsertStub(db, rootId, 'samples/loop.wav', 'loop.wav', 'wav', 2048, 1000)
    updateMetadata(db, rootId, 'samples/loop.wav', 3.0, 44100, 2)
    // Re-scan with identical size/mtime — should NOT reset to a stub.
    upsertStub(db, rootId, 'samples/loop.wav', 'loop.wav', 'wav', 2048, 1000)
    const row = db
      .prepare('SELECT scan_state, duration FROM samples WHERE relpath = ?')
      .get<{ scan_state: number; duration: number | null }>('samples/loop.wav')!
    expect(row.scan_state).toBe(1)
    expect(row.duration).toBeCloseTo(3.0)
  })

  it('re-stubs a scanned row when size or mtime changes', () => {
    upsertStub(db, rootId, 'samples/loop.wav', 'loop.wav', 'wav', 2048, 1000)
    updateMetadata(db, rootId, 'samples/loop.wav', 3.0, 44100, 2)
    upsertStub(db, rootId, 'samples/loop.wav', 'loop.wav', 'wav', 9999, 1000)
    const row = db
      .prepare('SELECT scan_state, duration FROM samples WHERE relpath = ?')
      .get<{ scan_state: number; duration: number | null }>('samples/loop.wav')!
    expect(row.scan_state).toBe(0)
    expect(row.duration).toBeNull()
  })

  it('keeps identical relpaths in different roots as distinct rows', () => {
    const otherRoot = ensureScanRoot(db, 'root-other')
    upsertStub(db, rootId, 'kick.wav', 'kick.wav', 'wav', 1000, 1000)
    upsertStub(db, otherRoot, 'kick.wav', 'kick.wav', 'wav', 2000, 2000)
    const rows = db.prepare('SELECT root_id FROM samples WHERE relpath = ?').all('kick.wav')
    expect(rows).toHaveLength(2)
  })
})

describe('updateMetadata', () => {
  it('fills duration/sample_rate/channels and sets scan_state=1', () => {
    upsertStub(db, rootId, 'samples/pad.wav', 'pad.wav', 'wav', 4096, 1000)
    updateMetadata(db, rootId, 'samples/pad.wav', 2.5, 44100, 2)
    const row = db
      .prepare('SELECT * FROM samples WHERE relpath = ?')
      .get<{ duration: number; sample_rate: number; channels: number; scan_state: number }>(
        'samples/pad.wav'
      )!
    expect(row.duration).toBeCloseTo(2.5)
    expect(row.sample_rate).toBe(44100)
    expect(row.channels).toBe(2)
    expect(row.scan_state).toBe(1)
  })
})

describe('markMissing', () => {
  it('sets scan_state=2 and hides file from normal queries', () => {
    upsertStub(db, rootId, 'samples/gone.wav', 'gone.wav', 'wav', 1024, 1000)
    markMissing(db, rootId, 'samples/gone.wav')
    const { rows } = querySamples(db, {})
    expect(rows.find((r) => r.relpath === 'samples/gone.wav')).toBeUndefined()
  })
})

describe('listMissingRelpaths (spec-002 AC-013)', () => {
  it('returns missing relpaths for the root, scoped and empty-safe', () => {
    upsertStub(db, rootId, 'samples/gone.wav', 'gone.wav', 'wav', 1024, 1000)
    upsertStub(db, rootId, 'samples/here.wav', 'here.wav', 'wav', 1024, 1000)
    expect(listMissingRelpaths(db, 'root-main')).toEqual([])

    markMissing(db, rootId, 'samples/gone.wav')
    expect(listMissingRelpaths(db, 'root-main')).toEqual(['samples/gone.wav'])

    // Other roots and unknown roots never leak this root's missing rows.
    const otherRoot = ensureScanRoot(db, 'root-elsewhere')
    upsertStub(db, otherRoot, 'x/other.wav', 'other.wav', 'wav', 10, 10)
    expect(listMissingRelpaths(db, 'root-elsewhere')).toEqual([])
    expect(listMissingRelpaths(db, 'root-never-scanned')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// querySamples
// ---------------------------------------------------------------------------

describe('querySamples (AC-004, AC-005, AC-006, AC-011, AC-016)', () => {
  beforeEach(() => {
    ensureUnsortedCategory(db)
    upsertStub(db, rootId, 's/kick.wav', 'kick.wav', 'wav', 1000, 1000)
    upsertStub(db, rootId, 's/snare.wav', 'snare.wav', 'wav', 1000, 1000)
    upsertStub(db, rootId, 's/bass.mp3', 'bass.mp3', 'mp3', 1000, 1000)
    updateMetadata(db, rootId, 's/kick.wav', 0.5, 44100, 1)
    updateMetadata(db, rootId, 's/snare.wav', 1.0, 44100, 2)
    updateMetadata(db, rootId, 's/bass.mp3', 3.0, 44100, 2)
  })

  it('AC-005: text search filters by filename', () => {
    const { rows } = querySamples(db, { textSearch: 'kick' })
    expect(rows).toHaveLength(1)
    expect(rows[0].filename).toBe('kick.wav')
  })

  it('AC-006: empty query returns all non-missing samples', () => {
    const { total } = querySamples(db, {})
    expect(total).toBe(3)
  })

  it('AC-016: sort by filename ascending', () => {
    const { rows } = querySamples(db, { sortBy: 'filename', sortDir: 'asc' })
    const names = rows.map((r) => r.filename)
    expect(names).toEqual([...names].sort())
  })

  it('AC-016: sort by filename descending', () => {
    const { rows } = querySamples(db, { sortBy: 'filename', sortDir: 'desc' })
    const names = rows.map((r) => r.filename)
    expect(names).toEqual([...names].sort().reverse())
  })

  it('AC-016: sort by duration ascending', () => {
    const { rows } = querySamples(db, { sortBy: 'duration', sortDir: 'asc' })
    const durations = rows.map((r) => r.duration ?? 0)
    expect(durations).toEqual([...durations].sort((a, b) => a - b))
  })

  it('AC-011: filter by category includes descendants', () => {
    const drumsCategory = createCategory(db, 'Drums')
    const kicksCategory = createCategory(db, 'Kicks', drumsCategory.id)

    const kickSampleId = sampleIdFor('s/kick.wav')
    // Assign sample to the child category (Kicks); querying by parent (Drums)
    // must include descendants and find this sample.
    db.prepare('UPDATE samples SET category_id = ? WHERE id = ?').run(
      kicksCategory.id,
      kickSampleId
    )

    const { rows } = querySamples(db, { categoryId: drumsCategory.id })
    expect(rows.find((r) => r.filename === 'kick.wav')).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Windowed paging (AC-004)
// ---------------------------------------------------------------------------

describe('querySamples paging (AC-004)', () => {
  beforeEach(() => {
    // Insert 10 samples so we can test limit/offset
    for (let i = 1; i <= 10; i++) {
      const name = `sample${String(i).padStart(2, '0')}.wav`
      upsertStub(db, rootId, `s/${name}`, name, 'wav', 1000, 1000)
    }
  })

  it('AC-004: limit restricts the number of rows returned', () => {
    const { rows, total } = querySamples(db, { limit: 3 })
    expect(rows).toHaveLength(3)
    expect(total).toBe(10)
  })

  it('AC-004: offset skips rows (windowed paging)', () => {
    const page1 = querySamples(db, { limit: 4, offset: 0, sortBy: 'filename', sortDir: 'asc' })
    const page2 = querySamples(db, { limit: 4, offset: 4, sortBy: 'filename', sortDir: 'asc' })
    const page3 = querySamples(db, { limit: 4, offset: 8, sortBy: 'filename', sortDir: 'asc' })

    // No overlap between pages
    const allNames = [...page1.rows, ...page2.rows, ...page3.rows].map((r) => r.filename)
    expect(new Set(allNames).size).toBe(allNames.length)

    // Together they cover all 10
    expect(allNames).toHaveLength(10)

    // total is consistent across pages
    expect(page1.total).toBe(10)
    expect(page2.total).toBe(10)
    expect(page3.total).toBe(10)
  })

  it('AC-004: offset beyond total returns empty rows but correct total', () => {
    const { rows, total } = querySamples(db, { limit: 5, offset: 100 })
    expect(rows).toHaveLength(0)
    expect(total).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// Libraries
// ---------------------------------------------------------------------------

describe('saveLibrary / listLibraries / deleteLibrary (AC-012, AC-013, AC-014)', () => {
  it('AC-012: saves a library and retrieves it', () => {
    const ruleJson = JSON.stringify({ version: 1, root: { kind: 'group', op: 'and', children: [] } })
    const lib = saveLibrary(db, 'Drum Hits', ruleJson)
    expect(lib.name).toBe('Drum Hits')
    const all = listLibraries(db)
    expect(all.find((l) => l.id === lib.id)).toBeDefined()
  })

  it('AC-013: opening a library returns its saved rule_json', () => {
    const ruleJson = JSON.stringify({ version: 1, root: { kind: 'group', op: 'and', children: [] } })
    const lib = saveLibrary(db, 'My Set', ruleJson)
    const found = listLibraries(db).find((l) => l.id === lib.id)!
    expect(JSON.parse(found.ruleJson)).toEqual(JSON.parse(ruleJson))
  })

  it('AC-014: deleting a library removes only the saved query, not samples or tags', () => {
    upsertStub(db, rootId, 's/sample.wav', 'sample.wav', 'wav', 1000, 1000)
    const tag = createTag(db, 'KeepMe')
    const lib = saveLibrary(db, 'TempLib', '{}')

    deleteLibrary(db, lib.id)

    expect(listLibraries(db).find((l) => l.id === lib.id)).toBeUndefined()
    expect(listTags(db).find((t) => t.id === tag.id)).toBeDefined()
    expect(querySamples(db, {}).total).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// FTS text search safety
// ---------------------------------------------------------------------------

describe('toFtsPrefixQuery', () => {
  it('quotes each token so FTS5 operators are treated literally', () => {
    expect(toFtsPrefixQuery('kick')).toBe('"kick"*')
    expect(toFtsPrefixQuery('deep house')).toBe('"deep"* "house"*')
  })

  it('returns empty for whitespace-only input', () => {
    expect(toFtsPrefixQuery('   ')).toBe('')
  })

  it('escapes embedded double quotes', () => {
    expect(toFtsPrefixQuery('say"hi')).toBe('"say""hi"*')
  })
})

describe('querySamples textSearch does not crash on FTS5 metacharacters', () => {
  beforeEach(() => {
    upsertStub(db, rootId, 's/bass-loop.wav', 'bass-loop.wav', 'wav', 1000, 1000)
    upsertStub(db, rootId, 's/kick(01).wav', 'kick(01).wav', 'wav', 1000, 1000)
  })

  for (const term of ['bass-', 'kick(', '"snare', '808:', 'a OR b', 'NEAR']) {
    it(`handles ${JSON.stringify(term)} without throwing`, () => {
      expect(() => querySamples(db, { textSearch: term })).not.toThrow()
    })
  }

  it('still matches a clean prefix query', () => {
    const { rows } = querySamples(db, { textSearch: 'bass' })
    expect(rows.find((r) => r.filename === 'bass-loop.wav')).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Folder-derived categories + subcategory filtering
// ---------------------------------------------------------------------------

describe('assignCategoryFromPath + subcategory filtering', () => {
  beforeEach(() => {
    ensureUnsortedCategory(db)
    createCategory(db, 'Drums')
  })

  it('finds a sample by its subcategory even though category_id holds the root', () => {
    upsertStub(db, rootId, 'Drums/Kicks/kick.wav', 'kick.wav', 'wav', 1000, 1000)
    assignCategoryFromPath(db, rootId, 'Drums/Kicks/kick.wav')

    const drums = listCategories(db).find((c) => c.parentId === null && c.name === 'Drums')!
    const kicks = listCategories(db).find((c) => c.name === 'Kicks')!
    expect(kicks.parentId).toBe(drums.id)

    // The root assignment lives in category_id; subcategory membership is in the
    // join table — both the root and the subcategory must find the sample.
    expect(querySamples(db, { categoryId: drums.id }).rows.find((r) => r.filename === 'kick.wav'))
      .toBeDefined()
    expect(querySamples(db, { categoryId: kicks.id }).rows.find((r) => r.filename === 'kick.wav'))
      .toBeDefined()
  })

  it('assigns a root-level file to Unsorted', () => {
    upsertStub(db, rootId, 'kick.wav', 'kick.wav', 'wav', 1000, 1000)
    assignCategoryFromPath(db, rootId, 'kick.wav')
    const unsorted = listCategories(db).find(
      (c) => c.parentId === null && c.name === UNSORTED_CATEGORY
    )!
    const row = db
      .prepare('SELECT category_id FROM samples WHERE relpath = ?')
      .get<{ category_id: number | null }>('kick.wav')!
    expect(row.category_id).toBe(unsorted.id)
  })

  it('clears stale subcategory membership when a file moves between folders', () => {
    upsertStub(db, rootId, 'Drums/Kicks/x.wav', 'x.wav', 'wav', 1000, 1000)
    assignCategoryFromPath(db, rootId, 'Drums/Kicks/x.wav')
    const kicks = listCategories(db).find((c) => c.name === 'Kicks')!

    // Simulate a move: same file now under Snares.
    db.prepare('UPDATE samples SET relpath = ? WHERE relpath = ?').run(
      'Drums/Snares/x.wav',
      'Drums/Kicks/x.wav'
    )
    assignCategoryFromPath(db, rootId, 'Drums/Snares/x.wav')

    // Old Kicks membership must be gone.
    expect(querySamples(db, { categoryId: kicks.id }).rows.find((r) => r.filename === 'x.wav'))
      .toBeUndefined()
    const snares = listCategories(db).find((c) => c.name === 'Snares')!
    expect(querySamples(db, { categoryId: snares.id }).rows.find((r) => r.filename === 'x.wav'))
      .toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Per-root scoping (scan_roots / samples.root_id)
// ---------------------------------------------------------------------------

describe('per-root scoping', () => {
  it('ensureScanRoot is idempotent — same folder resolves to the same id', () => {
    const first = ensureScanRoot(db, 'root-drums')
    const second = ensureScanRoot(db, 'root-drums')
    expect(second).toBe(first)
    expect(scanRootId(db, 'root-drums')).toBe(first)
  })

  it('scanRootId returns undefined for a folder that has never been scanned', () => {
    expect(scanRootId(db, 'root-never-scanned')).toBeUndefined()
  })

  it("querySamples with rootId returns only that root's rows", () => {
    const drumsRoot = ensureScanRoot(db, 'root-drums')
    const synthsRoot = ensureScanRoot(db, 'root-synths')
    upsertStub(db, drumsRoot, 'kick.wav', 'kick.wav', 'wav', 1000, 1000)
    upsertStub(db, synthsRoot, 'pad.wav', 'pad.wav', 'wav', 1000, 1000)

    const drums = querySamples(db, { rootId: 'root-drums' })
    expect(drums.total).toBe(1)
    expect(drums.rows[0].filename).toBe('kick.wav')

    const synths = querySamples(db, { rootId: 'root-synths' })
    expect(synths.total).toBe(1)
    expect(synths.rows[0].filename).toBe('pad.wav')
  })

  it("querySamples with an unscanned rootId returns empty, not other roots' rows", () => {
    upsertStub(db, rootId, 'samples/kick.wav', 'kick.wav', 'wav', 1000, 1000)
    const result = querySamples(db, { rootId: 'root-never-scanned' })
    expect(result.rows).toHaveLength(0)
    expect(result.total).toBe(0)
  })

  it('hasSamples with rootId reflects only that root', () => {
    expect(hasSamples(db, 'root-drums')).toBe(false)
    const drumsRoot = ensureScanRoot(db, 'root-drums')
    // Scanned but empty folder still reads as un-indexed.
    expect(hasSamples(db, 'root-drums')).toBe(false)
    upsertStub(db, drumsRoot, 'kick.wav', 'kick.wav', 'wav', 1000, 1000)
    expect(hasSamples(db, 'root-drums')).toBe(true)
    expect(hasSamples(db, 'root-synths')).toBe(false)
  })
})

describe('syncCategoriesFromNames', () => {
  it('reports Unsorted plus the folder names it created', () => {
    const names = syncCategoriesFromNames(db, ['Drums', 'Synths'])
    expect(names).toContain(UNSORTED_CATEGORY)
    expect(names).toContain('Drums')
    expect(names).toContain('Synths')
    const roots = listCategories(db).filter((c) => c.parentId === null)
    expect(roots.map((c) => c.name)).toEqual(expect.arrayContaining(['Drums', 'Synths']))
  })

  it('never creates a duplicate of the reserved Unsorted category', () => {
    const names = syncCategoriesFromNames(db, [UNSORTED_CATEGORY, 'Drums'])
    expect(names.filter((n) => n === UNSORTED_CATEGORY)).toHaveLength(1)
    const unsorted = listCategories(db).filter(
      (c) => c.parentId === null && c.name === UNSORTED_CATEGORY
    )
    expect(unsorted).toHaveLength(1)
  })
})

describe('initSchema', () => {
  it('stamps a fresh database once and leaves existing schema version rows unchanged', () => {
    const initial = db.prepare('SELECT version FROM schema_version').all<{ version: number }>()
    expect(initial).toEqual([{ version: 1 }])

    initSchema(db)

    expect(db.prepare('SELECT version FROM schema_version').all<{ version: number }>()).toEqual(initial)
  })

  it('enables foreign-key enforcement for the connection', () => {
    const row = db.prepare('PRAGMA foreign_keys').get<{ foreign_keys: number }>()
    expect(row?.foreign_keys).toBe(1)
  })
})
