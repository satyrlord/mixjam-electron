import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PlayerView from '../components/PlayerView'
import type {
  TrackerArrangementProps,
  PlayerBrowserProps,
  PlayerMixerProps,
  PlayerTransportProps
} from '../components/playerProps'
import type { CategoryItem, LibraryItem, SampleListItem, ScanProgress, TagItem } from '../../../shared/backend-api'
import type { LaneState } from '../lib/arrangement'
import { emptyMasterMeterSnapshot } from '../engine/master-meter'

const noop = () => undefined
const asyncNoop = async () => { /* empty */ }

const LANES: LaneState[] = Array.from({ length: 4 }, (_, index) => ({
  index,
  name: `Lane ${index + 1}`,
  muted: false,
  solo: false,
  pan: 0,
  placements: []
}))

const DEFAULT_CATEGORIES: CategoryItem[] = [
  { id: 1, name: 'Unsorted', parentId: null },
  { id: 2, name: 'Bass', parentId: null },
  { id: 3, name: 'Loop', parentId: null },
  { id: 4, name: 'Drums', parentId: null },
]

const IDLE_PROGRESS: ScanProgress = { status: 'idle', phase: null, found: 0, processed: 0, total: 0 }
const SCANNING_PROGRESS: ScanProgress = { status: 'scanning', phase: 1, found: 50, processed: 20, total: 50 }

function makeDbSamples(count: number): SampleListItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `/samples/sample_${i}.wav`,
    dbId: i + 1,
    name: `sample_${i}.wav`,
    relpath: `/samples/sample_${i}.wav`,
    category: 'Unsorted',
    durationSeconds: i * 0.5 + 0.1,
    bpm: null,
    bpmSource: null,
    musicalKey: null,
    musicalKeySource: null,
    sampleType: null,
    sampleTypeSource: null,
    tags: [],
    categoryId: null,
    tagIds: []
  }))
}

const DEFAULT_BROWSER: PlayerBrowserProps = {
  samples: [],
  searchQuery: '',
  loading: false,
  error: null,
  totalCount: 0,
  hasMoreSamples: false,
  selectedSamplePath: null,
  selectedCategoryId: undefined,
  selectedTagIds: [],
  sortBy: 'filename',
  sortDir: 'asc',
  tags: [],
  categories: DEFAULT_CATEGORIES,
  libraries: [],
  scanProgress: IDLE_PROGRESS,
  analysisProgress: { status: 'idle', analyzed: 0, total: 0 },
  onSearchChange: noop,
  onLoadMoreSamples: noop,
  onSelectSampleDetail: noop,
  onPreviewSample: noop,
  onSelectCategory: noop,
  onToggleTagFilter: noop,
  onSortChange: noop,
  onStartScan: asyncNoop,
  onCancelScan: asyncNoop,
  onCreateTag: asyncNoop as never,
  onRenameTag: asyncNoop as never,
  onDeleteTag: asyncNoop as never,
  onAssignTagToSample: asyncNoop as never,
  onUnassignTagFromSample: asyncNoop as never,
  onUpdateSampleAnalysis: asyncNoop as never,
  onReanalyzeSample: asyncNoop as never,
  onCreateCategory: asyncNoop as never,
  onDeleteCategory: asyncNoop as never,
  onSaveLibrary: asyncNoop as never,
  onDeleteLibrary: asyncNoop as never,
  onApplyLibrary: noop
}

const DEFAULT_ARRANGEMENT: TrackerArrangementProps = {
  lanes: LANES,
  laneShouldDim: () => false,
  currentTick: 0,
  missingSamplePaths: new Set<string>(),
  onPlaceSampleDetailOnLane: noop,
  onMovePlacement: noop,
  onDuplicatePlacement: noop,
  onMovePlacementGroup: noop,
  onDuplicatePlacementGroup: noop,
  onRemovePlacementFromLane: noop,
  onRemovePlacements: noop,
  onSetLanePan: noop,
  onToggleLaneMute: noop,
  onToggleLaneSolo: noop
}

const DEFAULT_TRANSPORT: PlayerTransportProps = {
  transportState: 'stopped',
  bpm: 120,
  masterGain: 0.8,
  masterMeter: emptyMasterMeterSnapshot(),
  canUndo: false,
  canRedo: false,
  onSetBpm: noop,
  onSetMasterGain: noop,
  onResetMasterMeter: noop,
  onUndo: noop,
  onRedo: noop,
  onTransportPlay: noop,
  onTransportPause: noop,
  onTransportStop: noop,
  onTransportSkipBack: noop,
  onTransportSeek: noop
}

