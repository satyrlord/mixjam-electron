import type {
  CategoryItem,
  LibraryItem,
  LibrarySyncState,
  SampleListItem,
  SampleAnalysisPatch,
  TagItem
} from '../../../shared/backend-api'
import type { PlacementGroupEntry, FooterSampleDetail } from '../lib/arrangement'
import type { LaneState } from '../project/project-state'
import type { SampleSortColumn, SampleSortDirection } from '../hooks/useLibraryData'
import type { PlaybackReturnSnapshot } from '../engine/playback-engine'
import type { RuntimeTransportState } from '../hooks/useTransportRuntime'
import type { MasterMeterSnapshot } from '../engine/master-meter'
import type { MasterBusMeterSnapshot } from '../engine/masterbus/dsp/core'
import type { MasterBusParamId, ProcessorId } from '../engine/masterbus/params'
import type { MasterBusPresetName, MasterBusState } from '../engine/masterbus/presets'

export interface PlayerBrowserProps {
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
  librarySyncState: LibrarySyncState
  onSearchChange: (query: string) => void
  onLoadMoreSamples: () => void
  onSelectSampleDetail: (detail: FooterSampleDetail) => void
  onPreviewSample: (samplePath: string, nativeBPM: number | null) => void
  onSelectCategory: (id: number | undefined) => void
  onToggleTagFilter: (id: number) => void
  onSortChange: (col: SampleSortColumn) => void
  onRescanLibrary: () => Promise<void>
  onRetryLibrarySync: () => Promise<void>
  onCancelLibrarySync: () => Promise<void>
  onCreateTag: (name: string, color?: string) => Promise<TagItem>
  onRenameTag: (id: number, name: string) => Promise<void>
  onSetTagColor: (id: number, color: string | null) => Promise<void>
  onDeleteTag: (id: number) => Promise<void>
  onAssignTagToSample: (sample: SampleListItem, tagId: number) => Promise<void>
  onUnassignTagFromSample: (sample: SampleListItem, tagId: number) => Promise<void>
  onUpdateSampleAnalysis: (sample: SampleListItem, patch: SampleAnalysisPatch) => Promise<void>
  onReanalyzeSample: (sample: SampleListItem) => Promise<void>
  onCreateCategory: (name: string, parentId?: number) => Promise<CategoryItem>
  onDeleteCategory: (id: number) => Promise<void>
  onSaveLibrary: (name: string) => Promise<LibraryItem>
  onDeleteLibrary: (id: number) => Promise<void>
  onApplyLibrary: (library: LibraryItem) => void
}

export interface TrackerArrangementProps {
  lanes: LaneState[]
  laneShouldDim: (lane: LaneState) => boolean
  currentTick: number
  /** Relpaths of missing samples; placements referencing them render hazard
   *  stripes (spec-002 AC-013). */
  missingSamplePaths: ReadonlySet<string>
  onPlaceSampleDetailOnLane: (
    detail: FooterSampleDetail,
    laneIndex: number,
    startTick: number
  ) => void
  onMovePlacement: (placementId: string, toLaneIndex: number, newStartTick: number) => void
  onDuplicatePlacement: (placementId: string, toLaneIndex: number, newStartTick: number) => void
  onMovePlacementGroup: (moves: PlacementGroupEntry[]) => void
  onDuplicatePlacementGroup: (sources: PlacementGroupEntry[]) => void
  onRemovePlacementFromLane: (laneIndex: number, placementId: string) => void
  onRemovePlacements: (placementIds: string[]) => void
  onSetLanePan: (laneIndex: number, pan: number) => void
  onRenameLane: (laneIndex: number, name: string) => void
  onToggleLaneMute: (laneIndex: number) => void
  onToggleLaneSolo: (laneIndex: number) => void
  onAddLane: () => void
  onDeleteLane: (laneIndex: number) => void
  onDeleteEmptyLanes: () => void
}

export interface PlayerTransportProps {
  transportState: RuntimeTransportState
  songEndTick: number
  bpm: number
  masterGain: number
  masterMeter: MasterMeterSnapshot
  canUndo: boolean
  canRedo: boolean
  onSetBpm: (bpm: number) => void
  onUndo: () => void
  onRedo: () => void
  onTransportPlay: () => void
  onTransportPause: () => void
  onTransportStop: () => void
  onTransportSkipBack: () => void
  onTransportJumpToEnd: () => void
  onTransportSeek: (tick: number) => void
}

export interface PlayerMasterBusProps {
  state: MasterBusState
  getMeterSnapshot: () => MasterBusMeterSnapshot | null
  onSetParam: (id: MasterBusParamId, value: number) => void
  onTogglePower: (id: ProcessorId) => void
  onReorder: (order: ProcessorId[]) => void
  onApplyPreset: (name: MasterBusPresetName) => void
}

export interface PlayerMixerProps {
  returnBuses: readonly [PlaybackReturnSnapshot, PlaybackReturnSnapshot, PlaybackReturnSnapshot, PlaybackReturnSnapshot]
  channelLevels: ReadonlyMap<number, number>
  channelPeaks: ReadonlyMap<number, number>
  onSetVisualTelemetryActive: (active: boolean) => void
  onBeginMixerGesture: () => void
  onCommitMixerGesture: () => void
  onSetChannelGain: (channelIndex: number, gain: number) => void
  onSetChannelPan: (channelIndex: number, pan: number) => void
  onSetChannelSend: (channelIndex: number, sendIndex: number, value: number) => void
  onSetReturnBus: (bus: PlaybackReturnSnapshot) => void
  onPreviewReturnBus: (bus: PlaybackReturnSnapshot) => void
}

export interface PlayerProjectProps {
  name: string
  dirty: boolean
  busy: boolean
  canRegenerate: boolean
  onNew: () => Promise<void>
  onOpen: () => Promise<boolean>
  onOpenPath: (projectRelpath: string) => Promise<boolean>
  onSave: () => Promise<boolean>
  onSaveAs: () => Promise<boolean>
  onRegenerateExact: (opener?: HTMLElement) => void
  onRegenerateCurrent: (opener?: HTMLElement) => void
}
