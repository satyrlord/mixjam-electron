import type {
  CategoryItem,
  LibraryItem,
  SampleListItem,
  ScanProgress,
  TagItem
} from '../../../shared/backend-api'
import type { ClipGroupEntry, FooterSampleDetail, LaneState } from '../lib/playerShell'
import type { SampleSortColumn, SampleSortDirection } from '../hooks/useLibraryData'

/**
 * TrackerView's prop surface, grouped by domain slice so the component tree
 * passes three cohesive objects instead of ~60 flat props. App assembles these
 * from useAppState; sub-components consume the slice they care about.
 */

/** Sample-browser slice: query results, filters, and library management. */
export interface TrackerBrowserProps {
  samples: SampleListItem[]
  searchQuery: string
  loading: boolean
  error: string | null
  totalCount: number
  hasMoreSamples: boolean
  selectedSamplePath: string | null
  selectedCategoryId: number | undefined
  selectedTagIds: number[]
  sortBy: SampleSortColumn
  sortDir: SampleSortDirection
  tags: TagItem[]
  categories: CategoryItem[]
  libraries: LibraryItem[]
  scanProgress: ScanProgress
  onSearchChange: (query: string) => void
  onLoadMoreSamples: () => void
  onSelectSampleDetail: (detail: FooterSampleDetail) => void
  onPreviewSample: (samplePath: string) => void
  onSelectCategory: (id: number | undefined) => void
  onToggleTagFilter: (id: number) => void
  onSortChange: (col: SampleSortColumn) => void
  onStartScan: () => void
  onCreateTag: (name: string, color?: string) => Promise<TagItem>
  onRenameTag: (id: number, name: string) => Promise<void>
  onDeleteTag: (id: number) => Promise<void>
  onAssignTagToSample: (sample: SampleListItem, tagId: number) => Promise<void>
  onUnassignTagFromSample: (sample: SampleListItem, tagId: number) => Promise<void>
  onCreateCategory: (name: string, parentId?: number) => Promise<CategoryItem>
  onDeleteCategory: (id: number) => Promise<void>
  onSaveLibrary: (name: string) => Promise<LibraryItem>
  onDeleteLibrary: (id: number) => Promise<void>
  onApplyLibrary: (library: LibraryItem) => void
}

/** Arrangement slice: lanes and clip editing. */
export interface TrackerArrangementProps {
  lanes: LaneState[]
  laneShouldDim: (lane: LaneState) => boolean
  currentTick: number
  onPlaceSampleDetailOnLane: (
    detail: FooterSampleDetail,
    laneIndex: number,
    startTick: number
  ) => void
  onMoveClipOnLane: (clipId: string, toLaneIndex: number, newStartTick: number) => void
  onDuplicateClipOnLane: (clipId: string, toLaneIndex: number, newStartTick: number) => void
  onMoveClipGroup: (moves: ClipGroupEntry[]) => void
  onDuplicateClipGroup: (sources: ClipGroupEntry[]) => void
  onRemoveClipFromLane: (laneIndex: number, clipId: string) => void
  onRemoveClips: (clipIds: string[]) => void
  onSetLanePan: (laneIndex: number, pan: number) => void
  onToggleLaneMute: (laneIndex: number) => void
  onToggleLaneSolo: (laneIndex: number) => void
}

export interface TrackerTransportProps {
  transportState: 'stopped' | 'playing' | 'paused'
  bpm: number
  masterGain: number
  masterLevelDb: number
  canUndo: boolean
  canRedo: boolean
  onSetBpm: (bpm: number) => void
  onSetMasterGain: (value: number) => void
  onUndo: () => void
  onRedo: () => void
  onTransportPlay: () => void
  onTransportPause: () => void
  onTransportStop: () => void
  onTransportSkipBack: () => void
}
