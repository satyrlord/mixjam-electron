import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isTagEditable, type SampleListItem } from '../../../shared/backend-api'
import { filterTagsBySearch } from '../lib/tag-utils'
import {
  DEFAULT_SAMPLE_BUBBLE_PIXELS_PER_SECOND,
  type FooterSampleDetail
} from '../lib/arrangement'
import type { PlayerBrowserProps } from './playerProps'
import ManagePanel from './ManagePanel'
import SampleTileGrid from './SampleTileGrid'
import SampleAnalysisEditor from './SampleAnalysisEditor'
import { Panel, PanelGroup, PanelResizeHandle } from './ui/ResizablePanels'
import { ContextMenuContent, ContextMenuItem } from './ui/ContextMenu'
import { PopoverAnchor, PopoverContent, PopoverRoot } from './ui/Popover'
import { Tooltip } from './ui/Tooltip'

interface SampleBrowserProps {
  active: boolean
  browser: PlayerBrowserProps
  bubblePixelsPerSecond?: number
  pixelsPerTick?: number
  projectBpm?: number
  durationTicksBySamplePath?: ReadonlyMap<string, number>
  flashSamplePath: string | null
  onSampleDragStart: (event: React.DragEvent, detail: FooterSampleDetail) => void
}

const SORT_OPTIONS = [
  { column: 'filename', label: 'Name', accessibleLabel: 'name' },
  { column: 'duration', label: 'Duration', accessibleLabel: 'duration' },
  { column: 'dateAdded', label: 'Added', accessibleLabel: 'date added' }
] as const

interface TagEditorState {
  sample: SampleListItem
  assignedIds: Set<number>
  folderAssignedIds: Set<number>
  userAssignedIds: Set<number>
}

interface TagEditorRowLabels {
  /** Provenance caption under the tag name, or null when there is none. */
  source: string | null
  accessible: string
}

/** A folder-assigned tag can also carry a user assignment, which is what keeps
 *  it on the sample after the file moves out of that directory. The toggle
 *  therefore controls the *user* assignment whenever one is possible. */
function tagEditorRowLabels(
  name: string,
  editable: boolean,
  folderAssigned: boolean,
  userAssigned: boolean,
  assigned: boolean
): TagEditorRowLabels {
  if (!editable) {
    return {
      source: folderAssigned ? 'From folder' : null,
      accessible: assigned ? `${name}, assigned from folder` : name
    }
  }
  if (!folderAssigned) return { source: null, accessible: name }
  return userAssigned
    ? { source: 'From folder · Kept after move', accessible: `${name}, kept after move` }
    : {
        source: 'From folder · Keep after move',
        accessible: `${name}, from folder, activate to keep after move`
      }
}

