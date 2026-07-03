// @vitest-environment node
// Indexer tests run the real two-phase scan over an in-memory fake of the
// File System Access directory tree and an in-memory sqlite-wasm database.
import sqlite3InitModule, { type Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest'
import { DB } from './sql'
import { initSchema } from './schema'
import { runScan } from './indexer'
import { listCategories, querySamples, UNSORTED_CATEGORY } from './library'
import type { ScanProgress } from '../../../shared/backend-api'

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

async function scan(tree: FakeTree): Promise<ScanProgress[]> {
  const events: ScanProgress[] = []
  await runScan(db, ROOT_KEY, fakeDirHandle('Samples', tree), (p) => events.push(p))
  return events
}

describe('runScan', () => {
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

  it('skips files that disappear before their snapshot can be read', async () => {
    const events: ScanProgress[] = []
    await runScan(
      db,
      ROOT_KEY,
      fakeEntriesDir('Samples', [
        ['bad.wav', unreadableFileHandle('bad.wav')],
        ['good.wav', fakeFileHandle('good.wav', makeWav(0.05))]
      ]),
      (progress) => events.push(progress)
    )

    const { rows, total } = querySamples(db, { rootId: ROOT_KEY })
    expect(total).toBe(1)
    expect(rows[0].relpath).toBe('good.wav')
    expect(events.find((event) => event.phase === 1)?.found).toBe(2)
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
