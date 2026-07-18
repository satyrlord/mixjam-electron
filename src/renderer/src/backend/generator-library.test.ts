// @vitest-environment node
import sqlite3InitModule, { type Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { categorySlot } from '../../../shared/sample-palette'
import {
  fingerprintGeneratorSnapshot,
  getStoredGeneratorReadiness,
  loadGeneratorSnapshot,
  selectGeneratorAnalysisGroup,
  type GeneratorCandidate,
  type GeneratorRootSnapshot
} from './generator-library'
import { ANALYSIS_REVISION, initSchema, METADATA_REVISION } from './schema'
import { DB } from './sql'

let sqlite3: Sqlite3Static
let db: DB

beforeAll(async () => { sqlite3 = await sqlite3InitModule() })
beforeEach(() => {
  db = new DB(sqlite3, new sqlite3.oo1.DB(':memory:'))
  initSchema(db)
})
afterEach(() => db.close())

function insertRoot(key: string, completed = true): number {
  const rootId = db.prepare(
    'INSERT INTO scan_roots (key, last_completed_at) VALUES (?, ?)'
  ).run(key, completed ? 1_000 : null).lastInsertRowid
  db.prepare(
    `INSERT INTO analysis_groups (
       root_id, relpath_prefix, depth, sample_count, state, bpm, musical_key,
       bpm_support, key_support, confidence, analysis_revision
     ) VALUES (?, '', 0, 1, 'resolved', 120, 'Am', 1, 1, 1, ?)`
  ).run(rootId, ANALYSIS_REVISION)
  return rootId
}

function insertCategory(name: string): number {
  return db.prepare(
    'INSERT INTO categories (name, parent_id) VALUES (?, NULL)'
  ).run(name).lastInsertRowid
}

interface SampleOverrides {
  relpath?: string
  filename?: string
  sizeBytes?: number | null
  mtime?: number | null
  duration?: number | null
  bpm?: number | null
  musicalKey?: string | null
  sampleType?: string | null
  scanState?: number
  metadataRevision?: number
  analysisRevision?: number
  categoryId?: number | null
}

function insertSample(rootId: number, overrides: SampleOverrides = {}): void {
  const relpath = overrides.relpath ?? 'kick.wav'
  db.prepare(
    `INSERT INTO samples (
       root_id, relpath, filename, ext, size_bytes, mtime, duration,
       bpm, bpm_source, musical_key, musical_key_source,
       sample_type, sample_type_source, date_added, scan_state,
       metadata_revision, analysis_revision, category_id
     ) VALUES (?, ?, ?, 'wav', ?, ?, ?, ?, 'analysis', ?, 'analysis', ?, 'analysis',
               1, ?, ?, ?, ?)`
  ).run(
    rootId,
    relpath,
    overrides.filename ?? relpath,
    overrides.sizeBytes ?? 1_024,
    overrides.mtime ?? 2_000,
    overrides.duration ?? 0.5,
    overrides.bpm ?? 120,
    overrides.musicalKey ?? 'Am',
    overrides.sampleType ?? 'Kick',
    overrides.scanState ?? 1,
    overrides.metadataRevision ?? METADATA_REVISION,
    overrides.analysisRevision ?? ANALYSIS_REVISION,
    overrides.categoryId ?? null
  )
}

function candidate(overrides: Partial<GeneratorCandidate> = {}): GeneratorCandidate {
  return {
    relpath: 'Drums/kick.wav',
    filename: 'kick.wav',
    sizeBytes: 1_024,
    mtime: 2_000,
    duration: 0.5,
    bpm: 128,
    musicalKey: 'Am',
    sampleType: 'Kick',
    categoryName: 'Drums',
    paletteSlot: categorySlot('Drums'),
    metadataRevision: METADATA_REVISION,
    analysisRevision: ANALYSIS_REVISION,
    ...overrides
  }
}

function snapshot(candidates: GeneratorCandidate[], rootKey = 'root'): GeneratorRootSnapshot {
  return {
    rootKey,
    candidates,
    analysisSummary: {
      state: 'resolved',
      sampleCount: candidates.length,
      bpm: 128,
      musicalKey: 'Am',
      bpmSupport: 1,
      keySupport: 1,
      confidence: 1,
      clusters: [{
        relpathPrefix: '',
        sampleCount: candidates.length,
        bpm: 128,
        musicalKey: 'Am',
        bpmSupport: 1,
        keySupport: 1,
        confidence: 1
      }]
    }
  }
}

describe('generator library snapshot', () => {
  it('scopes candidates to the requested root and keeps only current, typed, positive-duration rows', () => {
    const drums = insertCategory('Drums')
    const requestedRoot = insertRoot('requested-root')
    const otherRoot = insertRoot('other-root')

    insertSample(requestedRoot, { relpath: 'valid.wav', categoryId: drums })
    insertSample(requestedRoot, { relpath: 'zero.wav', duration: 0 })
    insertSample(requestedRoot, { relpath: 'invalid-type.wav', sampleType: 'Guitar' })
    insertSample(requestedRoot, { relpath: 'missing.wav', scanState: 2 })
    insertSample(otherRoot, { relpath: 'other.wav' })

    expect(getStoredGeneratorReadiness(db, 'requested-root')).toEqual({
      status: 'ready',
      analysisState: 'resolved',
      detectedBpm: 120,
      eligibleSamples: 1,
      tempoClusters: [{
        relpathPrefix: '', sampleCount: 1, bpm: 120, musicalKey: 'Am', confidence: 1
      }]
    })
    expect(loadGeneratorSnapshot(db, 'requested-root').candidates.map((row) => row.relpath))
      .toEqual(['valid.wav'])
  })

  it('requires root completion and rejects pending metadata or analysis work', () => {
    const incompleteRoot = insertRoot('incomplete-root', false)
    insertSample(incompleteRoot)
    expect(getStoredGeneratorReadiness(db, 'incomplete-root').status).toBe('needs-preparation')
    expect(() => loadGeneratorSnapshot(db, 'incomplete-root'))
      .toThrow('The Sample Folder has not completed preparation.')

    const metadataPendingRoot = insertRoot('metadata-pending-root')
    insertSample(metadataPendingRoot, {
      relpath: 'metadata-stale.wav',
      metadataRevision: METADATA_REVISION - 1
    })
    expect(getStoredGeneratorReadiness(db, 'metadata-pending-root')).toEqual({
      status: 'needs-preparation',
      message: 'Finish library metadata and analysis before generating.'
    })
    expect(() => loadGeneratorSnapshot(db, 'metadata-pending-root'))
      .toThrow('The Sample Folder still has metadata or analysis work pending.')

    const analysisPendingRoot = insertRoot('analysis-pending-root')
    insertSample(analysisPendingRoot, {
      relpath: 'analysis-stale.wav',
      analysisRevision: ANALYSIS_REVISION - 1
    })
    expect(getStoredGeneratorReadiness(db, 'analysis-pending-root').status)
      .toBe('needs-preparation')
    expect(() => loadGeneratorSnapshot(db, 'analysis-pending-root'))
      .toThrow('The Sample Folder still has metadata or analysis work pending.')
  })

  it('retains organizational category appearance separately from acoustic type', () => {
    const drums = insertCategory('Drums')
    const root = insertRoot('category-root')
    insertSample(root, { sampleType: 'Bass', categoryId: drums })

    expect(loadGeneratorSnapshot(db, 'category-root').candidates[0]).toMatchObject({
      sampleType: 'Bass',
      categoryName: 'Drums',
      paletteSlot: categorySlot('Drums')
    })
  })
})

describe('generator analyzer-group selection', () => {
  const parameters = {
    profileId: 'techno' as const,
    bpmMode: 'follow-detected' as const,
    intensity: 'medium' as const,
    durationSeconds: 180,
    seed: 'cluster-seed'
  }

  it('requires an explicit canonical group for mixed roots and filters by exact prefix', () => {
    const mixed = snapshot([
      candidate({ relpath: 'Dance/kick.wav' }),
      candidate({ relpath: 'Techno/kick.wav' })
    ])
    mixed.analysisSummary = {
      ...mixed.analysisSummary,
      state: 'mixed',
      bpm: null,
      musicalKey: null,
      clusters: [
        { ...mixed.analysisSummary.clusters[0]!, relpathPrefix: 'Dance', sampleCount: 1, bpm: 140 },
        { ...mixed.analysisSummary.clusters[0]!, relpathPrefix: 'Techno', sampleCount: 1, bpm: 128 }
      ]
    }

    expect(() => selectGeneratorAnalysisGroup(mixed, parameters))
      .toThrow('Select an analyzer group')
    expect(selectGeneratorAnalysisGroup(mixed, {
      ...parameters,
      tempoClusterPrefix: 'Techno'
    })).toMatchObject({
      detectedBpm: 128,
      parameters: { tempoClusterPrefix: 'Techno' },
      candidates: [{ relpath: 'Techno/kick.wav' }]
    })
    expect(() => selectGeneratorAnalysisGroup(mixed, {
      ...parameters,
      tempoClusterPrefix: 'Missing'
    })).toThrow('no longer available')
  })

  it('uses the sole resolved cluster and requires fixed BPM when analysis is uncertain', () => {
    const resolved = snapshot([candidate()])
    expect(selectGeneratorAnalysisGroup(resolved, parameters)).toMatchObject({
      detectedBpm: 128,
      parameters: { tempoClusterPrefix: '' }
    })

    const uncertain = snapshot([candidate()])
    uncertain.analysisSummary = {
      ...uncertain.analysisSummary,
      state: 'uncertain',
      bpm: null,
      musicalKey: null,
      clusters: []
    }
    expect(() => selectGeneratorAnalysisGroup(uncertain, parameters))
      .toThrow('choose Fixed BPM')
    expect(selectGeneratorAnalysisGroup(uncertain, {
      ...parameters,
      bpmMode: 'fixed',
      bpm: 132
    })).toMatchObject({ detectedBpm: 132, candidates: [expect.any(Object)] })
  })

  it('allows fixed BPM for a key-only resolved summary without a tempo cluster', () => {
    const resolved = snapshot([candidate()])
    resolved.analysisSummary = {
      ...resolved.analysisSummary,
      bpm: null,
      clusters: []
    }

    expect(() => selectGeneratorAnalysisGroup(resolved, parameters))
      .toThrow('choose Fixed BPM')
    expect(selectGeneratorAnalysisGroup(resolved, {
      ...parameters,
      bpmMode: 'fixed',
      bpm: 136
    })).toMatchObject({
      detectedBpm: 136,
      candidates: [{ relpath: 'Drums/kick.wav' }],
      parameters: { bpm: 136 }
    })
  })
})

describe('generator corpus fingerprint', () => {
  it('is independent of candidate input order', async () => {
    const first = candidate({ relpath: 'a.wav' })
    const second = candidate({ relpath: 'b.wav', sampleType: 'Bass' })
    await expect(fingerprintGeneratorSnapshot(snapshot([first, second])))
      .resolves.toBe(await fingerprintGeneratorSnapshot(snapshot([second, first])))
  })

  it('changes for every canonical root or candidate field', async () => {
    const baseCandidate = candidate()
    const baseline = await fingerprintGeneratorSnapshot(snapshot([baseCandidate]))
    const variants: Array<{ name: string; rootKey?: string; candidate: GeneratorCandidate }> = [
      { name: 'rootKey', rootKey: 'other-root', candidate: baseCandidate },
      { name: 'relpath', candidate: candidate({ relpath: 'other.wav' }) },
      { name: 'sizeBytes', candidate: candidate({ sizeBytes: 2_048 }) },
      { name: 'mtime', candidate: candidate({ mtime: 3_000 }) },
      { name: 'metadataRevision', candidate: candidate({ metadataRevision: METADATA_REVISION + 1 }) },
      { name: 'analysisRevision', candidate: candidate({ analysisRevision: ANALYSIS_REVISION + 1 }) },
      { name: 'duration', candidate: candidate({ duration: 1 }) },
      { name: 'bpm', candidate: candidate({ bpm: 130 }) },
      { name: 'musicalKey', candidate: candidate({ musicalKey: 'C' }) },
      { name: 'sampleType', candidate: candidate({ sampleType: 'Bass' }) },
      { name: 'categoryName', candidate: candidate({ categoryName: 'Bass' }) },
      { name: 'paletteSlot', candidate: candidate({ paletteSlot: 7 }) }
    ]

    for (const variant of variants) {
      const fingerprint = await fingerprintGeneratorSnapshot(
        snapshot([variant.candidate], variant.rootKey ?? 'root')
      )
      expect(fingerprint, variant.name).not.toBe(baseline)
    }
  })

  it('ignores display-only filename changes', async () => {
    const baseline = await fingerprintGeneratorSnapshot(snapshot([candidate()]))
    await expect(fingerprintGeneratorSnapshot(
      snapshot([candidate({ filename: 'renamed-display-only.wav' })])
    )).resolves.toBe(baseline)
  })
})
