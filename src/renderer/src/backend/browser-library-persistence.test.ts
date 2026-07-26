
// @vitest-environment node
// SQL-layer tests run against sqlite-wasm with an in-memory database — the
// same engine the backend worker uses, minus the OPFS VFS (Node has no OPFS).
import sqlite3InitModule, { type Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DB } from './sql'
import { ANALYSIS_REVISION, initSchema, METADATA_REVISION } from './schema'
import { listAnalysisCandidates } from './analysis-persistence'
import {
  createTag,
  deleteLibrary,
  deleteTag,
  listLibraries,
  listMissingRelpaths,
  listTags,
  querySamples,
  renameTag,
  saveLibrary,
  setTagColor,
  assignTag,
  unassignTag,
  toFtsPrefixQuery
} from './browser-library-persistence'
import {
  commitFolderTagProjection,
  completeScanRoot,
  ensureFolderTags,
  ensureScanRoot,
  getLibraryRootState,
  listMetadataCandidates,
  resetFolderTagStage,
  scanRootId,
  markMetadataUnavailable,
  stageFolderTagsFromPath,
  upsertStub,
  updateMetadata,
  UNSORTED_TAG
} from './indexed-sample-persistence'

let sqlite3: Sqlite3Static
let db: DB
// Shared scan root for tests that need a sample row but don't exercise
// per-root scoping themselves (see the dedicated scoping describe below).
let rootId: number
const ROOT_KEY = 'root-main'

beforeAll(async () => {
  sqlite3 = await sqlite3InitModule()
})

beforeEach(() => {
  db = new DB(sqlite3, new sqlite3.oo1.DB(':memory:'))
  initSchema(db)
  rootId = ensureScanRoot(db, ROOT_KEY)
})

afterEach(() => {
  db.close()
})

/** Runs the same folder-tag projection the indexer runs: ensure tags for the
 *  discovered directories, stage every file's tags, then commit atomically.
 *  Tests go through this rather than poking rows directly so they exercise the
 *  shipping path in `runScan` (see indexer.ts phase 1). */
function projectFolderTags(
  targetRootId: number,
  directoryRelpaths: readonly string[],
  fileRelpaths: readonly string[] = []
): void {
  const activeTagIds = ensureFolderTags(db, directoryRelpaths)
  resetFolderTagStage(db)
  for (const relpath of fileRelpaths) {
    stageFolderTagsFromPath(db, targetRootId, relpath)
  }
  commitFolderTagProjection(db, targetRootId, activeTagIds)
}

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

  it('promotes an existing folder tag and applies the requested color', () => {
    projectFolderTags(rootId, ['Bass'])
    const tag = createTag(db, 'Bass', '#123456', ROOT_KEY)
    expect(tag).toMatchObject({ color: '#123456', origin: 'shared', folderDerived: true })
  })

  it('reports folder provenance for the active root while preserving global rename safety', () => {
    const otherRootId = ensureScanRoot(db, 'other-root')
    projectFolderTags(otherRootId, ['Shared'])

    expect(createTag(db, 'Shared', undefined, ROOT_KEY)).toMatchObject({ origin: 'shared', folderDerived: false })
    expect(createTag(db, 'Shared', undefined, 'other-root')).toMatchObject({ origin: 'shared', folderDerived: true })
  })
})

describe('renameTag (AC-008)', () => {
  it('renames a tag and the new name is visible', () => {
    const tag = createTag(db, 'OldName')
    renameTag(db, tag.id, 'NewName')
    const found = listTags(db).find((t) => t.id === tag.id)
    expect(found?.name).toBe('NewName')
  })

  it('does not advertise rename when another root derives the shared name', () => {
    const otherRootId = ensureScanRoot(db, 'other-root')
    projectFolderTags(otherRootId, ['Shared'])
    const tag = createTag(db, 'Shared')
    expect(listTags(db, ROOT_KEY).find(({ id }) => id === tag.id)).toMatchObject({ origin: 'shared', folderDerived: false })
    expect(() => renameTag(db, tag.id, 'Renamed')).toThrow(/managed automatically/)
  })
})

describe('setTagColor (AC-007)', () => {
  it('updates and clears a tag color', () => {
    const tag = createTag(db, 'Colored')

    setTagColor(db, tag.id, '#123456')
    expect(listTags(db).find((item) => item.id === tag.id)?.color).toBe('#123456')

    setTagColor(db, tag.id, null)
    expect(listTags(db).find((item) => item.id === tag.id)?.color).toBeNull()
  })
})

function sampleIdFor(relpath: string): number {
  const row = db
    .prepare('SELECT id FROM samples WHERE relpath = ?')
    .get<{ id: number }>(relpath)
  if (!row) throw new Error(`no sample row for ${relpath}`)
  return row.id
}

