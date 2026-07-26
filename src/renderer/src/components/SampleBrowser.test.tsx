import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SampleListItem, TagItem } from '../../../shared/backend-api'
import type { PlayerBrowserProps } from './playerProps'
import SampleBrowser from './SampleBrowser'

const TAGS: TagItem[] = [
  { id: 10, name: 'Punchy', color: '#ff0000', origin: 'user', folderDerived: false },
  { id: 11, name: 'Bass', color: null, origin: 'folder', folderDerived: true }
]
const SAMPLE: SampleListItem = {
  id: 'Drums/kick.wav', dbId: 1, name: 'kick.wav', relpath: 'Drums/kick.wav', sourceGroup: 'Drums',
  durationSeconds: 1, bpm: 120, bpmSource: 'analysis', musicalKey: null, musicalKeySource: null,
  sampleType: 'Kick', sampleTypeSource: 'analysis', tags: ['Bass', 'Punchy'], tagIds: [10, 11], folderTagIds: [11], userTagIds: [10]
}

function renderBrowser(overrides: Partial<PlayerBrowserProps> = {}) {
  const browser: PlayerBrowserProps = {
    samples: [SAMPLE], searchQuery: '', loading: false, error: null, totalCount: 1, hasMoreSamples: false,
    selectedSamplePath: null, selectedTagIds: [], sortBy: 'filename', sortDir: 'asc', tags: TAGS,
    libraries: [], librarySyncState: { status: 'ready', rootKey: 'samples', lastCompletedAt: 1 },
    onSearchChange: vi.fn(), onLoadMoreSamples: vi.fn(), onSelectSampleDetail: vi.fn(), onPreviewSample: vi.fn(),
    onToggleTagFilter: vi.fn(), onSortChange: vi.fn(), onRescanLibrary: vi.fn(async () => undefined),
    onRetryLibrarySync: vi.fn(async () => undefined), onCancelLibrarySync: vi.fn(async () => undefined),
    onCreateTag: vi.fn(async (name, color) => ({ id: 99, name, color: color ?? null, origin: 'user' as const, folderDerived: false })),
    onRenameTag: vi.fn(async () => undefined), onSetTagColor: vi.fn(async () => undefined), onDeleteTag: vi.fn(async () => undefined),
    onAssignTagToSample: vi.fn(async () => undefined), onUnassignTagFromSample: vi.fn(async () => undefined),
    onUpdateSampleAnalysis: vi.fn(async () => undefined), onReanalyzeSample: vi.fn(async () => undefined),
    onSaveLibrary: vi.fn(async (name) => ({ id: 1, name, createdAt: 1, ruleJson: '{}' })),
    onDeleteLibrary: vi.fn(async () => undefined), onApplyLibrary: vi.fn(), ...overrides
  }
  return { browser, ...render(<SampleBrowser active browser={browser} flashSamplePath={null} onSampleDragStart={vi.fn()} />) }
}

describe('SampleBrowser tag workflow', () => {
  it('searches the flat tag navigator and toggles a tag filter', () => {
    const onToggleTagFilter = vi.fn()
    renderBrowser({ onToggleTagFilter })
    expect(screen.getByRole('list', { name: 'Sample tags' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search tags' }), { target: { value: 'punch' } })
    fireEvent.click(screen.getByRole('button', { name: 'Punchy' }))
    expect(onToggleTagFilter).toHaveBeenCalledWith(10)
    expect(screen.queryByRole('button', { name: 'Bass' })).not.toBeInTheDocument()
  })

  it('renders only active tags in the filter toolbar', () => {
    renderBrowser({ selectedTagIds: [10] })
    expect(screen.getByRole('group', { name: 'Active tag filters, match all' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Punchy filter' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove Bass filter' })).not.toBeInTheDocument()
  })

  it('replaces covered sample controls with the focused Manage region and restores focus', () => {
    renderBrowser()
    const toggle = screen.getByRole('button', { name: 'Manage tags and libraries' })
    expect(screen.getByRole('group', { name: 'Active tag filters, match all' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /kick 1.0s/i })).toBeInTheDocument()

    fireEvent.click(toggle)

    expect(screen.getByRole('region', { name: 'Manage tags and libraries' })).toHaveFocus()
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Tags', 'Libraries'])
    expect(screen.queryByRole('separator', { name: 'Resize tag navigator' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Active tag filters, match all' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /kick 1.0s/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close manage panel' }))

    expect(toggle).toHaveFocus()
    expect(screen.getByRole('separator', { name: 'Resize tag navigator' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Active tag filters, match all' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /kick 1.0s/i })).toBeInTheDocument()
  })

  it('opens one searchable tag editor from the sample context menu', async () => {
    renderBrowser()
    fireEvent.contextMenu(screen.getByRole('button', { name: /kick 1.0s/i }))
    expect(screen.getAllByRole('menuitem')).toHaveLength(2)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit tags…' }))
    expect(await screen.findByRole('dialog', { name: 'Tags for kick.wav' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search tags to assign' })).toBeInTheDocument()
  })

  it('assigns user tags but keeps folder-only tags read-only', async () => {
    const onUnassignTagFromSample = vi.fn(async () => undefined)
    renderBrowser({ onUnassignTagFromSample })
    fireEvent.contextMenu(screen.getByRole('button', { name: /kick 1.0s/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit tags…' }))
    await screen.findByRole('dialog', { name: 'Tags for kick.wav' })
    fireEvent.click(screen.getByRole('button', { name: 'Punchy' }))
    await vi.waitFor(() => expect(onUnassignTagFromSample).toHaveBeenCalledWith(SAMPLE, 10))
    expect(screen.getByRole('button', { name: 'Bass, assigned from folder' })).toBeDisabled()
  })

  it('pins a dual-source folder tag so it survives a later move', async () => {
    const onAssignTagToSample = vi.fn(async () => undefined)
    renderBrowser({
      tags: [TAGS[0]!, { ...TAGS[1]!, origin: 'shared' as const }],
      onAssignTagToSample
    })
    fireEvent.contextMenu(screen.getByRole('button', { name: /kick 1.0s/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit tags…' }))
    await screen.findByRole('dialog', { name: 'Tags for kick.wav' })

    const bass = screen.getByRole('button', { name: 'Bass, from folder, activate to keep after move' })
    expect(bass).toBeEnabled()
    expect(screen.getByText('From folder · Keep after move')).toBeInTheDocument()
    fireEvent.click(bass)

    await vi.waitFor(() => expect(onAssignTagToSample).toHaveBeenCalledWith(SAMPLE, 11))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Bass, kept after move' }))
      .toHaveAttribute('data-user-assigned', 'true'))
    expect(screen.getByText('From folder · Kept after move')).toBeInTheDocument()
  })

  it('exposes the resized left pane as a tag navigator separator', () => {
    renderBrowser()
    expect(screen.getByRole('separator', { name: 'Resize tag navigator' })).toBeInTheDocument()
  })
})
