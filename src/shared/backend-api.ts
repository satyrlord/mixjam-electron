// The renderer-facing backend contract. One real implementation exists — the
// browser backend (sqlite-wasm over OPFS + File System Access API) in
// src/renderer/src/backend — and it runs identically in any Chromium browser
// and inside the Electron shell. Host-specific capabilities (window sizing,
// openExternal) live in the separate ShellAPI (src/shared/ipc.ts).

export type FolderRole = 'user' | 'sample'

/**
 * A user-granted folder. Browsers have no absolute paths: `id` keys a
 * FileSystemDirectoryHandle persisted in IndexedDB, `name` is the handle's
 * display name (the folder's basename).
 */
export interface FolderRef {
  id: string
  name: string
}

/** Result of validating a stored folder grant. `needs-permission` means the
 *  handle exists but re-using it requires a user-gesture permission request
 *  (browser host only — the Electron shell auto-grants). */
export type FolderValidation = 'ok' | 'needs-permission' | 'invalid'

export interface FolderSelections {
  userFolder: FolderRef | null
  sampleFolder: FolderRef | null
}

export interface MixJamFileItem {
  /** Path of the .mixjam file relative to the User Folder ('/'-separated). */
  path: string
  displayName: string
  lastOpened: string | null
}

export interface MixJamFileContents {
  /** Path of the .mixjam file relative to the User Folder ('/'-separated). */
  path: string
  contents: string
}

export interface OpenedMixJamFileContents {
  /**
   * User Folder-relative path when the selected file is inside that folder.
   * External files are read-only imports and therefore have no writable path.
   */
  path: string | null
  fileName: string
  contents: string
}

export interface TagItem {
  id: number
  name: string
  color: string | null
}

export interface CategoryItem {
  id: number
  name: string
  parentId: number | null
}

export interface LibraryItem {
  id: number
  name: string
  createdAt: number
  ruleJson: string
}

export type AnalysisSource = 'analysis' | 'manual' | null

export const SAMPLE_TYPE_VALUES = [
  'Kick', 'Snare', 'Hi-hat', 'Percussion', 'Bass', 'Synth',
  'FX', 'Vocal', 'Loop', 'Atmosphere', 'Other'
] as const

export type SampleType = (typeof SAMPLE_TYPE_VALUES)[number]

export interface SampleAnalysisPatch {
  bpm?: number | null
  musicalKey?: string | null
  sampleType?: SampleType | null
}

export interface SampleItem {
  id: number
  /** Path relative to the sample's scan root ('/'-separated). */
  relpath: string
  filename: string
  ext: string | null
  sizeBytes: number | null
  duration: number | null
  sampleRate: number | null
  channels: number | null
  bpm: number | null
  bpmSource: AnalysisSource
  musicalKey: string | null
  musicalKeySource: AnalysisSource
  sampleType: SampleType | null
  sampleTypeSource: AnalysisSource
  dateAdded: number
  scanState: number
  categoryId: number | null
  /** Ids of the tags assigned to this sample, ascending. */
  tagIds: number[]
  /** Names of the tags assigned to this sample, alphabetical. */
  tags: string[]
}

export interface SampleQueryRequest {
  textSearch?: string
  categoryId?: number
  tagIds?: number[]
  /** Sample Folder ref id; scopes results to that folder's scan root.
   *  A folder that has never been scanned returns an empty result. */
  rootId?: string
  limit?: number
  offset?: number
  sortBy?: 'filename' | 'duration' | 'dateAdded'
  sortDir?: 'asc' | 'desc'
}

const VALID_SORT_COLS = new Set(['filename', 'duration', 'dateAdded'])
const VALID_SORT_DIRS = new Set(['asc', 'desc'])

function isSortCol(value: unknown): value is SampleQueryRequest['sortBy'] {
  return typeof value === 'string' && VALID_SORT_COLS.has(value)
}

function isSortDir(value: unknown): value is SampleQueryRequest['sortDir'] {
  return typeof value === 'string' && VALID_SORT_DIRS.has(value)
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((n) => typeof n === 'number')
}

/** Coerces a worker-message payload into a well-typed SampleQueryRequest with
 *  safe defaults. */
export function normalizeSampleQueryRequest(raw: unknown): SampleQueryRequest {
  const record = (raw ?? {}) as Record<string, unknown>
  return {
    textSearch: typeof record.textSearch === 'string' ? record.textSearch : undefined,
    categoryId: typeof record.categoryId === 'number' ? record.categoryId : undefined,
    tagIds: isNumberArray(record.tagIds) ? record.tagIds : undefined,
    rootId: typeof record.rootId === 'string' ? record.rootId : undefined,
    limit: typeof record.limit === 'number' ? record.limit : undefined,
    offset: typeof record.offset === 'number' ? record.offset : undefined,
    sortBy: isSortCol(record.sortBy) ? record.sortBy : undefined,
    sortDir: isSortDir(record.sortDir) ? record.sortDir : undefined
  }
}

