import { useCallback, useMemo, useRef, useState } from 'react'
import type { CategoryItem, SampleListItem } from '../../../shared/backend-api'
import {
  DEFAULT_SAMPLE_BUBBLE_PIXELS_PER_SECOND,
  type FooterSampleDetail
} from '../lib/arrangement'
import { categorySlot } from '../lib/sample-utils'
import { sampleBubbleDomStyle } from '../theme/sample-bubble-style'
import type { PlayerBrowserProps } from './playerProps'
import ManagePanel from './ManagePanel'
import SampleTileGrid from './SampleTileGrid'
import SampleAnalysisEditor from './SampleAnalysisEditor'
import { Panel, PanelGroup, PanelResizeHandle } from './ui/ResizablePanels'
import {
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel
} from './ui/ContextMenu'
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

interface CategoryTreeNodeProps {
  category: CategoryItem
  childrenByParent: ReadonlyMap<number | null, CategoryItem[]>
  collapsedCategoryIds: ReadonlySet<number>
  selectedCategoryId: number | undefined
  tabbableCategoryId: number | undefined
  visibleCategoryIds: readonly number[]
  depth: number
  registerCategoryButton: (id: number, node: HTMLButtonElement | null) => void
  onFocusCategory: (id: number) => void
  onToggleExpanded: (id: number) => void
  onSelectCategory: (id: number | undefined) => void
}