function assignedTagIds(sampleId: number): number[] {
  return db.prepare(
    'SELECT DISTINCT tag_id FROM sample_tags WHERE sample_id = ? ORDER BY tag_id'
  ).all<{ tag_id: number }>(sampleId).map(({ tag_id }) => tag_id)
}

describe('deleteTag (AC-009)', () => {
  it('deletes a tag and removes it from assigned samples', () => {
    upsertStub(db, rootId, 'samples/kick.wav', 'kick.wav', 'wav', 1024, Date.now())
    const sampleId = sampleIdFor('samples/kick.wav')
    const tag = createTag(db, 'ToDelete')
    assignTag(db, sampleId, tag.id)
    expect(assignedTagIds(sampleId)).toContain(tag.id)

    deleteTag(db, tag.id)
    expect(listTags(db).find((t) => t.id === tag.id)).toBeUndefined()
    expect(assignedTagIds(sampleId)).not.toContain(tag.id)
  })
})

describe('assignTag / unassignTag', () => {
  it('assigns and unassigns a tag to a sample', () => {
    upsertStub(db, rootId, 'samples/snare.wav', 'snare.wav', 'wav', 512, Date.now())
    const sampleId = sampleIdFor('samples/snare.wav')
    const tag = createTag(db, 'Snare')

    assignTag(db, sampleId, tag.id)
    expect(assignedTagIds(sampleId)).toContain(tag.id)

    unassignTag(db, sampleId, tag.id)
    expect(assignedTagIds(sampleId)).not.toContain(tag.id)
  })
})

// ---------------------------------------------------------------------------
// Samples
// ---------------------------------------------------------------------------