export interface SampleQueryResponse {
  rows: SampleItem[]
  total: number
}

export type MixJamGeneratorProfileId = 'techno' | 'trance' | 'house'
export type MixJamGeneratorIntensity = 'low' | 'medium' | 'high'
export type MixJamGeneratorBpmMode = 'follow-detected' | 'fixed'

export const MIXJAM_GENERATOR_VERSION = 1 as const
export const MIXJAM_GENERATOR_PROFILE_VERSIONS: Record<MixJamGeneratorProfileId, 2> = {
  techno: 2,
  trance: 2,
  house: 2
}
export const SAFE_GENERATOR_TOKEN = /^[A-Za-z0-9_-]+$/
export const SAFE_SEED = /^[A-Za-z0-9_-]{1,64}$/
export const MIXJAM_GENERATOR_PROFILE_IDS: readonly MixJamGeneratorProfileId[] = ['techno', 'trance', 'house']
export const MIXJAM_GENERATOR_INTENSITIES: readonly MixJamGeneratorIntensity[] = ['low', 'medium', 'high']
export const MIXJAM_GENERATOR_BPM_MODES: readonly MixJamGeneratorBpmMode[] = ['follow-detected', 'fixed']
export const MIXJAM_GENERATOR_PROFILE_LABELS: Record<MixJamGeneratorProfileId, string> = {
  techno: 'Techno',
  trance: 'Trance',
  house: 'House'
}

export const MIXJAM_GENERATOR_INTENSITY_LABELS: Record<MixJamGeneratorIntensity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High'
}

export const MIXJAM_GENERATOR_BPM_MODE_LABELS: Record<MixJamGeneratorBpmMode, string> = {
  'follow-detected': 'Follow detected',
  fixed: 'Fixed'
}

export interface MixJamGeneratorParameters {
  profileId: MixJamGeneratorProfileId
  bpmMode: MixJamGeneratorBpmMode
  /** Required in fixed mode and ignored in follow-detected mode. */
  bpm?: number
  intensity: MixJamGeneratorIntensity
  durationSeconds: number
  seed: string
}

export type MixJamGeneratorReadiness =
  | { status: 'ready'; detectedBpm: number; eligibleSamples: number }
  | { status: 'preparing'; message: string }
  | { status: 'needs-preparation'; message: string }

export type MixJamGeneratorPhase = 'shortlisting' | 'analyzing' | 'arranging'

export interface MixJamGeneratorJobIdentity {
  rootKey: string
  jobId: string
}

export interface MixJamGeneratorProgress {
  identity: MixJamGeneratorJobIdentity | null
  status: 'idle' | 'running' | 'cancelled' | 'error'
  phase: MixJamGeneratorPhase | null
  completed: number
  total: number
  error?: string
}

export interface MixJamGeneratorEffectPlan {
  id: string
  type: 'delay' | 'reverb' | 'compressor'
  presetName: string
  values: Record<string, number | boolean | string>
}

export interface MixJamGeneratorPlacementPlan {
  id: string
  sampleRef: string
  sampleName: string
  startTick: number
  durationTicks: number
  durationSeconds: number
  nativeBpm: number | null
  slot: number
}

export interface MixJamGeneratorLanePlan {
  index: number
  name: string
  pan: number
  muted: boolean
  solo: boolean
  placements: MixJamGeneratorPlacementPlan[]
}

export interface MixJamGeneratorChannelPlan {
  channelIndex: number
  gain: number
  pan: number
  muted: boolean
  solo: boolean
  effects: MixJamGeneratorEffectPlan[]
}

export interface MixJamGeneratorSectionPlan {
  name: string
  startBar: number
  endBar: number
  activeLanes: number[]
}

export interface MixJamGeneratorPhrasePlan {
  sectionIndex: number
  startBar: number
  endBar: number
  activeLanes: number[]
  motif: 'A' | 'B' | 'rest' | 'transition'
}

export interface MixJamGeneratorSelectionPlan {
  laneIndex: number
  requestedType: SampleType
  selectedType: SampleType
  sampleRefs: string[]
}

export interface MixJamGeneratorPlan {
  generatorVersion: 1
  profileId: MixJamGeneratorProfileId
  profileVersion: 2
  seed: string
  parameters: {
    bpmMode: MixJamGeneratorBpmMode
    resolvedBpm: number
    intensity: MixJamGeneratorIntensity
    durationSeconds: number
  }
  corpusFingerprint: string
  sampleFolderKey: string
  targetBars: number
  targetTicks: number
  quantizedDurationSeconds: number
  dominantKey: string | null
  analysis: {
    attemptedFiles: number
    analyzedFiles: number
    uniqueReads: number
  }
  selections: MixJamGeneratorSelectionPlan[]
  substitutions: Array<{ laneIndex: number; requestedType: SampleType; selectedType: SampleType }>
  sections: MixJamGeneratorSectionPlan[]
  phrases: MixJamGeneratorPhrasePlan[]
  lanes: MixJamGeneratorLanePlan[]
  channels: MixJamGeneratorChannelPlan[]
}