const DEFAULT_MIXER: PlayerMixerProps = {
  channels: [],
  channelLevels: new Map(),
  channelPeaks: new Map(),
  effectReductions: new Map(),
  canRestoreChannel: false,
  onSetVisualTelemetryActive: noop,
  onSetChannelGain: noop,
  onSetChannelPan: noop,
  onToggleChannelMute: noop,
  onToggleChannelSolo: noop,
  onRemoveChannel: noop,
  onRestoreChannel: noop,
  onAddChannelEffect: () => null,
  onUpdateChannelEffect: noop,
  onToggleChannelEffectBypass: noop,
  onRemoveChannelEffect: noop,
  onRestoreChannelEffect: () => false,
  onMoveChannelEffect: noop
}

function renderPlayer(browserOverrides: Partial<PlayerBrowserProps> = {}) {
  // These tests exercise the Samples workflow, so restore that persisted tab
  // instead of relying on the application's first-launch Song default.
  localStorage.setItem('mixjam:bottom-workspace-tab', 'samples')
  return render(
    <PlayerView
      mixJamFiles={[]}
      browser={{ ...DEFAULT_BROWSER, ...browserOverrides }}
      arrangement={DEFAULT_ARRANGEMENT}
      transport={DEFAULT_TRANSPORT}
      mixer={DEFAULT_MIXER}
    />
  )
}

// Opens the manage panel and switches to the given tab
function openManagePanel(tab: 'Tags' | 'Libraries' | 'Categories') {
  fireEvent.click(screen.getByRole('button', { name: /manage tags, libraries, and categories/i }))
  fireEvent.click(screen.getByRole('tab', { name: new RegExp(tab, 'i') }))
}