function CategoryTreeNode({
  category,
  childrenByParent,
  collapsedCategoryIds,
  selectedCategoryId,
  tabbableCategoryId,
  visibleCategoryIds,
  depth,
  registerCategoryButton,
  onFocusCategory,
  onToggleExpanded,
  onSelectCategory
}: CategoryTreeNodeProps) {
  const children = childrenByParent.get(category.id) ?? []
  const hasChildren = children.length > 0
  const expanded = hasChildren && !collapsedCategoryIds.has(category.id)
  const selected = selectedCategoryId === category.id
  const visibleIndex = visibleCategoryIds.indexOf(category.id)

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    let nextCategoryId: number | undefined

    switch (event.key) {
      case 'ArrowDown':
        nextCategoryId = visibleCategoryIds[visibleIndex + 1] ?? category.id
        break
      case 'ArrowUp':
        nextCategoryId = visibleCategoryIds[visibleIndex - 1] ?? category.id
        break
      case 'Home':
        nextCategoryId = visibleCategoryIds[0]
        break
      case 'End':
        nextCategoryId = visibleCategoryIds.at(-1)
        break
      case 'ArrowRight':
        if (hasChildren && !expanded) {
          event.preventDefault()
          onToggleExpanded(category.id)
          return
        }
        nextCategoryId = expanded ? children[0]?.id : category.id
        break
      case 'ArrowLeft':
        if (expanded) {
          event.preventDefault()
          onToggleExpanded(category.id)
          return
        }
        nextCategoryId = category.parentId ?? category.id
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        onSelectCategory(selected ? undefined : category.id)
        return
      default:
        return
    }

    event.preventDefault()
    if (nextCategoryId !== undefined) onFocusCategory(nextCategoryId)
  }

  return (
    <div
      className={`category-tree-node${hasChildren ? ' category-tree-node-branch' : ''}`}
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={hasChildren ? expanded : undefined}
      aria-selected={selected}
    >
      <div
        className="category-tree-row"
        style={{ '--category-depth': depth } as React.CSSProperties}
      >
        {hasChildren ? (
          <button
            type="button"
            className="category-tree-toggle"
            tabIndex={-1}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${category.name}`}
            onClick={() => {
              onFocusCategory(category.id)
              onToggleExpanded(category.id)
            }}
          >
            <span aria-hidden="true">{expanded ? '▾' : '›'}</span>
          </button>
        ) : null}
        <button
          ref={(node) => registerCategoryButton(category.id, node)}
          type="button"
          className="sample-bubble-hit-target sample-bubble-category-target"
          tabIndex={tabbableCategoryId === category.id ? 0 : -1}
          aria-pressed={selected}
          onClick={() => {
            onFocusCategory(category.id)
            onSelectCategory(selected ? undefined : category.id)
          }}
          onKeyDown={handleKeyDown}
        >
          <span
            className={`sample-bubble bubble-category${selected ? ' selected' : ''}`}
            style={sampleBubbleDomStyle(categorySlot(category.name)) as React.CSSProperties}
          >
            {category.name}
          </span>
        </button>
      </div>
      {expanded && (
        <div className="category-tree-children" role="group">
          {children.map((child) => (
            <CategoryTreeNode
              key={child.id}
              category={child}
              childrenByParent={childrenByParent}
              collapsedCategoryIds={collapsedCategoryIds}
              selectedCategoryId={selectedCategoryId}
              tabbableCategoryId={tabbableCategoryId}
              visibleCategoryIds={visibleCategoryIds}
              depth={depth + 1}
              registerCategoryButton={registerCategoryButton}
              onFocusCategory={onFocusCategory}
              onToggleExpanded={onToggleExpanded}
              onSelectCategory={onSelectCategory}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function SampleBrowser({
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
    selectedCategoryId,
    selectedTagIds,
    sortBy,
    sortDir,
    tags,
    categories,
    libraries,
    searchQuery,
    librarySyncState,
    onSearchChange,
    onSelectCategory,
    onToggleTagFilter,
    onAssignTagToSample,
    onUnassignTagFromSample
  } = browser

  const [managePanelOpen, setManagePanelOpen] = useState(false)

  const [catsWidth, setCatsWidth] = useState(152)
  const [collapsedCategoryIds, setCollapsedCategoryIds] = useState<Set<number>>(() => new Set())

  // Sample-tile context menu state (tag assignment, spec-004 AC-007)
  const [analysisEditor, setAnalysisEditor] = useState<SampleListItem | null>(null)
  const analysisAnchorRef = useRef<HTMLElement | null>(null)
  const handleSampleContextMenuOpen = useCallback((_sample: SampleListItem, anchor: HTMLButtonElement) => {
    analysisAnchorRef.current = anchor
  }, [])
  const renderSampleContextMenu = useCallback((sample: SampleListItem) => (
    <ContextMenuContent aria-label={`Sample actions for ${sample.name}`}>
      <ContextMenuItem
        onSelect={() => { window.setTimeout(() => setAnalysisEditor(sample), 0) }}
      >
        Edit BPM, key, and type
      </ContextMenuItem>
      {tags.length === 0 ? (
        <ContextMenuLabel className="context-menu-note">
          No tags yet — create one in the Manage panel.
        </ContextMenuLabel>
      ) : tags.map((tag) => {
        const assigned = sample.tagIds.includes(tag.id)
        return (
          <ContextMenuCheckboxItem
            key={tag.id}
            checked={assigned}
            textValue={tag.name}
            onCheckedChange={() => {
              if (assigned) void onUnassignTagFromSample(sample, tag.id)
              else void onAssignTagToSample(sample, tag.id)
            }}
          >
            <span
              className="tag-color-dot"
              style={tag.color ? { backgroundColor: tag.color } : undefined}
              data-empty={tag.color === null ? 'true' : undefined}
              aria-hidden="true"
            />
            {tag.name}
          </ContextMenuCheckboxItem>
        )
      })}
    </ContextMenuContent>
  ), [tags, onAssignTagToSample, onUnassignTagFromSample])

  const childrenByParent = useMemo(() => {
    const grouped = new Map<number | null, CategoryItem[]>()
    for (const category of categories) {
      const siblings = grouped.get(category.parentId) ?? []
      siblings.push(category)
      grouped.set(category.parentId, siblings)
    }
    return grouped
  }, [categories])

  const rootCategories = childrenByParent.get(null) ?? []

  const toggleCategoryExpanded = useCallback((id: number) => {
    setCollapsedCategoryIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const visibleCategoryIds = useMemo(() => {
    const visible: number[] = []
    const visit = (category: CategoryItem) => {
      visible.push(category.id)
      if (collapsedCategoryIds.has(category.id)) return
      for (const child of childrenByParent.get(category.id) ?? []) visit(child)
    }
    for (const root of childrenByParent.get(null) ?? []) visit(root)
    return visible
  }, [childrenByParent, collapsedCategoryIds])
  const [focusedCategoryId, setFocusedCategoryId] = useState<number | undefined>(selectedCategoryId)
  const categoryButtonRefs = useRef(new Map<number, HTMLButtonElement>())
  const registerCategoryButton = useCallback((id: number, node: HTMLButtonElement | null) => {
    if (node) categoryButtonRefs.current.set(id, node)
    else categoryButtonRefs.current.delete(id)
  }, [])
  const focusCategory = useCallback((id: number) => {
    setFocusedCategoryId(id)
    categoryButtonRefs.current.get(id)?.focus()
  }, [])
  const tabbableCategoryId = visibleCategoryIds.includes(focusedCategoryId ?? -1)
    ? focusedCategoryId
    : selectedCategoryId !== undefined && visibleCategoryIds.includes(selectedCategoryId)
      ? selectedCategoryId
      : visibleCategoryIds[0]

  const activeCategory = selectedCategoryId === undefined
    ? undefined
    : categories.find((category) => category.id === selectedCategoryId)
  const hasActiveFilters = searchQuery.trim().length > 0 ||
    selectedCategoryId !== undefined || selectedTagIds.length > 0
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
    emptyDescription = 'Try a different search, category, or tag.'
  } else if (librarySyncState.status === 'unavailable') {
    emptyTitle = 'Sample Folder unavailable'
    emptyDescription = 'Return to Home to restore or choose your Sample Folder.'
  } else if (librarySyncState.status === 'cancelled' && !librarySyncState.hasUsableIndex) {
    emptyTitle = 'Library sync was cancelled'
    emptyDescription = 'Use Retry library sync in the status area to continue.'
  }

  const clearFilters = useCallback(() => {
    if (searchQuery.trim()) onSearchChange('')
    if (selectedCategoryId !== undefined) onSelectCategory(undefined)
    for (const tagId of selectedTagIds) onToggleTagFilter(tagId)
  }, [onSearchChange, onSelectCategory, onToggleTagFilter, searchQuery, selectedCategoryId, selectedTagIds])

  const sortIcon = (col: typeof sortBy) => {
    if (sortBy !== col) return null
    return <span className="sort-direction" aria-hidden="true">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <section className="browser-region" aria-label="Sample Browser">
      <PanelGroup
        id="sample-browser-split"
        className="sample-browser-panels"
        orientation="horizontal"
        defaultLayout={{ categories: 24, samples: 76 }}
        onLayoutChanged={(layout) => {
          const region = document.querySelector('.browser-region')
          if (region && layout.categories !== undefined) {
            setCatsWidth(region.clientWidth * layout.categories / 100)
          }
        }}
      >
        <Panel
          id="categories"
          defaultSize="152px"
          minSize="80px"
          maxSize="400px"
          groupResizeBehavior="preserve-pixel-size"
        >
          <div className="cats">
            <div className="cats-actions">
              <Tooltip content={managePanelOpen ? 'Close manage panel' : 'Manage tags, libraries, and categories'}>
                <button
                  type="button"
                  className="cat-manage-btn"
                  aria-label={managePanelOpen ? 'Close manage panel' : 'Manage tags, libraries, and categories'}
                  aria-expanded={managePanelOpen}
                  aria-controls="sample-browser-manage-panel"
                  onClick={() => setManagePanelOpen((v) => !v)}
                >
                  {managePanelOpen ? 'Close' : 'Manage'}
                </button>
              </Tooltip>
            </div>
            <div className="category-tree" role="tree" aria-label="Sample categories">
              {rootCategories.map((category) => (
                <CategoryTreeNode
                  key={category.id}
                  category={category}
                  childrenByParent={childrenByParent}
                  collapsedCategoryIds={collapsedCategoryIds}
                  selectedCategoryId={selectedCategoryId}
                  tabbableCategoryId={tabbableCategoryId}
                  visibleCategoryIds={visibleCategoryIds}
                  depth={0}
                  registerCategoryButton={registerCategoryButton}
                  onFocusCategory={focusCategory}
                  onToggleExpanded={toggleCategoryExpanded}
                  onSelectCategory={onSelectCategory}
                />
              ))}
              {rootCategories.length === 0 && (
                <p className="category-tree-empty">No categories yet.</p>
              )}
            </div>
          </div>
        </Panel>

        <PanelResizeHandle className="browser-resize-v" aria-label="Resize category tree" />

        <Panel id="samples" minSize="240px">
          <div className="tiles-section">
            <div className="subcats-row">
              {(activeCategory || tags.length > 0) && (
                <div className="sample-filter-strip" aria-label="Sample filters">
                  {activeCategory && (
                    <button
                      type="button"
                      className="subcat subcat-active"
                      onClick={() => onSelectCategory(undefined)}
                      aria-label="Clear category filter"
                    >
                      <span>{activeCategory.name}</span>
                      <span aria-hidden="true">×</span>
                    </button>
                  )}
                  {tags.map((tag) => {
                    const active = selectedTagIds.includes(tag.id)
                    return (
                      <button
                        key={`tag-${tag.id}`}
                        type="button"
                        className={`subcat${active ? ' subcat-active' : ''}`}
                        onClick={() => onToggleTagFilter(tag.id)}
                        aria-pressed={active}
                      >
                        <span
                          className="tag-color-dot"
                          style={tag.color ? { backgroundColor: tag.color } : undefined}
                          data-empty={tag.color === null ? 'true' : undefined}
                          aria-hidden="true"
                        />
                        <span>{tag.name}</span>
                        {active && <span aria-hidden="true">×</span>}
                      </button>
                    )
                  })}
                </div>
              )}
              <div className="sample-results-controls">
                <output className="subcats-count" aria-live="polite" aria-atomic="true">
                  {totalCount.toLocaleString()} {totalCount === 1 ? 'sample' : 'samples'}
                </output>
                {totalCount > 0 && (
                  <div className="sort-row" role="group" aria-label="Sort samples">
                    {SORT_OPTIONS.map(({ column, label, accessibleLabel }) => {
                      const active = sortBy === column
                      const direction = sortDir === 'asc' ? 'ascending' : 'descending'
                      const nextDirection = sortDir === 'asc' ? 'descending' : 'ascending'
                      return (
                        <button
                          key={column}
                          type="button"
                          className={`sort-btn${active ? ' sort-btn-active' : ''}`}
                          onClick={() => browser.onSortChange(column)}
                          aria-pressed={active}
                          aria-label={active
                            ? `Sort by ${accessibleLabel}, ${direction}. Activate for ${nextDirection}.`
                            : `Sort by ${accessibleLabel}`}
                        >
                          {label}
                          {sortIcon(column)}
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
              categories={categories}
              loading={loading || preparingFirstIndex}
              loadingTitle={preparingFirstIndex ? 'Preparing your sample library' : 'Loading samples'}
              loadingDescription={preparingFirstIndex
                ? 'Samples will appear here as soon as the first sync finishes.'
                : 'Loading the current library view.'}
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
        </Panel>
      </PanelGroup>

      {managePanelOpen && (
        <ManagePanel
          tags={tags}
          libraries={libraries}
          categories={categories}
          leftOffset={catsWidth}
          onCreateTag={browser.onCreateTag}
          onRenameTag={browser.onRenameTag}
          onSetTagColor={browser.onSetTagColor}
          onDeleteTag={browser.onDeleteTag}
          onCreateCategory={browser.onCreateCategory}
          onDeleteCategory={browser.onDeleteCategory}
          onSaveLibrary={browser.onSaveLibrary}
          onDeleteLibrary={browser.onDeleteLibrary}
          onApplyLibrary={browser.onApplyLibrary}
        />
      )}

      <PopoverRoot modal open={analysisEditor !== null} onOpenChange={(open) => { if (!open) setAnalysisEditor(null) }}>
        <PopoverAnchor virtualRef={analysisAnchorRef} />
        {analysisEditor && (
          <PopoverContent aria-label={`Analysis for ${analysisEditor.name}`} align="start">
            <SampleAnalysisEditor
              sample={analysisEditor}
              onClose={() => setAnalysisEditor(null)}
              onUpdate={browser.onUpdateSampleAnalysis}
              onReanalyze={browser.onReanalyzeSample}
            />
          </PopoverContent>
        )}
      </PopoverRoot>
    </section>
  )
}
