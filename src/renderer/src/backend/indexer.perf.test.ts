// @vitest-environment node

/**
 * Large-library functional stress test.
 *
 * This test generates a synthetic library with many samples (default: 10,000)
 * and runs a full two-phase scan. It does not provide performance evidence.
 * Run with: npx vitest run --project=backend src/renderer/src/backend/indexer.perf.test.ts
 *
 * Performance measurements must use the real fixtures in tmp/test-samples and
 * record the environment, workload, method, and result.
 */
import sqlite3InitModule, { type Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest'
import { DB } from './sql'
import { initSchema } from './schema'
import { runScan, type ScanPhaseProgress } from './indexer'
import { querySamples } from './library'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Number of synthetic WAV files to generate for the stress run. */
const SAMPLE_COUNT = parseInt(process.env['PERF_SAMPLE_COUNT'] ?? '10000', 10)

// ---------------------------------------------------------------------------
// Map-backed FileSystemDirectoryHandle fake
// ---------------------------------------------------------------------------

interface FakeTree { [name: string]: FakeTree | File }

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

/** Minimal valid PCM WAV so music-metadata can extract real format data.
 *  Uses the same generator as indexer.test.ts. */
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
// Generate a fake sample directory tree with SAMPLE_COUNT files across
// multiple categories, matching a realistic library structure.
// ---------------------------------------------------------------------------

function generateLargeTree(count: number): FakeTree {
  const categories = ['Drums', 'Bass', 'Synth', 'FX', 'Vocal', 'Loop', 'Percussion', 'Atmosphere']
  const tree: FakeTree = {}

  // Use a single shared 50ms WAV buffer to reduce memory pressure.
  const sharedWav = makeWav(0.05)
  for (let i = 0; i < count; i++) {
    const category = categories[i % categories.length]
    const dir = (tree[category] = (tree[category] || {}) as FakeTree)
    dir[`sample_${String(i).padStart(6, '0')}.wav`] = sharedWav
  }

  return tree
}

// ---------------------------------------------------------------------------

let sqlite3: Sqlite3Static
let db: DB
const ROOT_KEY = 'perf-test-root'

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

describe('large-library scan stress', () => {
  it(`indexes ${SAMPLE_COUNT} synthetic samples`, async () => {
    const tree = generateLargeTree(SAMPLE_COUNT)
    const events: ScanPhaseProgress[] = []

    await runScan(
      db,
      ROOT_KEY,
      fakeDirHandle('Samples', tree),
      (progress) => events.push(progress),
      () => true
    )
    // Verify the full scan completed.
    const lastEvent = events[events.length - 1]
    expect(lastEvent).toBeDefined()
    expect(lastEvent.status).toBe('scanning')
    expect(lastEvent.phase).toBe(2)
    expect(lastEvent.processed).toBe(SAMPLE_COUNT)

    // Verify all samples are queryable.
    const { total, rows } = querySamples(db, { rootId: ROOT_KEY, limit: 1 })
    expect(total).toBe(SAMPLE_COUNT)
    expect(rows).toHaveLength(1)

    // Verify all samples have metadata extracted (phase 2 complete).
    const { rows: allRows } = querySamples(db, { rootId: ROOT_KEY, limit: SAMPLE_COUNT })
    const scanned = allRows.filter((r) => r.scanState === 1).length
    expect(scanned).toBe(SAMPLE_COUNT)

  }, 90_000)
})