/** Browser list item -- the renderer-facing projection of a DB sample row. */
export interface SampleListItem {
  id: string
  dbId: number
  name: string
  relpath: string
  category: string
  durationSeconds: number | null
  bpm: number | null
  bpmSource: AnalysisSource
  musicalKey: string | null
  musicalKeySource: AnalysisSource
  sampleType: SampleType | null
  sampleTypeSource: AnalysisSource
  tags: string[]
  categoryId: number | null
  tagIds: number[]
}

export type LibrarySyncTrigger = 'automatic' | 'manual' | 'mutation'

export interface LibraryJobIdentity {
  rootKey: FolderRef['id']
  jobId: string
  trigger: LibrarySyncTrigger
}

export interface SampleAnalysisJobIdentity {
  rootKey: FolderRef['id']
  sampleId: number
  jobId: string
}

export type AnalysisJobIdentity = LibraryJobIdentity | SampleAnalysisJobIdentity

export type LibrarySyncStartDisposition =
  | 'started'
  | 'coalesced'
  | 'queued'
  | 'suppressed'

export interface LibrarySyncStartResult {
  identity: LibraryJobIdentity
  disposition: LibrarySyncStartDisposition
}

export interface LibraryRootState {
  rootKey: FolderRef['id']
  lastCompletedAt: number | null
  /**
   * True when the root has either completed a current-schema sync or retains
   * browseable rows from a prior schema version while the first post-migration
   * sync reconciles.
   */
  hasUsableIndex: boolean
}

export type LibrarySyncState =
  | { status: 'unavailable' }
  | { status: 'unindexed'; rootKey: FolderRef['id'] }
  | { status: 'checking'; rootKey: FolderRef['id']; jobId: string }
  | {
      status: 'syncing'
      rootKey: FolderRef['id']
      jobId: string
      hasUsableIndex: boolean
      phase: 1 | 2 | null
      found: number
      processed: number
      total: number
    }
  | {
      status: 'analyzing'
      rootKey: FolderRef['id']
      jobId: string
      lastCompletedAt: number
      analyzed: number
      total: number
    }
  | {
      status: 'ready'
      rootKey: FolderRef['id']
      lastCompletedAt: number
    }
  | {
      status: 'cancelled'
      rootKey: FolderRef['id']
      hasUsableIndex: boolean
    }
  | {
      status: 'error'
      rootKey: FolderRef['id']
      message: string
      hasUsableIndex: boolean
    }

export interface ScanProgress {
  identity: LibraryJobIdentity | null
  status: 'idle' | 'scanning' | 'cancelled' | 'error'
  phase: 1 | 2 | null
  found: number
  processed: number
  total: number
  /** Present for a fatal scan failure; safe to show in renderer diagnostics. */
  error?: string
}

export interface AnalysisProgress {
  identity: AnalysisJobIdentity | null
  status: 'idle' | 'analyzing' | 'error'
  analyzed: number
  total: number
  /** Present for a fatal analysis failure; safe to show in renderer diagnostics. */
  error?: string
}

export interface AnalysisDone {
  identity: AnalysisJobIdentity
}

export interface SampleAnalysisDone {
  identity: SampleAnalysisJobIdentity
}

export interface LibraryScanDone {
  identity: LibraryJobIdentity
  lastCompletedAt: number
}

export interface CalibrationJobIdentity {
  rootKey: FolderRef['id']
  jobId: string
}

export interface CalibrationProgress {
  identity: CalibrationJobIdentity | null
  status: 'idle' | 'calibrating' | 'cancelled' | 'error'
  analyzed: number
  total: number
  /** Present for a fatal calibration failure; safe to show in renderer diagnostics. */
  error?: string
}

export interface CalibrationDone {
  identity: CalibrationJobIdentity
}

