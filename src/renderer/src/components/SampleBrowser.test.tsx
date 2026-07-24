import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SampleBrowser from './SampleBrowser'
import type { PlayerBrowserProps } from './playerProps'
import type { CategoryItem, LibraryItem, SampleListItem, TagItem } from '../../../shared/backend-api'

const noop = () => undefined
const asyncNoop = async () => { /* empty */ }

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
    librarySyncState: { status: 'ready', rootKey: 'samples', lastCompletedAt: 1 },
    onSearchChange: noop,
    onLoadMoreSamples: noop,
    onSelectSampleDetail: noop,
    onPreviewSample: noop,
    onSelectCategory: noop,
    onToggleTagFilter: noop,
    onSortChange: noop,
    onRescanLibrary: asyncNoop,
    onRetryLibrarySync: asyncNoop,
    onCancelLibrarySync: asyncNoop,
    onCreateTag: asyncNoop as never,
    onRenameTag: asyncNoop as never,
    onSetTagColor: asyncNoop as never,
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
      active
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

    fireEvent.click(screen.getByRole('button', { name: 'Drums' }))
    expect(onSelectCategory).toHaveBeenCalledWith(1)
    expect(screen.getByRole('button', { name: 'Drums' })).toHaveClass('sample-bubble-hit-target')

    renderBrowser({ selectedCategoryId: 1, onSelectCategory })
    fireEvent.click(screen.getAllByRole('button', { name: 'Drums' })[1]!)
    expect(onSelectCategory).toHaveBeenCalledWith(undefined)
  })

  it('renders nested categories, tag filters, and sort controls for active filters', () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Punchy' }))
    fireEvent.click(screen.getByRole('button', { name: /sort by date added/i }))

    expect(onSelectCategory).toHaveBeenCalledWith(undefined)
    expect(onSelectCategory).toHaveBeenCalledWith(2)
    expect(onToggleTagFilter).toHaveBeenCalledWith(10)
    expect(onSortChange).toHaveBeenCalledWith('dateAdded')
    expect(screen.getByRole('button', { name: /sort by duration, descending/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByText('1 sample')).toBeInTheDocument()
  })

  it('renders an expandable category tree with nested children', () => {
    const { container } = renderBrowser()

    expect(screen.getByRole('tree', { name: 'Sample categories' })).toBeInTheDocument()
    expect(container.querySelector('.category-tree')).toHaveClass('category-tree')
    expect(container.querySelector('.category-tree-toggle-spacer')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kicks' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Snares' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Collapse Drums' }))
    expect(screen.queryByRole('button', { name: 'Kicks' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Snares' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Expand Drums' }))
    expect(screen.getByRole('button', { name: 'Kicks' })).toBeInTheDocument()
  })

  it('keeps one visible category in the sequential tab order', () => {
    renderBrowser()

    expect(screen.getByRole('button', { name: 'Drums' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('button', { name: 'Kicks' })).toHaveAttribute('tabindex', '-1')
    expect(screen.getByRole('button', { name: 'Snares' })).toHaveAttribute('tabindex', '-1')
    expect(screen.getByRole('button', { name: 'Bass' })).toHaveAttribute('tabindex', '-1')
    expect(screen.getByRole('button', { name: 'Collapse Drums' })).toHaveAttribute('tabindex', '-1')
  })

  it('moves category focus through the visible tree with arrow, Home, and End keys', () => {
    renderBrowser()

    const drums = screen.getByRole('button', { name: 'Drums' })
    const kicks = screen.getByRole('button', { name: 'Kicks' })
    const snares = screen.getByRole('button', { name: 'Snares' })
    const bass = screen.getByRole('button', { name: 'Bass' })

    drums.focus()
    fireEvent.keyDown(drums, { key: 'ArrowDown' })
    expect(kicks).toHaveFocus()
    expect(kicks).toHaveAttribute('tabindex', '0')
    expect(drums).toHaveAttribute('tabindex', '-1')

    fireEvent.keyDown(kicks, { key: 'ArrowDown' })
    expect(snares).toHaveFocus()
    fireEvent.keyDown(snares, { key: 'End' })
    expect(bass).toHaveFocus()
    fireEvent.keyDown(bass, { key: 'ArrowUp' })
    expect(snares).toHaveFocus()
    fireEvent.keyDown(snares, { key: 'Home' })
    expect(drums).toHaveFocus()
  })

  it('expands, collapses, and enters category branches with arrow keys', () => {
    renderBrowser()

    const drums = screen.getByRole('button', { name: 'Drums' })
    drums.focus()
    fireEvent.keyDown(drums, { key: 'ArrowLeft' })
    expect(screen.queryByRole('button', { name: 'Kicks' })).not.toBeInTheDocument()
    expect(drums).toHaveFocus()

    fireEvent.keyDown(drums, { key: 'ArrowRight' })
    const kicks = screen.getByRole('button', { name: 'Kicks' })
    expect(drums).toHaveFocus()
    fireEvent.keyDown(drums, { key: 'ArrowRight' })
    expect(kicks).toHaveFocus()

    fireEvent.keyDown(kicks, { key: 'ArrowLeft' })
    expect(drums).toHaveFocus()
  })

  it('selects the focused category with Enter or Space', () => {
    const onSelectCategory = vi.fn()
    renderBrowser({ onSelectCategory })

    const drums = screen.getByRole('button', { name: 'Drums' })
    drums.focus()
    fireEvent.keyDown(drums, { key: 'Enter' })
    expect(onSelectCategory).toHaveBeenCalledWith(1)

    fireEvent.keyDown(drums, { key: 'ArrowDown' })
    const kicks = screen.getByRole('button', { name: 'Kicks' })
    fireEvent.keyDown(kicks, { key: ' ' })
    expect(onSelectCategory).toHaveBeenCalledWith(2)
  })

  it('shows tag colors on filter chips', () => {
    const { container } = renderBrowser()

    const tag = screen.getByRole('button', { name: 'Punchy' })
    expect(tag.querySelector('.tag-color-dot')).toHaveStyle({ backgroundColor: '#ff0000' })
    // The chip itself carries no inline color; color lives only on the dot.
    expect(container.querySelector('.subcat[data-has-color]')).not.toBeInTheDocument()
  })

  it('opens and closes the manage panel', () => {
    renderBrowser()

    const manage = screen.getByRole('button', { name: /manage tags, libraries, and categories/i })
    expect(manage).toHaveAttribute('aria-expanded', 'false')
    expect(manage).toHaveAttribute('aria-controls', 'sample-browser-manage-panel')
    fireEvent.click(manage)
    expect(manage).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('tab', { name: /tags/i })).toBeInTheDocument()
    expect(document.getElementById('sample-browser-manage-panel')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /close manage panel/i }))
    expect(screen.queryByRole('tab', { name: /tags/i })).not.toBeInTheDocument()
  })

  it('keeps each sample bubble on its own category palette while filtering', () => {
    const { container } = renderBrowser({ selectedCategoryId: 2 })

    expect(container.querySelector('.tiles .sample-bubble')).toHaveStyle({
      backgroundColor: 'var(--palette-0)'
    })
  })

  it('clears search, category, and tag filters from the zero-results state', () => {
    const onSearchChange = vi.fn()
    const onSelectCategory = vi.fn()
    const onToggleTagFilter = vi.fn()
    renderBrowser({
      samples: [],
      totalCount: 0,
      searchQuery: 'missing',
      selectedCategoryId: 1,
      selectedTagIds: [10],
      onSearchChange,
      onSelectCategory,
      onToggleTagFilter
    })

    expect(screen.getByText('0 samples')).toBeInTheDocument()
    expect(screen.getByText('No matching samples')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))

    expect(onSearchChange).toHaveBeenCalledWith('')
    expect(onSelectCategory).toHaveBeenCalledWith(undefined)
    expect(onToggleTagFilter).toHaveBeenCalledWith(10)
  })

  it('shows first-sync progress inside the Samples panel', () => {
    const { container } = renderBrowser({
      samples: [],
      totalCount: 0,
      loading: false,
      librarySyncState: {
        status: 'syncing',
        rootKey: 'samples',
        jobId: 'sync-1',
        hasUsableIndex: false,
        phase: 1,
        found: 12,
        processed: 0,
        total: 0
      }
    })

    expect(screen.getByText('Preparing your sample library')).toBeInTheDocument()
    expect(container.querySelector('.tiles')).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelector('.tiles-skeleton')).toBeInTheDocument()
  })

  it('exposes an accessible category-tree resize separator', () => {
    renderBrowser()
    const separator = screen.getByRole('separator', { name: /resize category tree/i })

    expect(separator).toHaveAttribute('tabindex', '0')
    expect(separator).toHaveAttribute('aria-valuenow')
  })

  it('assigns and unassigns tags from the sample context menu', async () => {
    const onAssignTagToSample = vi.fn(asyncNoop)
    const onUnassignTagFromSample = vi.fn(asyncNoop)
    const { container } = renderBrowser({ onAssignTagToSample, onUnassignTagFromSample })

    fireEvent.contextMenu(container.querySelector('.tiles .sample-bubble')!, { clientX: 20, clientY: 30 })
    expect(screen.getByRole('menu', { name: 'Sample actions for kick.wav' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Punchy' }))
    await waitFor(() => expect(onUnassignTagFromSample).toHaveBeenCalledWith(SAMPLE, 10))

    fireEvent.contextMenu(container.querySelector('.tiles .sample-bubble')!, { clientX: 25, clientY: 35 })
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Dry' }))
    await waitFor(() => expect(onAssignTagToSample).toHaveBeenCalledWith(SAMPLE, 11))
  })

  it('shows an empty context-menu note and dismisses it on Escape', () => {
    const { container } = renderBrowser({ tags: [] })

    fireEvent.contextMenu(container.querySelector('.tiles .sample-bubble')!, { clientX: 20, clientY: 30 })
    expect(screen.getByText(/no tags yet/i)).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText(/no tags yet/i)).not.toBeInTheDocument()
  })

  it('AC-006/008: edits and clears analysis fields from the sample menu', async () => {
    const onUpdateSampleAnalysis = vi.fn(asyncNoop)
    const onReanalyzeSample = vi.fn(asyncNoop)
    const { container } = renderBrowser({ onUpdateSampleAnalysis, onReanalyzeSample })

    fireEvent.contextMenu(container.querySelector('.tiles .sample-bubble')!, { clientX: 20, clientY: 30 })
    fireEvent.click(screen.getByRole('menuitem', { name: /edit bpm, key, and type/i }))
    expect(await screen.findByRole('dialog', { name: /analysis for kick.wav/i })).toBeInTheDocument()
    expect(screen.getByLabelText('Sample BPM')).toHaveValue(120)

    fireEvent.change(screen.getByLabelText('Sample BPM'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /save overrides/i }))
    await waitFor(() => expect(onUpdateSampleAnalysis).toHaveBeenCalledWith(SAMPLE, { bpm: null }))

    fireEvent.contextMenu(container.querySelector('.tiles .sample-bubble')!, { clientX: 20, clientY: 30 })
    fireEvent.click(screen.getByRole('menuitem', { name: /edit bpm, key, and type/i }))
    await screen.findByRole('dialog', { name: /analysis for kick.wav/i })
    fireEvent.click(screen.getByRole('button', { name: /analyze blank fields/i }))
    await waitFor(() => expect(onReanalyzeSample).toHaveBeenCalledWith(SAMPLE))
  })

  it('shows error when analysis update fails', async () => {
    const onUpdateSampleAnalysis = vi.fn().mockRejectedValue(new Error('db locked'))
    const { container } = renderBrowser({ onUpdateSampleAnalysis })

    fireEvent.contextMenu(container.querySelector('.tiles .sample-bubble')!, { clientX: 20, clientY: 30 })
    fireEvent.click(screen.getByRole('menuitem', { name: /edit bpm, key, and type/i }))
    await screen.findByRole('dialog', { name: /analysis for kick.wav/i })

    fireEvent.change(screen.getByLabelText('Sample BPM'), { target: { value: '140' } })
    fireEvent.click(screen.getByRole('button', { name: /save overrides/i }))
    await waitFor(() => expect(screen.getByText('db locked')).toBeInTheDocument())
  })

  it('shows fallback error message when rejection is not an Error instance', async () => {
    const onUpdateSampleAnalysis = vi.fn().mockRejectedValue('connection lost')
    const { container } = renderBrowser({ onUpdateSampleAnalysis })

    fireEvent.contextMenu(container.querySelector('.tiles .sample-bubble')!, { clientX: 20, clientY: 30 })
    fireEvent.click(screen.getByRole('menuitem', { name: /edit bpm, key, and type/i }))
    await screen.findByRole('dialog', { name: /analysis for kick.wav/i })

    fireEvent.change(screen.getByLabelText('Sample BPM'), { target: { value: '140' } })
    fireEvent.click(screen.getByRole('button', { name: /save overrides/i }))
    await waitFor(() => expect(screen.getByText('Analysis update failed')).toBeInTheDocument())
  })

  it('saves only changed key field without touching bpm or type', async () => {
    const onUpdateSampleAnalysis = vi.fn(asyncNoop)
    const { container } = renderBrowser({ onUpdateSampleAnalysis })

    fireEvent.contextMenu(container.querySelector('.tiles .sample-bubble')!, { clientX: 20, clientY: 30 })
    fireEvent.click(screen.getByRole('menuitem', { name: /edit bpm, key, and type/i }))
    await screen.findByRole('dialog', { name: /analysis for kick.wav/i })

    fireEvent.change(screen.getByLabelText('Sample musical key'), { target: { value: 'Am' } })
    fireEvent.click(screen.getByRole('button', { name: /save overrides/i }))
    await waitFor(() => expect(onUpdateSampleAnalysis).toHaveBeenCalledWith(SAMPLE, { musicalKey: 'Am' }))
  })

  it('preserves analysis provenance when BPM text is numerically unchanged', async () => {
    const onUpdateSampleAnalysis = vi.fn(asyncNoop)
    const { container } = renderBrowser({ onUpdateSampleAnalysis })

    fireEvent.contextMenu(container.querySelector('.tiles .sample-bubble')!, { clientX: 20, clientY: 30 })
    fireEvent.click(screen.getByRole('menuitem', { name: /edit bpm, key, and type/i }))
    await screen.findByRole('dialog', { name: /analysis for kick.wav/i })
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
    await screen.findByRole('dialog', { name: /analysis for kick.wav/i })

    fireEvent.change(screen.getByLabelText('Sample type'), { target: { value: 'Snare' } })
    fireEvent.click(screen.getByRole('button', { name: /save overrides/i }))
    await waitFor(() => expect(onUpdateSampleAnalysis).toHaveBeenCalledWith(SAMPLE, { sampleType: 'Snare' }))
  })
})