describe('folder-derived tag persistence', () => {
  it('assigns every directory segment as one shared flat tag and uses Unsorted at the root', () => {
    upsertStub(db, rootId, 'Hard Trance/Bass/kick.wav', 'kick.wav', 'wav', 1, 1)
    upsertStub(db, rootId, 'House/Bass/bass.wav', 'bass.wav', 'wav', 1, 1)
    upsertStub(db, rootId, 'loose.wav', 'loose.wav', 'wav', 1, 1)
    projectFolderTags(
      rootId,
      ['Hard Trance/Bass', 'House/Bass'],
      ['Hard Trance/Bass/kick.wav', 'House/Bass/bass.wav', 'loose.wav']
    )

    const tags = listTags(db, ROOT_KEY)
    expect(tags.map(({ name }) => name)).toEqual(['Bass', 'Hard Trance', 'House', 'Unsorted'])
    expect(tags.every(({ origin, folderDerived }) => origin === 'folder' && folderDerived)).toBe(true)
    const bassId = tags.find(({ name }) => name === 'Bass')!.id
    const hardTranceId = tags.find(({ name }) => name === 'Hard Trance')!.id
    expect(querySamples(db, { rootId: ROOT_KEY, tagIds: [bassId] }).rows).toHaveLength(2)
    expect(querySamples(db, { rootId: ROOT_KEY, tagIds: [hardTranceId, bassId] })
      .rows.map(({ filename }) => filename)).toEqual(['kick.wav'])
    expect(querySamples(db, { rootId: ROOT_KEY, tagIds: [tags.find(({ name }) => name === UNSORTED_TAG)!.id] })
      .rows[0]!.filename).toBe('loose.wav')
  })

  it('reconciles folder assignments without deleting user assignments', () => {
    upsertStub(db, rootId, 'Drums/Kicks/kick.wav', 'kick.wav', 'wav', 1, 1)
    projectFolderTags(rootId, ['Drums/Kicks'], ['Drums/Kicks/kick.wav'])
    const sampleId = sampleIdFor('Drums/Kicks/kick.wav')
    const favorite = createTag(db, 'Favorite')
    assignTag(db, sampleId, favorite.id)

    // Re-scan after the file moved: the folder projection is rebuilt from
    // scratch, so the stale 'Kicks' assignment must go while the user's
    // 'Favorite' assignment survives.
    db.prepare('UPDATE samples SET relpath = ? WHERE id = ?').run('Drums/Snares/kick.wav', sampleId)
    projectFolderTags(rootId, ['Drums/Snares'], ['Drums/Snares/kick.wav'])

    expect(querySamples(db, { rootId: ROOT_KEY }).rows[0]!.tags).toEqual(['Drums', 'Favorite', 'Snares'])
  })

  it('keeps folder provenance when the matching user tag is deleted', () => {
    upsertStub(db, rootId, 'Drums/kick.wav', 'kick.wav', 'wav', 1, 1)
    projectFolderTags(rootId, ['Drums'], ['Drums/kick.wav'])
    const sampleId = sampleIdFor('Drums/kick.wav')

    const dualSourceTag = createTag(db, 'Drums')
    assignTag(db, sampleId, dualSourceTag.id)
    expect(listTags(db, ROOT_KEY).find(({ id }) => id === dualSourceTag.id)).toMatchObject({ origin: 'shared', folderDerived: true })

    deleteTag(db, dualSourceTag.id)

    expect(listTags(db, ROOT_KEY).find(({ id }) => id === dualSourceTag.id)).toMatchObject({ origin: 'folder', folderDerived: true })
    expect(assignedTagIds(sampleId)).toContain(dualSourceTag.id)
    expect(db.prepare('SELECT source FROM sample_tags WHERE sample_id = ? AND tag_id = ?')
      .all<{ source: string }>(sampleId, dualSourceTag.id)).toEqual([{ source: 'folder' }])
    expect(() => renameTag(db, dualSourceTag.id, 'Percussion')).toThrow(/managed automatically/)
    expect(() => deleteTag(db, dualSourceTag.id)).toThrow(/cannot be edited/)
  })
})

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
    expect(assignedTagIds(sampleId)).toContain(tag.id)
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

  it('resets metadata and analysis revisions only when file bytes change', () => {
    upsertStub(db, rootId, 'samples/loop.wav', 'loop.wav', 'wav', 2048, 1000)
    updateMetadata(db, rootId, 'samples/loop.wav', 3.0, 44100, 2)
    const sampleId = sampleIdFor('samples/loop.wav')
    db.prepare('UPDATE samples SET analysis_revision = ? WHERE id = ?')
      .run(ANALYSIS_REVISION, sampleId)

    upsertStub(db, rootId, 'samples/loop.wav', 'loop.wav', 'wav', 2048, 1000)
    expect(db.prepare(
      'SELECT metadata_revision, analysis_revision FROM samples WHERE id = ?'
    ).get(sampleId)).toEqual({
      metadata_revision: METADATA_REVISION,
      analysis_revision: ANALYSIS_REVISION
    })

    upsertStub(db, rootId, 'samples/loop.wav', 'loop.wav', 'wav', 4096, 2000)
    expect(db.prepare(
      'SELECT metadata_revision, analysis_revision FROM samples WHERE id = ?'
    ).get(sampleId)).toEqual({ metadata_revision: 0, analysis_revision: 0 })
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

  it('stamps terminal metadata attempts and selects retries by trigger/revision', () => {
    upsertStub(db, rootId, 'samples/broken.wav', 'broken.wav', 'wav', 10, 1000)
    markMetadataUnavailable(db, rootId, 'samples/broken.wav')
    const sampleId = sampleIdFor('samples/broken.wav')

    expect(listMetadataCandidates(db, rootId, false)).toEqual([])
    expect(listMetadataCandidates(db, rootId, true)).toEqual([
      { relpath: 'samples/broken.wav' }
    ])
    expect(listMetadataCandidates(db, rootId, false, METADATA_REVISION + 1)).toEqual([
      { relpath: 'samples/broken.wav' }
    ])

    updateMetadata(db, rootId, 'samples/broken.wav', 1, 44100, 1)
    expect(listAnalysisCandidates(db, rootId)).toEqual([
      { id: sampleId, relpath: 'samples/broken.wav' }
    ])
  })

  it('clears stale automatic analysis but preserves manual values when metadata is unavailable', () => {
    upsertStub(db, rootId, 'samples/changed.wav', 'changed.wav', 'wav', 100, 1000)
    updateMetadata(db, rootId, 'samples/changed.wav', 2, 44100, 2)
    const sampleId = sampleIdFor('samples/changed.wav')
    db.prepare(
      `UPDATE samples
       SET bpm = 128, bpm_source = 'analysis',
           musical_key = 'Am', musical_key_source = 'manual',
           sample_type = 'Loop', sample_type_source = 'analysis',
           analysis_revision = ?
       WHERE id = ?`
    ).run(ANALYSIS_REVISION, sampleId)

    upsertStub(db, rootId, 'samples/changed.wav', 'changed.wav', 'wav', 200, 2000)
    markMetadataUnavailable(db, rootId, 'samples/changed.wav')

    expect(db.prepare(
      `SELECT bpm, bpm_source, musical_key, musical_key_source,
              sample_type, sample_type_source, scan_state,
              metadata_revision, analysis_revision
       FROM samples WHERE id = ?`
    ).get(sampleId)).toEqual({
      bpm: null,
      bpm_source: null,
      musical_key: 'Am',
      musical_key_source: 'manual',
      sample_type: null,
      sample_type_source: null,
      scan_state: 3,
      metadata_revision: METADATA_REVISION,
      analysis_revision: ANALYSIS_REVISION
    })
    expect(listAnalysisCandidates(db, rootId)).toEqual([])
  })
})