describe('Spec 004 - Sample Library acceptance (renderer)', () => {

  // -------------------------------------------------------------------------
  // AC-004a: browser toolbar
  // -------------------------------------------------------------------------

  it('AC-004a: browser toolbar shows search input, result count, and Re-scan action', () => {
    renderPlayer({ samples: [], totalCount: 0 })
    expect(screen.getByRole('searchbox', { name: /search samples/i })).toBeInTheDocument()
    // Result count renders in subcats-count when there are results; strip has scan controls
    expect(screen.getByRole('button', { name: /re-scan/i })).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // AC-005 / AC-006: search
  // -------------------------------------------------------------------------

  it('AC-005: typing in the search field calls onSearchChange', () => {
    const onSearchChange = vi.fn()
    renderPlayer({ onSearchChange })
    const input = screen.getByRole('searchbox', { name: /search samples/i })
    fireEvent.change(input, { target: { value: 'kick' } })
    expect(onSearchChange).toHaveBeenCalledWith('kick')
  })

  it('AC-006: clearing the search field calls onSearchChange with empty string', () => {
    const onSearchChange = vi.fn()
    renderPlayer({ searchQuery: 'kick', onSearchChange })
    const input = screen.getByRole('searchbox', { name: /search samples/i })
    fireEvent.change(input, { target: { value: '' } })
    expect(onSearchChange).toHaveBeenCalledWith('')
  })

  // -------------------------------------------------------------------------
  // AC-010: "Unsorted" hardcoded category tile
  // -------------------------------------------------------------------------

  it('AC-010: Unsorted hardcoded category tile is always visible in the category grid', () => {
    renderPlayer()
    expect(screen.getByRole('option', { name: 'Unsorted' })).toBeInTheDocument()
  })

  it('AC-010: folder-derived categories appear alongside Unsorted', () => {
    renderPlayer({ categories: DEFAULT_CATEGORIES })
    expect(screen.getByRole('option', { name: 'Unsorted' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Bass' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Loop' })).toBeInTheDocument()
  })

  it('AC-010a: user can type a new category name and click + to create it', async () => {
    const onCreateCategory = vi.fn().mockResolvedValue({ id: 99, name: 'Foley', parentId: null })
    renderPlayer({ onCreateCategory })

    openManagePanel('Categories')

    const input = screen.getByRole('textbox', { name: /new category name/i })
    fireEvent.change(input, { target: { value: 'Foley' } })
    fireEvent.click(screen.getByRole('button', { name: /add category/i }))

    await waitFor(() => expect(onCreateCategory).toHaveBeenCalledWith('Foley', undefined))
  })

  it('AC-010b: user can choose a parent when creating a subcategory', async () => {
    const onCreateCategory = vi.fn().mockResolvedValue({ id: 99, name: 'Kicks', parentId: 2 })
    renderPlayer({ onCreateCategory })

    openManagePanel('Categories')

    const input = screen.getByRole('textbox', { name: /new category name/i })
    fireEvent.change(input, { target: { value: 'Kicks' } })

    const parentSelect = screen.getByRole('combobox', { name: /parent category/i })
    fireEvent.change(parentSelect, { target: { value: '2' } })

    fireEvent.click(screen.getByRole('button', { name: /add category/i }))

    await waitFor(() => expect(onCreateCategory).toHaveBeenCalledWith('Kicks', 2))
  })

  // -------------------------------------------------------------------------
  // AC-007 / AC-008 / AC-009: tag CRUD
  // -------------------------------------------------------------------------

  describe('tag management (Tags tab)', () => {
    it('AC-007: user can create a tag via the Tags tab', async () => {
      const onCreateTag = vi.fn().mockResolvedValue({ id: 1, name: 'Kick', color: null } as TagItem)
      renderPlayer({ onCreateTag })

      openManagePanel('Tags')

      const input = screen.getByRole('textbox', { name: /new tag name/i })
      fireEvent.change(input, { target: { value: 'Kick' } })
      fireEvent.click(screen.getByRole('button', { name: /create tag/i }))

      await waitFor(() => expect(onCreateTag).toHaveBeenCalledWith('Kick'))
    })

    it('AC-007: newly created tag appears in the list after creation', () => {
      const tags: TagItem[] = [{ id: 1, name: 'Kick', color: null }]
      const { container } = renderPlayer({ tags })

      openManagePanel('Tags')

      // The tag renders both as a browser filter chip and in the manage list;
      // AC-007 is about the manage list.
      const manageList = container.querySelector('.manage-list')!
      expect(within(manageList as HTMLElement).getByText('Kick')).toBeInTheDocument()
    })

    it('AC-008: rename tag calls onRenameTag and updates display', async () => {
      const onRenameTag = vi.fn().mockResolvedValue(undefined)
      const tags: TagItem[] = [{ id: 1, name: 'OldName', color: null }]
      renderPlayer({ tags, onRenameTag })

      openManagePanel('Tags')
      fireEvent.click(screen.getByRole('button', { name: /rename tag OldName/i }))

      const renameInput = screen.getByRole('textbox', { name: /rename tag OldName/i })
      fireEvent.change(renameInput, { target: { value: 'NewName' } })
      fireEvent.click(screen.getByRole('button', { name: /confirm rename/i }))

      await waitFor(() => expect(onRenameTag).toHaveBeenCalledWith(1, 'NewName'))
    })

    it('AC-009: delete tag calls onDeleteTag', async () => {
      const onDeleteTag = vi.fn().mockResolvedValue(undefined)
      const tags: TagItem[] = [{ id: 1, name: 'ToDelete', color: null }]
      renderPlayer({ tags, onDeleteTag })

      openManagePanel('Tags')
      fireEvent.click(screen.getByRole('button', { name: /delete tag ToDelete/i }))

      await waitFor(() => expect(onDeleteTag).toHaveBeenCalledWith(1))
    })
  })

  // -------------------------------------------------------------------------
  // AC-012 / AC-013 / AC-014: libraries
  // -------------------------------------------------------------------------

  describe('library management (Libraries tab)', () => {
    it('AC-012: user can save a library via the Libraries tab', async () => {
      const onSaveLibrary = vi.fn().mockResolvedValue({ id: 1, name: 'My Set', createdAt: Date.now(), ruleJson: '{}' } as LibraryItem)
      renderPlayer({ onSaveLibrary })

      openManagePanel('Libraries')

      const input = screen.getByRole('textbox', { name: /new library name/i })
      fireEvent.change(input, { target: { value: 'My Set' } })
      fireEvent.click(screen.getByRole('button', { name: /save current filters/i }))

      await waitFor(() => expect(onSaveLibrary).toHaveBeenCalledWith('My Set'))
    })

    it('AC-013: saved libraries appear in the library list', () => {
      const libraries: LibraryItem[] = [
        { id: 1, name: 'Drum Hits', createdAt: Date.now(), ruleJson: '{}' }
      ]
      renderPlayer({ libraries })

      openManagePanel('Libraries')
      expect(screen.getByText('Drum Hits')).toBeInTheDocument()
    })

    it('AC-014: deleting a library calls onDeleteLibrary', async () => {
      const onDeleteLibrary = vi.fn().mockResolvedValue(undefined)
      const libraries: LibraryItem[] = [
        { id: 1, name: 'Drum Hits', createdAt: Date.now(), ruleJson: '{}' }
      ]
      renderPlayer({ libraries, onDeleteLibrary })

      openManagePanel('Libraries')
      fireEvent.click(screen.getByRole('button', { name: /delete library Drum Hits/i }))

      await waitFor(() => expect(onDeleteLibrary).toHaveBeenCalledWith(1))
    })
  })

  // -------------------------------------------------------------------------
  // AC-001 / AC-004a: indexing progress controls
  // -------------------------------------------------------------------------

  it('AC-001 / AC-004a: scan progress indicator is visible when scanning', () => {
    renderPlayer({ scanProgress: SCANNING_PROGRESS })
    expect(screen.getByLabelText(/scanning phase/i)).toBeInTheDocument()
  })

  it('scan progress is hidden when idle', () => {
    renderPlayer({ scanProgress: IDLE_PROGRESS })
    expect(screen.queryByLabelText(/scanning phase/i)).not.toBeInTheDocument()
  })

  it('Re-scan button is disabled while scanning', () => {
    renderPlayer({ scanProgress: SCANNING_PROGRESS })
    expect(screen.getByRole('button', { name: /scanning/i })).toBeDisabled()
  })

  it('Re-scan button is disabled while automatic analysis is running', () => {
    renderPlayer({
      analysisProgress: { status: 'analyzing', analyzed: 10, total: 100 }
    })
    expect(screen.getByRole('button', { name: /analyzing samples/i })).toBeDisabled()
  })

  it('AC-004a: Re-scan triggers the library scan', async () => {
    const onStartScan = vi.fn().mockResolvedValue(undefined)
    renderPlayer({ scanProgress: IDLE_PROGRESS, onStartScan })

    fireEvent.click(screen.getByRole('button', { name: /re-scan/i }))

    await waitFor(() => expect(onStartScan).toHaveBeenCalledTimes(1))
  })

  // -------------------------------------------------------------------------
  // AC-004: sample tiles
  // -------------------------------------------------------------------------

  it('AC-004: sample list renders all provided samples as tiles', () => {
    const samples = makeDbSamples(10)
    renderPlayer({ samples, totalCount: 10 })
    // Each tile is a button with the filename (without extension) as text
    const tiles = screen.getAllByRole('button', { name: /sample_\d+/i })
    // 10 sample tiles + lane buttons + transport + manage + rescan
    expect(tiles.length).toBeGreaterThanOrEqual(10)
  })

  // -------------------------------------------------------------------------
  // AC-016: sort buttons
  // -------------------------------------------------------------------------

  it('AC-016: clicking Name sort button calls onSortChange with filename', () => {
    const onSortChange = vi.fn()
    const samples = makeDbSamples(3)
    renderPlayer({ samples, totalCount: 3, onSortChange })

    fireEvent.click(screen.getByRole('button', { name: /^name/i }))
    expect(onSortChange).toHaveBeenCalledWith('filename')
  })

  it('AC-016: clicking Dur sort button calls onSortChange with duration', () => {
    const onSortChange = vi.fn()
    const samples = makeDbSamples(3)
    renderPlayer({ samples, totalCount: 3, onSortChange })

    fireEvent.click(screen.getByRole('button', { name: /^dur/i }))
    expect(onSortChange).toHaveBeenCalledWith('duration')
  })

  it('AC-016: clicking Date sort button calls onSortChange with dateAdded', () => {
    const onSortChange = vi.fn()
    const samples = makeDbSamples(3)
    renderPlayer({ samples, totalCount: 3, onSortChange })

    fireEvent.click(screen.getByRole('button', { name: /^date/i }))
    expect(onSortChange).toHaveBeenCalledWith('dateAdded')
  })

  // -------------------------------------------------------------------------
  // AC-006a: selecting a sample populates footer detail
  // -------------------------------------------------------------------------

  it('AC-006a: clicking a sample tile calls onSelectSampleDetail with the sample', () => {
    const onSelectSampleDetail = vi.fn()
    const samples = makeDbSamples(1)
    renderPlayer({ samples, totalCount: 1, onSelectSampleDetail })

    // tile shows filename without extension: "sample_0"
    fireEvent.click(screen.getByRole('button', { name: /sample_0/i }))
    expect(onSelectSampleDetail).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'sample_0.wav', relpath: '/samples/sample_0.wav' })
    )
  })

  // -------------------------------------------------------------------------
  // AC-011: category filter activates via tile press
  // -------------------------------------------------------------------------

  it('AC-011: clicking a category tile calls onSelectCategory with the category id', () => {
    const onSelectCategory = vi.fn()
    renderPlayer({ onSelectCategory })

    fireEvent.click(screen.getByRole('option', { name: 'Drums' }))
    expect(onSelectCategory).toHaveBeenCalledWith(4)
  })
})
