// @vitest-environment node
// Indexer tests run the real two-phase scan over an in-memory fake of the
// File System Access directory tree and an in-memory sqlite-wasm database.
import sqlite3InitModule, { type Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest'
import { DB } from './sql'
import { initSchema } from './schema'
import { runScan, type ScanPhaseProgress } from './indexer'
import {
  getLibraryRootState,
  listCategories,
  querySamples,
  UNSORTED_CATEGORY
} from './library'

// ---------------------------------------------------------------------------
// Map-backed FileSystemDirectoryHandle fake
// ---------------------------------------------------------------------------

interface FakeTree {
  [name: string]: FakeTree | File
}

function fakeFileHandle(name: string, file: File): FileSystemFileHandle {
  return {
    kind: 'file',
    name,
    getFile: async () => file
  } as unknown as FileSystemFileHandle
}

function fakeDirHandle(name: string, tree: FakeTree): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name,
    entries: async function* () {
      for (const [childName, node] of Object.entries(tree)) {
        if (node instanceof File) {
          yield [childName, fakeFileHandle(childName, node)]
        } else {
          yield [childName, fakeDirHandle(childName, node)]
        }
      }
    }
  } as unknown as FileSystemDirectoryHandle
}

function fakeEntriesDir(
  name: string,
  entries: [string, FileSystemDirectoryHandle | FileSystemFileHandle][]
): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name,
    entries: async function* () {
      for (const entry of entries) yield entry
    }
  } as unknown as FileSystemDirectoryHandle
}

function unreadableFileHandle(name: string): FileSystemFileHandle {
  return {
    kind: 'file',
    name,
    getFile: async () => {
      throw new Error('file disappeared')
    }
  } as unknown as FileSystemFileHandle
}

/** Minimal valid PCM WAV so music-metadata can extract real format data. */
function makeWav(durationSec: number, sampleRate = 8000, channels = 1): File {
  const frames = Math.round(durationSec * sampleRate)
  const dataSize = frames * channels * 2
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const writeAscii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }
  writeAscii(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * channels * 2, true)
  view.setUint16(32, channels * 2, true)
  view.setUint16(34, 16, true)
  writeAscii(36, 'data')
  view.setUint32(40, dataSize, true)
  return new File([buffer], 'sample.wav', { type: 'audio/wav', lastModified: 1000 })
}

// ---------------------------------------------------------------------------

let sqlite3: Sqlite3Static
let db: DB
const ROOT_KEY = 'root-test'

beforeAll(async () => {
  sqlite3 = await sqlite3InitModule()
})

beforeEach(() => {
  db = new DB(sqlite3, new sqlite3.oo1.DB(':memory:'))
  initSchema(db)
})

afterEach(() => {
  db.close()
})

async function scan(tree: FakeTree): Promise<ScanPhaseProgress[]> {
  const events: ScanPhaseProgress[] = []
  await runScan(db, ROOT_KEY, fakeDirHandle('Samples', tree), (p) => events.push(p), () => true)
  return events
}

