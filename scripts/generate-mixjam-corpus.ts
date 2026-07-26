import { openSync, readSync, closeSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { labeledPoolToken, labeledSampleBpm } from '../src/renderer/src/backend/contextual-analysis'
import type { GeneratorPlannerKind } from '../src/renderer/src/backend/generator-analysis'
import type { PlanningCandidate } from '../src/renderer/src/backend/generator-planning-core'
import { sourceGroupFromRelpath, sourceGroupSlot } from '../src/shared/sample-palette'
import { folderRoleTypes } from '../src/shared/sample-role-hints'
import type { SampleType } from '../src/shared/sample-types'

// A Node-side candidate source for the headless CLI. The app builds candidates
// from the SQLite index, which needs Electron and a completed Prepare pass; this
// builds the same shape from what the corpus states about itself — filename
// label for tempo and pool, role folder for what the file is for, and the WAV
// header for duration. Everything downstream is the shipped engine.
//
// Deliberately absent: audio features (`rms`, loop confidence, spectral shape).
// Those need a decode of every file. Their absence disables RMS gain
// compensation and quality tiebreaks, which the CLI reports.

const HEADER_BYTES = 4096

/** Duration in seconds read from the RIFF header, or null for an unreadable file. */
function wavDurationSeconds(path: string): number | null {
  let handle: number | null = null
  try {
    handle = openSync(path, 'r')
    const header = Buffer.alloc(HEADER_BYTES)
    const read = readSync(handle, header, 0, HEADER_BYTES, 0)
    if (read < 44 || header.toString('latin1', 0, 4) !== 'RIFF' || header.toString('latin1', 8, 12) !== 'WAVE') {
      return null
    }
    let offset = 12
    let byteRate = 0
    while (offset + 8 <= read) {
      const chunkId = header.toString('latin1', offset, offset + 4)
      const chunkSize = header.readUInt32LE(offset + 4)
      if (chunkId === 'fmt ' && offset + 8 + 16 <= read) {
        byteRate = header.readUInt32LE(offset + 16)
      } else if (chunkId === 'data') {
        if (byteRate <= 0) return null
        // A streamed writer can leave the data size at 0 or 0xFFFFFFFF; fall
        // back to the real file size in that case.
        const declared = chunkSize > 0 && chunkSize < 0xffffffff
          ? chunkSize
          : statSync(path).size - (offset + 8)
        return declared / byteRate
      }
      offset += 8 + chunkSize + (chunkSize % 2)
    }
    return null
  } catch {
    return null
  } finally {
    if (handle !== null) closeSync(handle)
  }
}

// The role token every pack in this convention prefixes its filenames with. The
// role folder is the primary signal; this refines it — `Trance/Drum/CLAP001` is
// a snare, not a generic drum.
const FILENAME_TYPES: ReadonlyArray<readonly [RegExp, SampleType]> = [
  [/\bKICK|^KCK|BASSDRUM/i, 'Kick'],
  [/CLAP|SNARE|\bSNR|RIMSHOT/i, 'Snare'],
  [/HIHAT|\bHAT\b|OPENHAT|CLOSEDHAT|\bCYM|RIDE|CRASH/i, 'Hi-hat'],
  [/PERC|SHAKER|TAMB|CONGA|BONGO|\bTOM|CLAVE|COWBELL/i, 'Percussion'],
  [/BASS/i, 'Bass'],
  [/BEATS|DRUMLOOP|TOPLOOP|GROOVE|\bLOOP/i, 'Loop'],
  [/SYNTH|KEYS|PIANO|ORGAN|\bARP|CHORD|STAB|LEAD|PLUCK|GUITAR|SEQ/i, 'Synth'],
  [/SPHERE|\bPAD|ATMO|DRONE|AMBIEN/i, 'Atmosphere'],
  [/VOCAL|\bVOX|VOICE/i, 'Vocal'],
  [/\bFX|RISER|IMPACT|SWEEP|NOISE|UPLIFT|DOWNLIFT|WHOOSH/i, 'FX']
]

function sampleTypeOf(relpath: string, filename: string): SampleType {
  for (const [pattern, type] of FILENAME_TYPES) {
    if (pattern.test(filename)) return type
  }
  return folderRoleTypes(relpath)[0] ?? 'Other'
}

function plannerKindOf(filename: string, type: SampleType, tempoLocked: boolean): GeneratorPlannerKind | undefined {
  if (/RISER|UPLIFT|SWEEP|BUILD/i.test(filename)) return 'riser'
  if (/IMPACT|DOWNLIFT|BOOM|HIT\b|CRASH/i.test(filename)) return 'impact'
  if (type === 'FX') return 'texture'
  if (!tempoLocked) return 'one-shot'
  return undefined
}

function listWavFiles(root: string, directory: string, out: string[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) listWavFiles(root, path, out)
    else if (/\.wav$/i.test(entry.name)) out.push(relative(root, path).replaceAll('\\', '/'))
  }
}

export interface CorpusCandidates {
  candidates: PlanningCandidate[]
  /** Files skipped because their WAV header was unreadable. */
  skipped: number
}

export function loadCorpusCandidates(samplesDir: string, cluster: string | null): CorpusCandidates {
  const relpaths: string[] = []
  listWavFiles(samplesDir, samplesDir, relpaths)
  // The analysis cluster is the material pool (spec-021 §Pool coherence). In the
  // app the wizard's cluster picker supplies it; here it is `--cluster`.
  const scoped = cluster === null
    ? relpaths
    : relpaths.filter((relpath) => relpath === cluster || relpath.startsWith(`${cluster}/`))

  const candidates: PlanningCandidate[] = []
  let skipped = 0
  for (const relpath of scoped) {
    const duration = wavDurationSeconds(join(samplesDir, relpath))
    if (duration === null || duration <= 0) {
      skipped++
      continue
    }
    const filename = relpath.slice(relpath.lastIndexOf('/') + 1)
    const labeledBpm = labeledSampleBpm(relpath)
    // Material shorter than most of a bar at its own stated tempo is a one-shot:
    // it plays at true pitch and is exempt from pool coherence. Everything
    // longer is tempo-locked and gets resampled to the project tempo.
    const tempoLocked = labeledBpm !== null && duration >= 0.75 * (240 / labeledBpm)
    const sampleType = sampleTypeOf(relpath, filename)
    const sourceGroup = sourceGroupFromRelpath(relpath)
    const plannerKind = plannerKindOf(filename, sampleType, tempoLocked)
    candidates.push({
      relpath,
      filename,
      sizeBytes: 0,
      mtime: 0,
      duration,
      bpm: tempoLocked ? labeledBpm : null,
      // Bare-letter labels state a pool, not a mode (spec-008 §Pool token), so
      // the CLI publishes no key and lets pool coherence carry pitch.
      musicalKey: null,
      sampleType,
      sourceGroup,
      paletteSlot: sourceGroupSlot(sourceGroup),
      // The filesystem-only CLI has no analyzer-owned stereo evidence.
      poolToken: labeledPoolToken(relpath),
      metadataRevision: 0,
      analysisRevision: 0,
      ...(plannerKind === undefined ? {} : { plannerKind })
    })
  }
  return { candidates, skipped }
}