describe('analysis revision selection', () => {
  it('selects only stale rows and stamps valid NULL attempts current', () => {
    upsertStub(db, rootId, 'samples/pending.wav', 'pending.wav', 'wav', 100, 1000)
    updateMetadata(db, rootId, 'samples/pending.wav', 1, 44100, 1)
    const sampleId = sampleIdFor('samples/pending.wav')

    expect(listAnalysisCandidates(db, rootId)).toEqual([
      { id: sampleId, relpath: 'samples/pending.wav' }
    ])
    db.prepare('UPDATE samples SET analysis_revision = ? WHERE id = ?')
      .run(ANALYSIS_REVISION, sampleId)
    expect(listAnalysisCandidates(db, rootId)).toEqual([])
  })
})

describe('retiring missing samples', () => {
  it('sets scan_state=2 and hides file from normal queries', () => {
    upsertStub(db, rootId, 'samples/gone.wav', 'gone.wav', 'wav', 1024, 1000)
    commitFolderTagProjection(db, rootId, new Set(), ['samples/gone.wav'])
    const { rows } = querySamples(db, {})
    expect(rows.find((r) => r.relpath === 'samples/gone.wav')).toBeUndefined()
  })
})

describe('listMissingRelpaths (spec-002 AC-013)', () => {
  it('returns missing relpaths for the root, scoped and empty-safe', () => {
    upsertStub(db, rootId, 'samples/gone.wav', 'gone.wav', 'wav', 1024, 1000)
    upsertStub(db, rootId, 'samples/here.wav', 'here.wav', 'wav', 1024, 1000)
    expect(listMissingRelpaths(db, 'root-main')).toEqual([])

    commitFolderTagProjection(db, rootId, new Set(), ['samples/gone.wav'])
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

describe('querySamples (AC-004, AC-005, AC-006, AC-016)', () => {
  beforeEach(() => {
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

    const allNames = [...page1.rows, ...page2.rows, ...page3.rows].map((r) => r.filename)
    expect(new Set(allNames).size).toBe(allNames.length)

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

  it('rolls back the library row when saving its rule fails', () => {
    db.exec(`
      CREATE TRIGGER reject_library_rule
      BEFORE INSERT ON library_rules
      BEGIN
        SELECT RAISE(ABORT, 'forced rule failure');
      END;
    `)

    expect(() => saveLibrary(db, 'Orphan', '{}')).toThrow('forced rule failure')
    expect(db.prepare('SELECT id, name FROM libraries').all()).toEqual([])
    expect(db.prepare('SELECT library_id FROM library_rules').all()).toEqual([])
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

  it('readiness is root-scoped and treats a completed empty root as ready', () => {
    expect(getLibraryRootState(db, 'root-drums').hasUsableIndex).toBe(false)
    const drumsRoot = ensureScanRoot(db, 'root-drums')
    expect(getLibraryRootState(db, 'root-drums').hasUsableIndex).toBe(false)
    completeScanRoot(db, drumsRoot, 1234)
    expect(getLibraryRootState(db, 'root-drums')).toEqual({
      rootKey: 'root-drums',
      lastCompletedAt: 1234,
      hasUsableIndex: true
    })
    expect(getLibraryRootState(db, 'root-synths').hasUsableIndex).toBe(false)
  })

  it('keeps current partial first-sync rows unusable but preserves migrated roots', () => {
    const partialRoot = ensureScanRoot(db, 'root-partial')
    upsertStub(db, partialRoot, 'partial.wav', 'partial.wav', 'wav', 100, 100)
    updateMetadata(db, partialRoot, 'partial.wav', 1, 44100, 1)
    expect(getLibraryRootState(db, 'root-partial').hasUsableIndex).toBe(false)

    db.prepare(
      'UPDATE scan_roots SET legacy_index_available = 1 WHERE id = ?'
    ).run(partialRoot)
    expect(getLibraryRootState(db, 'root-partial').hasUsableIndex).toBe(true)
  })
})

describe('initSchema', () => {
  it('stamps a fresh database once and leaves existing schema version rows unchanged', () => {
    const initial = db.prepare('SELECT version FROM schema_version').all<{ version: number }>()
    expect(initial).toEqual([{ version: 6 }])

    initSchema(db)

    expect(db.prepare('SELECT version FROM schema_version').all<{ version: number }>()).toEqual(initial)
  })

  it('enables foreign-key enforcement for the connection', () => {
    const row = db.prepare('PRAGMA foreign_keys').get<{ foreign_keys: number }>()
    expect(row?.foreign_keys).toBe(1)
  })
})