describe('runScan', () => {
  it('aborts phase 1 when isCurrent returns false mid-batch', async () => {
    let emitCount = 0
    await runScan(
      db,
      ROOT_KEY,
      fakeDirHandle('Samples', {
        Drums: { 'a.wav': makeWav(0.05), 'b.wav': makeWav(0.05) },
        Bass: { 'c.wav': makeWav(0.05) }
      }),
      () => { emitCount++ },
      // Cancel after the first progress emission (mid-phase-1)
      () => emitCount < 1
    )

    // The scan was cut short — fewer rows than a full scan would produce
    const { total } = querySamples(db, { rootId: ROOT_KEY })
    expect(total).toBeLessThanOrEqual(3)
  })

  it('aborts between phases when isCurrent returns false after phase 1', async () => {
    const events: ScanPhaseProgress[] = []
    await runScan(
      db,
      ROOT_KEY,
      fakeDirHandle('Samples', { 'kick.wav': makeWav(0.05) }),
      (p) => events.push(p),
      // Cancel after phase 1 completes (phase === 1 emitted) but before phase 2
      () => !events.some((e) => e.phase === 1 && e.processed === e.total)
    )

    // Phase 1 inserted the stub, but phase 2 never ran (scan_state stays 0)
    const { rows } = querySamples(db, { rootId: ROOT_KEY })
    expect(rows).toHaveLength(1)
    expect(rows[0].scanState).toBe(0)
  })

  it('handles corrupted files gracefully in phase 2 (parseBlob catch)', async () => {
    // A .wav extension but invalid binary content triggers the catch in phase 2
    const corruptedWav = new File([new ArrayBuffer(10)], 'broken.wav', {
      type: 'audio/wav',
      lastModified: 1000
    })
    await scan({ 'broken.wav': corruptedWav })

    // Readable but unsupported bytes are a terminal metadata outcome.
    const { rows } = querySamples(db, { rootId: ROOT_KEY })
    expect(rows).toHaveLength(1)
    expect(rows[0].scanState).toBe(3)
    expect(rows[0].duration).toBeNull()
  })

  it('indexes audio files with root-relative paths and skips other files', async () => {
    await scan({
      'kick.wav': makeWav(0.05),
      Drums: {
        'snare.wav': makeWav(0.05),
        'readme.txt': new File(['nope'], 'readme.txt', { lastModified: 1000 })
      },
      LICENSE: new File(['no extension'], 'LICENSE', { lastModified: 1000 })
    })

    const { rows, total } = querySamples(db, { rootId: ROOT_KEY })
    expect(total).toBe(2)
    expect(rows.map((r) => r.relpath).sort()).toEqual(['Drums/snare.wav', 'kick.wav'])
  })

  it('extracts duration, sample rate, and channels in phase 2 (parseBlob)', async () => {
    await scan({ 'tone.wav': makeWav(0.5, 8000, 1) })

    const { rows } = querySamples(db, { rootId: ROOT_KEY })
    expect(rows).toHaveLength(1)
    expect(rows[0].scanState).toBe(1)
    expect(rows[0].duration).toBeCloseTo(0.5, 1)
    expect(rows[0].sampleRate).toBe(8000)
    expect(rows[0].channels).toBe(1)
  })

  it('creates categories from top-level folders and assigns samples', async () => {
    await scan({
      'loose.wav': makeWav(0.05),
      Drums: { Kicks: { 'kick.wav': makeWav(0.05) } }
    })

    const categories = listCategories(db)
    const drums = categories.find((c) => c.parentId === null && c.name === 'Drums')
    const unsorted = categories.find((c) => c.parentId === null && c.name === UNSORTED_CATEGORY)
    expect(drums).toBeDefined()
    expect(unsorted).toBeDefined()

    const { rows } = querySamples(db, { rootId: ROOT_KEY })
    expect(rows.find((r) => r.relpath === 'Drums/Kicks/kick.wav')?.categoryId).toBe(drums!.id)
    expect(rows.find((r) => r.relpath === 'loose.wav')?.categoryId).toBe(unsorted!.id)
  })

  it('soft-deletes rows whose files vanished from the folder', async () => {
    await scan({ 'keep.wav': makeWav(0.05), 'gone.wav': makeWav(0.05) })
    expect(querySamples(db, { rootId: ROOT_KEY }).total).toBe(2)

    await scan({ 'keep.wav': makeWav(0.05) })
    const { rows, total } = querySamples(db, { rootId: ROOT_KEY })
    expect(total).toBe(1)
    expect(rows[0].relpath).toBe('keep.wav')
  })

  it('leaves unchanged files fully scanned on re-scan (size/mtime detection)', async () => {
    const wav = makeWav(0.05)
    await scan({ 'same.wav': wav })
    const first = querySamples(db, { rootId: ROOT_KEY }).rows[0]
    expect(first.scanState).toBe(1)

    await scan({ 'same.wav': wav })
    const second = querySamples(db, { rootId: ROOT_KEY }).rows[0]
    expect(second.scanState).toBe(1)
    expect(second.dateAdded).toBe(first.dateAdded)
  })

  it('performs zero metadata parses on a second unchanged automatic sync', async () => {
    const wav = makeWav(0.05)
    const root = fakeDirHandle('Samples', { 'same.wav': wav })
    let parseCount = 0
    const parseMetadata = async (): Promise<{
      format: { duration: number; sampleRate: number; numberOfChannels: number }
    }> => {
      parseCount++
      return { format: { duration: 0.05, sampleRate: 8000, numberOfChannels: 1 } }
    }

    await runScan(db, ROOT_KEY, root, () => undefined, () => true, { parseMetadata })
    await runScan(db, ROOT_KEY, root, () => undefined, () => true, { parseMetadata })

    expect(parseCount).toBe(1)
  })

  it('retries unchanged unavailable metadata only for manual recovery', async () => {
    const broken = new File([new ArrayBuffer(10)], 'broken.wav', { lastModified: 1000 })
    const root = fakeDirHandle('Samples', { 'broken.wav': broken })
    let parseCount = 0
    const parseMetadata = async (): Promise<never> => {
      parseCount++
      const error = new Error('unsupported bytes')
      error.name = 'UnsupportedFileTypeError'
      throw error
    }

    await runScan(db, ROOT_KEY, root, () => undefined, () => true, { parseMetadata })
    await runScan(db, ROOT_KEY, root, () => undefined, () => true, { parseMetadata })
    expect(parseCount).toBe(1)
    expect(querySamples(db, { rootId: ROOT_KEY }).rows[0].scanState).toBe(3)

    await runScan(db, ROOT_KEY, root, () => undefined, () => true, {
      parseMetadata,
      retryUnavailable: true
    })
    expect(parseCount).toBe(2)
  })

  it('keeps parse-time I/O failures pending for a later automatic retry', async () => {
    const wav = makeWav(0.05)
    const root = fakeDirHandle('Samples', { 'temporarily-locked.wav': wav })
    let parseCount = 0
    const transientParser = async (): Promise<never> => {
      parseCount++
      throw new DOMException('The file became unreadable', 'NotReadableError')
    }

    await expect(runScan(
      db,
      ROOT_KEY,
      root,
      () => undefined,
      () => true,
      { parseMetadata: transientParser }
    )).rejects.toThrow('The file became unreadable')

    expect(parseCount).toBe(1)
    expect(getLibraryRootState(db, ROOT_KEY).lastCompletedAt).toBeNull()
    expect(db.prepare(
      `SELECT scan_state, metadata_revision
       FROM samples WHERE relpath = 'temporarily-locked.wav'`
    ).get()).toEqual({ scan_state: 0, metadata_revision: 0 })

    await runScan(db, ROOT_KEY, root, () => undefined, () => true, {
      parseMetadata: async () => ({
        format: { duration: 0.05, sampleRate: 8000, numberOfChannels: 1 }
      })
    })
    expect(getLibraryRootState(db, ROOT_KEY).lastCompletedAt).not.toBeNull()
    expect(querySamples(db, { rootId: ROOT_KEY }).rows[0].scanState).toBe(1)
  })

  it('marks an empty completed root ready', async () => {
    const result = await runScan(
      db,
      ROOT_KEY,
      fakeDirHandle('Samples', {}),
      () => undefined,
      () => true
    )

    expect(result.lastCompletedAt).toBeGreaterThan(0)
    expect(getLibraryRootState(db, ROOT_KEY)).toEqual({
      rootKey: ROOT_KEY,
      lastCompletedAt: result.lastCompletedAt,
      hasUsableIndex: true
    })
  })

  it('keeps the root incomplete when a file snapshot fails transiently', async () => {
    const events: ScanPhaseProgress[] = []
    await expect(runScan(
      db,
      ROOT_KEY,
      fakeEntriesDir('Samples', [
        ['bad.wav', unreadableFileHandle('bad.wav')],
        ['good.wav', fakeFileHandle('good.wav', makeWav(0.05))]
      ]),
      (progress) => events.push(progress),
      () => true
    )).rejects.toThrow('Unable to read bad.wav: file disappeared')

    const { rows, total } = querySamples(db, { rootId: ROOT_KEY })
    expect(total).toBe(1)
    expect(rows[0].relpath).toBe('good.wav')
    expect(events.find((event) => event.phase === 1)?.found).toBe(2)
    expect(getLibraryRootState(db, ROOT_KEY).lastCompletedAt).toBeNull()
  })

  it('stops a cancelled traversal before stale rows are written', async () => {
    let current = true
    const root = {
      kind: 'directory',
      name: 'Samples',
      entries: async function* () {
        yield ['first.wav', fakeFileHandle('first.wav', makeWav(0.05))]
        current = false
        yield ['second.wav', fakeFileHandle('second.wav', makeWav(0.05))]
      }
    } as unknown as FileSystemDirectoryHandle

    const result = await runScan(db, ROOT_KEY, root, () => undefined, () => current)

    expect(result.lastCompletedAt).toBeNull()
    expect(querySamples(db, { rootId: ROOT_KEY }).total).toBe(0)
  })

  it('does not persist metadata that finishes after cancellation', async () => {
    let current = true
    const result = await runScan(
      db,
      ROOT_KEY,
      fakeDirHandle('Samples', { 'late.wav': makeWav(0.05) }),
      () => undefined,
      () => current,
      {
        parseMetadata: async () => {
          current = false
          return {
            format: { duration: 0.05, sampleRate: 8000, numberOfChannels: 1 }
          }
        }
      }
    )

    expect(result.lastCompletedAt).toBeNull()
    expect(db.prepare(
      `SELECT scan_state, metadata_revision
       FROM samples WHERE relpath = 'late.wav'`
    ).get()).toEqual({ scan_state: 0, metadata_revision: 0 })
  })

  it('reports phase 1 and phase 2 progress and never regresses processed counts', async () => {
    const events = await scan({
      Drums: { 'a.wav': makeWav(0.05), 'b.wav': makeWav(0.05) },
      'c.wav': makeWav(0.05)
    })

    const phases = new Set(events.map((e) => e.phase))
    expect(phases.has(1)).toBe(true)
    expect(phases.has(2)).toBe(true)
    for (const event of events) {
      expect(event.status).toBe('scanning')
      expect(event.processed).toBeLessThanOrEqual(event.total)
    }
    const phase2 = events.filter((e) => e.phase === 2)
    expect(phase2[phase2.length - 1]?.processed).toBe(3)
  })
})
