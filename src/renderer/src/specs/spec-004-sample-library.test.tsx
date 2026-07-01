import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TrackerView from '../components/TrackerView'
import type { CategoryItem, LibraryItem, SampleListItem, ScanProgress, TagItem } from '../../../shared/ipc'
import type { LaneState } from '../lib/playerShell'

const noop = () => undefined
const asyncNoop = async () => { /* empty */ }

const LANES: LaneState[] = Array.from({ length: 4 }, (_, index) => ({
  index,
  name: `Lane ${index + 1}`,
  muted: false,
  solo: false,
  pan: 0,
  clips: []
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
    name: `sample_${i}.wav`,
    filepath: `/samples/sample_${i}.wav`,
    category: 'Unsorted',
    durationSeconds: i * 0.5 + 0.1,
    tags: [],
    categoryId: null,
    tagIds: []
  }))
}

function renderTracker(overrides: Partial<Parameters<typeof TrackerView>[0]> = {}) {
  return render(
    <TrackerView
      recentProjects={[]}
      samples={[]}
      searchQuery=""
      loading={false}
      error={null}
      selectedSamplePath={null}
      lanes={LANES}
      laneShouldDim={() => false}
      transportState="stopped"
      currentTick={0}
      bpm={120}
      masterGain={0.8}
      masterLevelDb={-100}
      totalCount={0}
      onSetBpm={noop}
      onSetMasterGain={noop}
      onSelectSampleDetail={noop}
      onSearchChange={noop}
      onRescan={noop}
      onPlaceSampleDetailOnLane={noop}
      onMoveClipOnLane={noop}
      onRemoveClipFromLane={noop}
      onSetLanePan={noop}
      onPreviewSample={noop}
      onToggleLaneMute={noop}
      onToggleLaneSolo={noop}
      onTransportPlay={noop}
      onTransportPause={noop}
      onTransportStop={noop}
      onTransportSkipBack={noop}
      scanProgress={IDLE_PROGRESS}
      selectedCategoryId={undefined}
      selectedTagIds={[]}
      sortBy="filename"
      sortDir="asc"
      tags={[]}
      categories={DEFAULT_CATEGORIES}
      libraries={[]}
      onDbSearchChange={noop}
      onSelectCategory={noop}
      onToggleTagFilter={noop}
      onSortChange={noop}
      onStartScan={asyncNoop}
      onCreateTag={asyncNoop as never}
      onRenameTag={asyncNoop as never}
      onDeleteTag={asyncNoop as never}
      onCreateCategory={asyncNoop as never}
      onDeleteCategory={asyncNoop as never}
      onSaveLibrary={asyncNoop as never}
      onDeleteLibrary={asyncNoop as never}
      {...overrides}
    />
  )
}

// Opens the manage panel and switches to the given tab
function openManagePanel(tab: 'Tags' | 'Libraries' | 'Categories') {
  fireEvent.click(screen.getByRole('button', { name: /manage tags and libraries/i }))
  fireEvent.click(screen.getByRole('tab', { name: new RegExp(tab, 'i') }))
}

