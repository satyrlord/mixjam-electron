import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SampleBrowser from './SampleBrowser'
import type { PlayerBrowserProps } from './playerProps'
import type { CategoryItem, LibraryItem, SampleListItem, ScanProgress, TagItem } from '../../../shared/backend-api'

const noop = () => undefined
const asyncNoop = async () => { /* empty */ }

const IDLE_PROGRESS: ScanProgress = { status: 'idle', phase: null, found: 0, processed: 0, total: 0 }
const CATEGORIES: CategoryItem[] = [
  { id: 1, name: 'Drums', parentId: null },
  { id: 2, name: 'Kicks', parentId: 1 },
  { id: 3, name: 'Snares', parentId: 1 },
  { id: 4, name: 'Bass', parentId: null }
]
const TAGS: TagItem[] = [
  { id: 10, name: 'Punchy', color: '#ff0000' },
  { id: 11, name: 'Dry', color: '#00ff00' }
]
const LIBRARIES: LibraryItem[] = [{ id: 1, name: 'Club', createdAt: 1, ruleJson: '{}' }]
const SAMPLE: SampleListItem = {
  id: 'samples/kick.wav',
  dbId: 42,
  name: 'kick.wav',
  relpath: 'samples/kick.wav',
  category: 'Drums',
  durationSeconds: 0.5,
  bpm: 120,
  bpmSource: 'analysis',
  musicalKey: 'C',
  musicalKeySource: 'analysis',
  sampleType: 'Kick',
  sampleTypeSource: 'analysis',
  tags: ['Punchy'],
  categoryId: 1,
  tagIds: [10]
}

function makeBrowser(overrides: Partial<PlayerBrowserProps> = {}): PlayerBrowserProps {
  return {
    samples: [SAMPLE],
    searchQuery: '',
    loading: false,
    error: null,
    totalCount: 1,
    hasMoreSamples: false,
    selectedSamplePath: null,
    selectedCategoryId: undefined,
    selectedTagIds: [],
    sortBy: 'filename',
    sortDir: 'asc',
    tags: TAGS,
    categories: CATEGORIES,
    libraries: LIBRARIES,
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
    onApplyLibrary: noop,
    ...overrides
  }
}

function renderBrowser(overrides: Partial<PlayerBrowserProps> = {}) {
  return render(
    <SampleBrowser
      browser={makeBrowser(overrides)}
      flashSamplePath={null}
      onSampleDragStart={vi.fn()}
    />
  )
}