function SampleBrowser({
  active,
  browser,
  bubblePixelsPerSecond = DEFAULT_SAMPLE_BUBBLE_PIXELS_PER_SECOND,
  pixelsPerTick,
  projectBpm,
  durationTicksBySamplePath,
  flashSamplePath,
  onSampleDragStart
}: SampleBrowserProps) {
  const {
    samples,
    loading,
    error,
    totalCount,
    hasMoreSamples,
    selectedSamplePath,
    selectedTagIds,
    sortBy,
    sortDir,
    tags,
    libraries,
    searchQuery,
    librarySyncState,
    onSearchChange,
    onToggleTagFilter,
    onAssignTagToSample,
    onUnassignTagFromSample
  } = browser

  const [managePanelOpen, setManagePanelOpen] = useState(false)
  const [navigatorSearch, setNavigatorSearch] = useState('')
  const [tagEditorSearch, setTagEditorSearch] = useState('')
  const [analysisEditor, setAnalysisEditor] = useState<SampleListItem | null>(null)
  const [tagEditor, setTagEditor] = useState<TagEditorState | null>(null)
  const [tagEditorBusyId, setTagEditorBusyId] = useState<number | null>(null)
  const sampleAnchorRef = useRef<HTMLElement | null>(null)
  const manageToggleRef = useRef<HTMLButtonElement>(null)
  const managePanelRef = useRef<HTMLDivElement>(null)
  const manageWasOpenRef = useRef(false)

  useEffect(() => {
    if (managePanelOpen) managePanelRef.current?.focus()
    else if (manageWasOpenRef.current) manageToggleRef.current?.focus()
    manageWasOpenRef.current = managePanelOpen
  }, [managePanelOpen])

  const visibleNavigatorTags = useMemo(
    () => filterTagsBySearch(tags, navigatorSearch),
    [navigatorSearch, tags]
  )

  const visibleEditorTags = useMemo(
    () => filterTagsBySearch(tags, tagEditorSearch),
    [tagEditorSearch, tags]
  )

  const activeTags = useMemo(
    () => selectedTagIds.flatMap((id) => {
      const tag = tags.find((candidate) => candidate.id === id)
      return tag ? [tag] : []
    }),
    [selectedTagIds, tags]
  )

  const handleSampleContextMenuOpen = useCallback((_sample: SampleListItem, anchor: HTMLButtonElement) => {
    sampleAnchorRef.current = anchor
  }, [])

  const renderSampleContextMenu = useCallback((sample: SampleListItem) => (
    <ContextMenuContent aria-label={`Sample actions for ${sample.name}`}>
      <ContextMenuItem onSelect={() => { window.setTimeout(() => setAnalysisEditor(sample), 0) }}>
        Edit BPM, key, and type
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() => {
          window.setTimeout(() => {
            setTagEditorSearch('')
            setTagEditor({
              sample,
              assignedIds: new Set(sample.tagIds),
              folderAssignedIds: new Set(sample.folderTagIds),
              userAssignedIds: new Set(sample.userTagIds)
            })
          }, 0)
        }}
      >
        Edit tags…
      </ContextMenuItem>
    </ContextMenuContent>
  ), [])

  const toggleSampleTag = useCallback(async (tagId: number) => {
    if (!tagEditor) return
    // Capture the invariants before the async gap: the popover may close or
    // switch samples while the backend call is in flight, so the updater must
    // compare against these, not the closure-stale tagEditor object.
    const sample = tagEditor.sample
    const userAssigned = tagEditor.userAssignedIds.has(tagId)
    setTagEditorBusyId(tagId)
    try {
      if (userAssigned) await onUnassignTagFromSample(sample, tagId)
      else await onAssignTagToSample(sample, tagId)
      setTagEditor((current) => {
        if (!current || current.sample.dbId !== sample.dbId) return current
        const userAssignedIds = new Set(current.userAssignedIds)
        if (userAssigned) userAssignedIds.delete(tagId)
        else userAssignedIds.add(tagId)
        const assignedIds = new Set([...current.folderAssignedIds, ...userAssignedIds])
        const tagNames = [...assignedIds]
          .flatMap((id) => tags.find((tag) => tag.id === id)?.name ?? [])
          .sort((left, right) => left.localeCompare(right))
        return {
          ...current,
          assignedIds,
          userAssignedIds,
          sample: {
            ...current.sample,
            tagIds: [...assignedIds].sort((left, right) => left - right),
            userTagIds: [...userAssignedIds].sort((left, right) => left - right),
            tags: tagNames
          }
        }
      })
    } finally {
      setTagEditorBusyId(null)
    }
  }, [onAssignTagToSample, onUnassignTagFromSample, tagEditor, tags])

  const hasActiveFilters = searchQuery.trim().length > 0 || selectedTagIds.length > 0
  const preparingFirstIndex = librarySyncState.status === 'unindexed' ||
    librarySyncState.status === 'checking' ||
    (librarySyncState.status === 'syncing' && !librarySyncState.hasUsableIndex)
  const syncError = librarySyncState.status === 'error' && !librarySyncState.hasUsableIndex
    ? librarySyncState.message
    : null

  let emptyTitle = 'No samples yet'
  let emptyDescription = 'This Sample Folder has no supported audio files.'
  if (hasActiveFilters) {
    emptyTitle = 'No matching samples'
    emptyDescription = 'Try a different search or tag.'
  } else if (librarySyncState.status === 'unavailable') {
    emptyTitle = 'Sample Folder unavailable'
    emptyDescription = 'Return to Home to restore or choose your Sample Folder.'
  } else if (librarySyncState.status === 'cancelled' && !librarySyncState.hasUsableIndex) {
    emptyTitle = 'Library sync was cancelled'
    emptyDescription = 'Use Retry library sync in the status area to continue.'
  }

  const clearFilters = useCallback(() => {
    if (searchQuery.trim()) onSearchChange('')
    for (const tagId of selectedTagIds) onToggleTagFilter(tagId)
  }, [onSearchChange, onToggleTagFilter, searchQuery, selectedTagIds])

  const sortIcon = (column: typeof sortBy) => {
    if (sortBy !== column) return null
    return <span className="sort-direction" aria-hidden="true">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <section className="browser-region" aria-label="Sample Browser">
      <PanelGroup
        id="sample-browser-split"
        className="sample-browser-panels"
        orientation="horizontal"
        defaultLayout={{ tags: 24, samples: 76 }}
      >
        <Panel id="tags" defaultSize="152px" minSize="120px" maxSize="400px" groupResizeBehavior="preserve-pixel-size">
          <div className="cats tag-navigator">
            <div className="cats-actions">
              <Tooltip content={managePanelOpen ? 'Close manage panel' : 'Manage tags and libraries'}>
                <button
                  ref={manageToggleRef}
                  type="button"
                  className="cat-manage-btn"
                  aria-label={managePanelOpen ? 'Close manage panel' : 'Manage tags and libraries'}
                  aria-expanded={managePanelOpen}
                  aria-controls="sample-browser-manage-panel"
                  onClick={() => setManagePanelOpen((value) => !value)}
                >
                  {managePanelOpen ? 'Close' : 'Manage'}
                </button>
              </Tooltip>
            </div>
            <input
              type="search"
              className="tag-navigator-search"
              value={navigatorSearch}
              onChange={(event) => setNavigatorSearch(event.currentTarget.value)}
              placeholder="Search tags"
              aria-label="Search tags"
            />
            <div className="tag-navigator-list" role="list" aria-label="Sample tags">
              {visibleNavigatorTags.map((tag) => {
                const selected = selectedTagIds.includes(tag.id)
                return (
                  <div key={tag.id} role="listitem">
                    <button
                      type="button"
                      className={`tag-navigator-item${selected ? ' selected' : ''}`}
                      aria-pressed={selected}
                      onClick={() => onToggleTagFilter(tag.id)}
                    >
                      <span className="tag-color-dot" style={tag.color ? { backgroundColor: tag.color } : undefined} data-empty={tag.color === null ? 'true' : undefined} aria-hidden="true" />
                      <span>{tag.name}</span>
                    </button>
                  </div>
                )
              })}
              {visibleNavigatorTags.length === 0 && (
                <p className="tag-navigator-empty">{tags.length === 0 ? 'No tags yet.' : 'No matching tags.'}</p>
              )}
            </div>
          </div>
        </Panel>

        {!managePanelOpen && (
          <PanelResizeHandle className="browser-resize-v" aria-label="Resize tag navigator" />
        )}

        <Panel id="samples" minSize="240px">
          {managePanelOpen ? (
            <ManagePanel
              ref={managePanelRef}
              tags={tags}
              libraries={libraries}
              onCreateTag={browser.onCreateTag}
              onRenameTag={browser.onRenameTag}
              onSetTagColor={browser.onSetTagColor}
              onDeleteTag={browser.onDeleteTag}
              onSaveLibrary={browser.onSaveLibrary}
              onDeleteLibrary={browser.onDeleteLibrary}
              onApplyLibrary={browser.onApplyLibrary}
            />
          ) : (
            <div className="tiles-section">
            <div className="subcats-row">
              <div className="sample-filter-strip" role="group" aria-label="Active tag filters, match all">
                {activeTags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    className="subcat subcat-active"
                    onClick={() => onToggleTagFilter(tag.id)}
                    aria-label={`Remove ${tag.name} filter`}
                  >
                    <span className="tag-color-dot" style={tag.color ? { backgroundColor: tag.color } : undefined} data-empty={tag.color === null ? 'true' : undefined} aria-hidden="true" />
                    <span>{tag.name}</span>
                    <span aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
              <div className="sample-results-controls">
                <output className="subcats-count" aria-live="polite" aria-atomic="true">
                  {totalCount.toLocaleString()} {totalCount === 1 ? 'sample' : 'samples'}
                </output>
                {totalCount > 0 && (
                  <div className="sort-row" role="group" aria-label="Sort samples">
                    {SORT_OPTIONS.map(({ column, label, accessibleLabel }) => {
                      const selected = sortBy === column
                      const direction = sortDir === 'asc' ? 'ascending' : 'descending'
                      const nextDirection = sortDir === 'asc' ? 'descending' : 'ascending'
                      return (
                        <button
                          key={column}
                          type="button"
                          className={`sort-btn${selected ? ' sort-btn-active' : ''}`}
                          onClick={() => browser.onSortChange(column)}
                          aria-pressed={selected}
                          aria-label={selected
                            ? `Sort by ${accessibleLabel}, ${direction}. Activate for ${nextDirection}.`
                            : `Sort by ${accessibleLabel}`}
                        >
                          {label}{sortIcon(column)}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            <SampleTileGrid
              active={active}
              samples={samples}
              bubblePixelsPerSecond={bubblePixelsPerSecond}
              pixelsPerTick={pixelsPerTick}
              projectBpm={projectBpm}
              durationTicksBySamplePath={durationTicksBySamplePath}
              selectedSamplePath={selectedSamplePath}
              flashSamplePath={flashSamplePath}
              loading={loading || preparingFirstIndex}
              loadingTitle={preparingFirstIndex ? 'Preparing your sample library' : 'Loading samples'}
              loadingDescription={preparingFirstIndex ? 'Samples will appear here as soon as the first sync finishes.' : 'Loading the current library view.'}
              error={error ?? syncError}
              emptyTitle={emptyTitle}
              emptyDescription={emptyDescription}
              onClearFilters={hasActiveFilters ? clearFilters : undefined}
              hasMore={hasMoreSamples}
              onLoadMore={browser.onLoadMoreSamples}
              onSelectSampleDetail={browser.onSelectSampleDetail}
              onPreviewSample={browser.onPreviewSample}
              onSampleDragStart={onSampleDragStart}
              onSampleContextMenuOpen={handleSampleContextMenuOpen}
              renderSampleContextMenu={renderSampleContextMenu}
            />
            </div>
          )}
        </Panel>
      </PanelGroup>

      <PopoverRoot modal open={tagEditor !== null} onOpenChange={(open) => { if (!open) setTagEditor(null) }}>
        <PopoverAnchor virtualRef={sampleAnchorRef} />
        {tagEditor && (
          <PopoverContent className="sample-tag-editor" aria-label={`Tags for ${tagEditor.sample.name}`} align="start">
            <div className="sample-tag-editor-header">
              <strong>Edit tags</strong>
              <span>{tagEditor.sample.name}</span>
            </div>
            <input
              type="search"
              className="tag-navigator-search"
              value={tagEditorSearch}
              onChange={(event) => setTagEditorSearch(event.currentTarget.value)}
              placeholder="Search tags"
              aria-label="Search tags to assign"
              autoFocus
            />
            <div className="sample-tag-editor-list" role="group" aria-label="Assigned tags">
              {visibleEditorTags.map((tag) => {
                const assigned = tagEditor.assignedIds.has(tag.id)
                const folderAssigned = tagEditor.folderAssignedIds.has(tag.id)
                const userAssigned = tagEditor.userAssignedIds.has(tag.id)
                const editable = isTagEditable(tag.origin)
                const labels = tagEditorRowLabels(
                  tag.name, editable, folderAssigned, userAssigned, assigned
                )
                return (
                  <button
                    key={tag.id}
                    type="button"
                    className="sample-tag-editor-item"
                    aria-pressed={editable && folderAssigned ? userAssigned : assigned}
                    disabled={!editable || tagEditorBusyId !== null}
                    aria-label={labels.accessible}
                    data-user-assigned={userAssigned ? 'true' : undefined}
                    onClick={() => void toggleSampleTag(tag.id)}
                  >
                    <span className="sample-tag-editor-check" aria-hidden="true">
                      {assigned ? (
                        <svg viewBox="0 0 12 12">
                          <path d="M2 6.25 4.75 9 10 3" />
                        </svg>
                      ) : null}
                    </span>
                    <span className="tag-color-dot" style={tag.color ? { backgroundColor: tag.color } : undefined} data-empty={tag.color === null ? 'true' : undefined} aria-hidden="true" />
                    <span>{tag.name}</span>
                    {labels.source && <small className="sample-tag-editor-source">{labels.source}</small>}
                  </button>
                )
              })}
              {visibleEditorTags.length === 0 && <p className="context-menu-note">{tags.length === 0 ? 'Create a tag in Manage first.' : 'No matching tags.'}</p>}
            </div>
          </PopoverContent>
        )}
      </PopoverRoot>

      <PopoverRoot modal open={analysisEditor !== null} onOpenChange={(open) => { if (!open) setAnalysisEditor(null) }}>
        <PopoverAnchor virtualRef={sampleAnchorRef} />
        {analysisEditor && (
          <PopoverContent aria-label={`Analysis for ${analysisEditor.name}`} align="start">
            <SampleAnalysisEditor sample={analysisEditor} onClose={() => setAnalysisEditor(null)} onUpdate={browser.onUpdateSampleAnalysis} onReanalyze={browser.onReanalyzeSample} />
          </PopoverContent>
        )}
      </PopoverRoot>
    </section>
  )
}

export default memo(SampleBrowser)
