import type {
  AnalysisProgress,
  CategoryItem,
  LibraryItem,
  SampleListItem,
  ScanProgress,
  SampleAnalysisPatch,
  TagItem
} from '../../../shared/backend-api'
import type { PlacementGroupEntry, FooterSampleDetail, LaneState } from '../lib/arrangement'
import type { SampleSortColumn, SampleSortDirection } from '../hooks/useLibraryData'
import type { ChannelState } from '../hooks/useMixer'
import type { EffectSlot, EffectType } from '../engine/effects'
import type { RuntimeTransportState } from '../hooks/useTransportRuntime'
import type { MasterMeterSnapshot } from '../engine/master-meter'

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
  scanProgress: ScanProgress
  analysisProgress: AnalysisProgress
  onSearchChange: (query: string) => void
  onLoadMoreSamples: () => void
  onSelectSampleDetail: (detail: FooterSampleDetail) => void
  onPreviewSample: (samplePath: string, nativeBPM: number | null) => void
  onSelectCategory: (id: number | undefined) => void
  onToggleTagFilter: (id: number) => void
  onSortChange: (col: SampleSortColumn) => void
  onStartScan: (uniformBatchConfirmed?: boolean) => void
  onCancelScan: () => void
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
  onToggleLaneMute: (laneIndex: number) => void
  onToggleLaneSolo: (laneIndex: number) => void
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
  onSetMasterGain: (value: number) => void
  onResetMasterMeter: () => void
  onUndo: () => void
  onRedo: () => void
  onTransportPlay: () => void
  onTransportPause: () => void
  onTransportStop: () => void
  onTransportSkipBack: () => void
  onTransportJumpToEnd: () => void
  onTransportSeek: (tick: number) => void
}

export interface PlayerMixerProps {
  channels: ChannelState[]
  channelLevels: ReadonlyMap<number, number>
  channelPeaks: ReadonlyMap<number, number>
  effectReductions: ReadonlyMap<string, number>
  canRestoreChannel: boolean
  onSetVisualTelemetryActive: (active: boolean) => void
  onSetChannelGain: (channelIndex: number, gain: number) => void
  onSetChannelPan: (channelIndex: number, pan: number) => void
  onToggleChannelMute: (channelIndex: number) => void
  onToggleChannelSolo: (channelIndex: number) => void
  onRemoveChannel: (channelIndex: number) => void
  onRestoreChannel: () => void
  onAddChannelEffect: (channelIndex: number, type: EffectType) => EffectSlot | null
  onUpdateChannelEffect: (channelIndex: number, effect: EffectSlot) => void
  onToggleChannelEffectBypass: (channelIndex: number, effectId: string) => void
  onRemoveChannelEffect: (channelIndex: number, effectId: string) => void
  onRestoreChannelEffect: (channelIndex: number, effect: EffectSlot, index: number) => boolean
  onMoveChannelEffect: (channelIndex: number, effectId: string, toIndex: number) => void
}

export interface PlayerProjectProps {
  name: string
  dirty: boolean
  busy: boolean
  onOpen: () => Promise<boolean>
  onOpenPath: (projectRelpath: string) => Promise<boolean>
  onSave: () => Promise<boolean>
  onSaveAs: () => Promise<boolean>
}