describe('SampleBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('toggles category selection and clears a selected category', () => {
    const onSelectCategory = vi.fn()
    renderBrowser({ onSelectCategory })

    fireEvent.click(screen.getByRole('option', { name: 'Drums' }))
    expect(onSelectCategory).toHaveBeenCalledWith(1)

    renderBrowser({ selectedCategoryId: 1, onSelectCategory })
    fireEvent.click(screen.getAllByRole('option', { name: 'Drums' })[1]!)
    expect(onSelectCategory).toHaveBeenCalledWith(undefined)
  })

  it('renders subcategory chips, tag filters, and sort controls for active filters', () => {
    const onSelectCategory = vi.fn()
    const onToggleTagFilter = vi.fn()
    const onSortChange = vi.fn()
    renderBrowser({
      selectedCategoryId: 1,
      selectedTagIds: [10],
      sortBy: 'duration',
      sortDir: 'desc',
      onSelectCategory,
      onToggleTagFilter,
      onSortChange
    })

    fireEvent.click(screen.getByRole('button', { name: 'Clear category filter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Kicks' }))
    fireEvent.click(screen.getByRole('button', { name: 'Punchy ×' }))
    fireEvent.click(screen.getByRole('button', { name: 'Date' }))

    expect(onSelectCategory).toHaveBeenCalledWith(undefined)
    expect(onSelectCategory).toHaveBeenCalledWith(2)
    expect(onToggleTagFilter).toHaveBeenCalledWith(10)
    expect(onSortChange).toHaveBeenCalledWith('dateAdded')
    expect(screen.getByRole('button', { name: /dur/i })).toHaveAttribute('aria-sort', 'descending')
  })

  it('opens and closes the manage panel', () => {
    renderBrowser()

    fireEvent.click(screen.getByRole('button', { name: /manage tags, libraries, and categories/i }))
    expect(screen.getByRole('tab', { name: /tags/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /close manage panel/i }))
    expect(screen.queryByRole('tab', { name: /tags/i })).not.toBeInTheDocument()
  })

  it('clamps category-tree resize while dragging', () => {
    const { container } = renderBrowser()
    const cats = container.querySelector('.cats') as HTMLElement
    const separator = screen.getByRole('separator', { name: /resize category tree/i })

    expect(cats.style.width).toBe('152px')
    fireEvent.mouseDown(separator, { clientX: 100 })
    fireEvent.mouseMove(window, { clientX: -100 })
    expect(cats.style.width).toBe('80px')
    fireEvent.mouseMove(window, { clientX: 1000 })
    expect(cats.style.width).toBe('400px')
    fireEvent.mouseUp(window)
  })

  it('assigns and unassigns tags from the sample context menu', async () => {
    const onAssignTagToSample = vi.fn(asyncNoop)
    const onUnassignTagFromSample = vi.fn(asyncNoop)
    const { container } = renderBrowser({ onAssignTagToSample, onUnassignTagFromSample })

    fireEvent.contextMenu(container.querySelector('.tiles .sample-bubble')!, { clientX: 20, clientY: 30 })
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Untag: Punchy' }))
    await waitFor(() => expect(onUnassignTagFromSample).toHaveBeenCalledWith(SAMPLE, 10))

    fireEvent.contextMenu(container.querySelector('.tiles .sample-bubble')!, { clientX: 25, clientY: 35 })
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Tag: Dry' }))
    await waitFor(() => expect(onAssignTagToSample).toHaveBeenCalledWith(SAMPLE, 11))
  })

  it('shows an empty context-menu note and dismisses it on outside click', () => {
    const { container } = renderBrowser({ tags: [] })

    fireEvent.contextMenu(container.querySelector('.tiles .sample-bubble')!, { clientX: 20, clientY: 30 })
    expect(screen.getByText(/no tags yet/i)).toBeInTheDocument()

    fireEvent.click(window)
    expect(screen.queryByText(/no tags yet/i)).not.toBeInTheDocument()
  })

  it('AC-006/008: edits and clears analysis fields from the sample menu', async () => {
    const onUpdateSampleAnalysis = vi.fn(asyncNoop)
    const onReanalyzeSample = vi.fn(asyncNoop)
    const { container } = renderBrowser({ onUpdateSampleAnalysis, onReanalyzeSample })

    fireEvent.contextMenu(container.querySelector('.tiles .sample-bubble')!, { clientX: 20, clientY: 30 })
    fireEvent.click(screen.getByRole('menuitem', { name: /edit bpm, key, and type/i }))
    expect(screen.getByRole('dialog', { name: /analysis for kick.wav/i })).toBeInTheDocument()
    expect(screen.getByLabelText('Sample BPM')).toHaveValue(120)

    fireEvent.change(screen.getByLabelText('Sample BPM'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /save overrides/i }))
    await waitFor(() => expect(onUpdateSampleAnalysis).toHaveBeenCalledWith(SAMPLE, { bpm: null }))

    fireEvent.contextMenu(container.querySelector('.tiles .sample-bubble')!, { clientX: 20, clientY: 30 })
    fireEvent.click(screen.getByRole('menuitem', { name: /edit bpm, key, and type/i }))
    fireEvent.click(screen.getByRole('button', { name: /analyze blank fields/i }))
    await waitFor(() => expect(onReanalyzeSample).toHaveBeenCalledWith(SAMPLE))
  })

  it('shows error when analysis update fails', async () => {
    const onUpdateSampleAnalysis = vi.fn().mockRejectedValue(new Error('db locked'))
    const { container } = renderBrowser({ onUpdateSampleAnalysis })

    fireEvent.contextMenu(container.querySelector('.tiles .sample-bubble')!, { clientX: 20, clientY: 30 })
    fireEvent.click(screen.getByRole('menuitem', { name: /edit bpm, key, and type/i }))

    fireEvent.change(screen.getByLabelText('Sample BPM'), { target: { value: '140' } })
    fireEvent.click(screen.getByRole('button', { name: /save overrides/i }))
    await waitFor(() => expect(screen.getByText('db locked')).toBeInTheDocument())
  })

  it('shows fallback error message when rejection is not an Error instance', async () => {
    const onUpdateSampleAnalysis = vi.fn().mockRejectedValue('connection lost')
    const { container } = renderBrowser({ onUpdateSampleAnalysis })

    fireEvent.contextMenu(container.querySelector('.tiles .sample-bubble')!, { clientX: 20, clientY: 30 })
    fireEvent.click(screen.getByRole('menuitem', { name: /edit bpm, key, and type/i }))

    fireEvent.change(screen.getByLabelText('Sample BPM'), { target: { value: '140' } })
    fireEvent.click(screen.getByRole('button', { name: /save overrides/i }))
    await waitFor(() => expect(screen.getByText('Analysis update failed')).toBeInTheDocument())
  })

  it('saves only changed key field without touching bpm or type', async () => {
    const onUpdateSampleAnalysis = vi.fn(asyncNoop)
    const { container } = renderBrowser({ onUpdateSampleAnalysis })

    fireEvent.contextMenu(container.querySelector('.tiles .sample-bubble')!, { clientX: 20, clientY: 30 })
    fireEvent.click(screen.getByRole('menuitem', { name: /edit bpm, key, and type/i }))

    fireEvent.change(screen.getByLabelText('Sample musical key'), { target: { value: 'Am' } })
    fireEvent.click(screen.getByRole('button', { name: /save overrides/i }))
    await waitFor(() => expect(onUpdateSampleAnalysis).toHaveBeenCalledWith(SAMPLE, { musicalKey: 'Am' }))
  })

  it('preserves analysis provenance when BPM text is numerically unchanged', () => {
    const onUpdateSampleAnalysis = vi.fn(asyncNoop)
    const { container } = renderBrowser({ onUpdateSampleAnalysis })

    fireEvent.contextMenu(container.querySelector('.tiles .sample-bubble')!, { clientX: 20, clientY: 30 })
    fireEvent.click(screen.getByRole('menuitem', { name: /edit bpm, key, and type/i }))
    fireEvent.change(screen.getByLabelText('Sample BPM'), { target: { value: '120.0' } })
    fireEvent.click(screen.getByRole('button', { name: /save overrides/i }))

    expect(onUpdateSampleAnalysis).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: /analysis for kick.wav/i })).not.toBeInTheDocument()
  })

  it('saves only changed type field and clears it when set to Unspecified', async () => {
    const onUpdateSampleAnalysis = vi.fn(asyncNoop)
    const { container } = renderBrowser({ onUpdateSampleAnalysis })

    fireEvent.contextMenu(container.querySelector('.tiles .sample-bubble')!, { clientX: 20, clientY: 30 })
    fireEvent.click(screen.getByRole('menuitem', { name: /edit bpm, key, and type/i }))

    fireEvent.change(screen.getByLabelText('Sample type'), { target: { value: 'Snare' } })
    fireEvent.click(screen.getByRole('button', { name: /save overrides/i }))
    await waitFor(() => expect(onUpdateSampleAnalysis).toHaveBeenCalledWith(SAMPLE, { sampleType: 'Snare' }))
  })
})