export interface BackendAPI {
  // Host capabilities — delegated to the ShellAPI in Electron, browser
  // fallbacks (no-op resize, window.open) otherwise.
  getVersion: () => Promise<string>
  resizeToPlayer: () => Promise<void>
  resizeToHome: () => Promise<void>
  openExternal: (url: string) => Promise<void>
  loadFolderSelections: () => Promise<FolderSelections>
  saveFolderSelections: (selections: FolderSelections) => Promise<void>
  loadMixJamFiles: (userFolder: FolderRef | null) => Promise<MixJamFileItem[]>
  recordRecentProject: (projectRelpath: string) => Promise<void>
  openMixJamFile: (userFolder: FolderRef) => Promise<OpenedMixJamFileContents | null>
  readMixJamFile: (userFolder: FolderRef, projectRelpath: string) => Promise<MixJamFileContents>
  saveMixJamFileAs: (
    userFolder: FolderRef,
    suggestedName: string,
    contents: string
  ) => Promise<MixJamFileContents | null>
  createGeneratedMixJamFile: (
    userFolder: FolderRef,
    basename: string,
    contents: string
  ) => Promise<MixJamFileContents>
  writeMixJamFile: (
    userFolder: FolderRef,
    projectRelpath: string,
    contents: string
  ) => Promise<void>
  findMissingSampleFiles: (sampleFolder: FolderRef, relpaths: string[]) => Promise<string[]>
  /** Shows the directory picker. Resolves null when the user cancels. Picking
   *  a folder that is already stored reuses its existing ref (and scan root). */
  pickFolder: (role: FolderRole) => Promise<FolderRef | null>
  validateFolder: (ref: FolderRef, role: FolderRole) => Promise<FolderValidation>
  /** Re-requests permission for a stored handle (must run in a user gesture).
   *  Returns true when access was (re-)granted. */
  requestFolderAccess: (ref: FolderRef, role: FolderRole) => Promise<boolean>
  startLibrarySync: (
    sampleFolder: FolderRef,
    trigger: LibrarySyncTrigger
  ) => Promise<LibrarySyncStartResult>
  cancelLibrarySync: (jobId: string) => Promise<void>
  getLibraryRootState: (sampleFolder: FolderRef) => Promise<LibraryRootState>
  getScanProgress: () => Promise<ScanProgress>
  getAnalysisProgress: () => Promise<AnalysisProgress>
  startUniformFolderCalibration: (
    sampleFolder: FolderRef
  ) => Promise<CalibrationJobIdentity>
  cancelUniformFolderCalibration: (jobId: string) => Promise<void>
  getCalibrationProgress: () => Promise<CalibrationProgress>
  querySamples: (req: SampleQueryRequest) => Promise<SampleQueryResponse>
  getGeneratorReadiness: (sampleFolder: FolderRef) => Promise<MixJamGeneratorReadiness>
  planMixJam: (
    sampleFolder: FolderRef,
    jobId: string,
    parameters: MixJamGeneratorParameters,
    expectedFingerprint?: string
  ) => Promise<MixJamGeneratorPlan>
  cancelMixJamPlanning: (jobId: string) => Promise<void>
  getGeneratorProgress: () => Promise<MixJamGeneratorProgress>
  listTags: () => Promise<TagItem[]>
  createTag: (name: string, color?: string) => Promise<TagItem>
  renameTag: (id: number, name: string) => Promise<void>
  setTagColor: (id: number, color: string | null) => Promise<void>
  deleteTag: (id: number) => Promise<void>
  assignTag: (sampleId: number, tagId: number) => Promise<void>
  unassignTag: (sampleId: number, tagId: number) => Promise<void>
  updateSampleAnalysis: (sampleId: number, patch: SampleAnalysisPatch) => Promise<void>
  reanalyzeSample: (
    sampleFolder: FolderRef,
    sampleId: number,
    relpath: string
  ) => Promise<SampleAnalysisDone>
  listCategories: () => Promise<CategoryItem[]>
  createCategory: (name: string, parentId?: number) => Promise<CategoryItem>
  deleteCategory: (id: number) => Promise<void>
  listLibraries: () => Promise<LibraryItem[]>
  saveLibrary: (name: string, ruleJson: string) => Promise<LibraryItem>
  deleteLibrary: (id: number) => Promise<void>
  // Relpaths of samples marked missing (scan_state = 2) under the folder's
  // scan root. The tracker stripes placements whose sample vanished between scans.
  listMissingRelpaths: (sampleFolder: FolderRef) => Promise<string[]>
  // Reads the raw bytes of a sample file through the root's directory handle
  // (a handle can only reach its own subtree, so containment is structural).
  // Returns null if the file is unreadable.
  readSampleBytes: (rootId: string, relpath: string) => Promise<ArrayBuffer | null>
  onScanProgress: (cb: (progress: ScanProgress) => void) => () => void
  onScanDone: (cb: (done: LibraryScanDone) => void) => () => void
  onAnalysisProgress: (cb: (progress: AnalysisProgress) => void) => () => void
  onAnalysisDone: (cb: (done: AnalysisDone) => void) => () => void
  onCalibrationProgress: (cb: (progress: CalibrationProgress) => void) => () => void
  onCalibrationDone: (cb: (done: CalibrationDone) => void) => () => void
  onGeneratorProgress: (cb: (progress: MixJamGeneratorProgress) => void) => () => void
}