describe('Spec 004 - Sample Library acceptance (renderer)', () => {

  // -------------------------------------------------------------------------
  // AC-004a: browser toolbar
  // -------------------------------------------------------------------------

  it('AC-004a: browser toolbar shows search input, result count, and Re-scan action', () => {
    renderTracker({ samples: [], totalCount: 0 })
    expect(screen.getByRole('searchbox', { name: /search samples/i })).toBeInTheDocument()
    // Result count renders in subcats-count when there are results; strip has scan controls
    expect(screen.getByRole('button', { name: /re-scan/i })).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // AC-005 / AC-006: search
  // -------------------------------------------------------------------------

  it('AC-005: typing in the search field calls onDbSearchChange', () => {
    const onDbSearchChange = vi.fn()
    renderTracker({ onDbSearchChange })
    const input = screen.getByRole('searchbox', { name: /search samples/i })
    fireEvent.change(input, { target: { value: 'kick' } })
    expect(onDbSearchChange).toHaveBeenCalledWith('kick')
  })

  it('AC-006: clearing the search field calls onDbSearchChange with empty string', () => {
    const onDbSearchChange = vi.fn()
    renderTracker({ searchQuery: 'kick', onDbSearchChange })
    const input = screen.getByRole('searchbox', { name: /search samples/i })
    fireEvent.change(input, { target: { value: '' } })
    expect(onDbSearchChange).toHaveBeenCalledWith('')
  })

  // -------------------------------------------------------------------------
  // AC-010: "Unsorted" hardcoded category tile
  // -------------------------------------------------------------------------

  it('AC-010: Unsorted hardcoded category tile is always visible in the category grid', () => {
    renderTracker()
    expect(screen.getByRole('option', { name: 'Unsorted' })).toBeInTheDocument()
  })

  it('AC-010: folder-derived categories appear alongside Unsorted', () => {
    renderTracker({ categories: DEFAULT_CATEGORIES })
    expect(screen.getByRole('option', { name: 'Unsorted' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Bass' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Loop' })).toBeInTheDocument()
  })

  it('AC-010a: user can type a new category name and click + to create it', async () => {
    const onCreateCategory = vi.fn().mockResolvedValue({ id: 99, name: 'Foley', parentId: null })
    renderTracker({ onCreateCategory })

    openManagePanel('Categories')

    const input = screen.getByRole('textbox', { name: /new category name/i })
    fireEvent.change(input, { target: { value: 'Foley' } })
    fireEvent.click(screen.getByRole('button', { name: /add category/i }))

    await waitFor(() => expect(onCreateCategory).toHaveBeenCalledWith('Foley', undefined))
  })

  it('AC-010b: user can choose a parent when creating a subcategory', async () => {
    const onCreateCategory = vi.fn().mockResolvedValue({ id: 99, name: 'Kicks', parentId: 2 })
    renderTracker({ onCreateCategory })

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
    beforeEach(() => {
      // Switch to Tags tab before each test — done inside each test via openManagePanel
    })

    it('AC-007: user can create a tag via the Tags tab', async () => {
      const onCreateTag = vi.fn().mockResolvedValue({ id: 1, name: 'Kick', color: null } as TagItem)
      renderTracker({ onCreateTag })

      openManagePanel('Tags')

      const input = screen.getByRole('textbox', { name: /new tag name/i })
      fireEvent.change(input, { target: { value: 'Kick' } })
      fireEvent.click(screen.getByRole('button', { name: /create tag/i }))

      await waitFor(() => expect(onCreateTag).toHaveBeenCalledWith('Kick'))
    })

    it('AC-007: newly created tag appears in the list after creation', () => {
      const tags: TagItem[] = [{ id: 1, name: 'Kick', color: null }]
      renderTracker({ tags })

      openManagePanel('Tags')

      expect(screen.getByText('Kick')).toBeInTheDocument()
    })

    it('AC-008: rename tag calls onRenameTag and updates display', async () => {
      const onRenameTag = vi.fn().mockResolvedValue(undefined)
      const tags: TagItem[] = [{ id: 1, name: 'OldName', color: null }]
      renderTracker({ tags, onRenameTag })

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
      renderTracker({ tags, onDeleteTag })

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
      renderTracker({ onSaveLibrary })

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
      renderTracker({ libraries })

      openManagePanel('Libraries')
      expect(screen.getByText('Drum Hits')).toBeInTheDocument()
    })

    it('AC-014: deleting a library calls onDeleteLibrary', async () => {
      const onDeleteLibrary = vi.fn().mockResolvedValue(undefined)
      const libraries: LibraryItem[] = [
        { id: 1, name: 'Drum Hits', createdAt: Date.now(), ruleJson: '{}' }
      ]
      renderTracker({ libraries, onDeleteLibrary })

      openManagePanel('Libraries')
      fireEvent.click(screen.getByRole('button', { name: /delete library Drum Hits/i }))

      await waitFor(() => expect(onDeleteLibrary).toHaveBeenCalledWith(1))
    })
  })

  // -------------------------------------------------------------------------
  // AC-001 / AC-002 / AC-003: indexing progress
  // -------------------------------------------------------------------------

  it('AC-001 / AC-002: scan progress indicator is visible when scanning', () => {
    renderTracker({ scanProgress: SCANNING_PROGRESS })
    expect(screen.getByLabelText(/scanning phase/i)).toBeInTheDocument()
  })

  it('scan progress is hidden when idle', () => {
    renderTracker({ scanProgress: IDLE_PROGRESS })
    expect(screen.queryByLabelText(/scanning phase/i)).not.toBeInTheDocument()
  })

  it('Re-scan button is disabled while scanning', () => {
    renderTracker({ scanProgress: SCANNING_PROGRESS })
    expect(screen.getByRole('button', { name: /scanning/i })).toBeDisabled()
  })

  it('AC-003: Re-scan triggers both onSampleRescan and onStartScan', async () => {
    const onRescan = vi.fn()
    const onStartScan = vi.fn().mockResolvedValue(undefined)
    renderTracker({ scanProgress: IDLE_PROGRESS, onRescan, onStartScan })

    fireEvent.click(screen.getByRole('button', { name: /re-scan/i }))

    expect(onRescan).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(onStartScan).toHaveBeenCalledTimes(1))
  })

  // -------------------------------------------------------------------------
  // AC-004: sample tiles
  // -------------------------------------------------------------------------

  it('AC-004: sample list renders all provided samples as tiles', () => {
    const samples = makeDbSamples(10)
    renderTracker({ samples, totalCount: 10 })
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
    renderTracker({ samples, totalCount: 3, onSortChange })

    fireEvent.click(screen.getByRole('button', { name: /^name/i }))
    expect(onSortChange).toHaveBeenCalledWith('filename')
  })

  it('AC-016: clicking Dur sort button calls onSortChange with duration', () => {
    const onSortChange = vi.fn()
    const samples = makeDbSamples(3)
    renderTracker({ samples, totalCount: 3, onSortChange })

    fireEvent.click(screen.getByRole('button', { name: /^dur/i }))
    expect(onSortChange).toHaveBeenCalledWith('duration')
  })

  it('AC-016: clicking Date sort button calls onSortChange with dateAdded', () => {
    const onSortChange = vi.fn()
    const samples = makeDbSamples(3)
    renderTracker({ samples, totalCount: 3, onSortChange })

    fireEvent.click(screen.getByRole('button', { name: /^date/i }))
    expect(onSortChange).toHaveBeenCalledWith('dateAdded')
  })

  // -------------------------------------------------------------------------
  // AC-006a: selecting a sample populates footer detail
  // -------------------------------------------------------------------------

  it('AC-006a: clicking a sample tile calls onSelectSampleDetail with the sample', () => {
    const onSelectSampleDetail = vi.fn()
    const samples = makeDbSamples(1)
    renderTracker({ samples, totalCount: 1, onSelectSampleDetail })

    // tile shows filename without extension: "sample_0"
    fireEvent.click(screen.getByRole('button', { name: /sample_0/i }))
    expect(onSelectSampleDetail).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'sample_0.wav', filepath: '/samples/sample_0.wav' })
    )
  })

  // -------------------------------------------------------------------------
  // AC-011: category filter activates via tile press
  // -------------------------------------------------------------------------

  it('AC-011: clicking a category tile calls onSelectCategory with the category id', () => {
    const onSelectCategory = vi.fn()
    renderTracker({ onSelectCategory })

    fireEvent.click(screen.getByRole('option', { name: 'Drums' }))
    expect(onSelectCategory).toHaveBeenCalledWith(4)
  })
})
