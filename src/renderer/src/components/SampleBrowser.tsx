import { useCallback, useRef, useState } from 'react'
import type { CategoryItem, SampleListItem } from '../../../shared/backend-api'
import {
  DEFAULT_SAMPLE_BUBBLE_PIXELS_PER_SECOND,
  type FooterSampleDetail
} from '../lib/arrangement'
import { bubbleStyle, categorySlot } from '../lib/sample-utils'
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
    onAssignTagToSample,
    onUnassignTagFromSample
  } = browser

  const [managePanelOpen, setManagePanelOpen] = useState(false)

  const [catsWidth, setCatsWidth] = useState(152)

  // Sample-tile context menu state (tag assignment, spec-004 AC-007)
  const [analysisEditor, setAnalysisEditor] = useState<SampleListItem | null>(null)
  const analysisAnchorRef = useRef<HTMLElement | null>(null)
  const handleSampleContextMenuOpen = useCallback((_sample: SampleListItem, anchor: HTMLButtonElement) => {
    analysisAnchorRef.current = anchor
  }, [])
  const renderSampleContextMenu = useCallback((sample: SampleListItem) => (
    <ContextMenuContent aria-label={`Tags for ${sample.name}`}>
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
            {tag.name}
          </ContextMenuCheckboxItem>
        )
      })}
    </ContextMenuContent>
  ), [tags, onAssignTagToSample, onUnassignTagFromSample])

  const rootCategories = categories.filter((c) => c.parentId === null)
  const childCategories = (parentId: number): CategoryItem[] =>
    categories.filter((c) => c.parentId === parentId)

  const subcatChips: CategoryItem[] = selectedCategoryId !== undefined
    ? childCategories(selectedCategoryId)
    : []

  const activeCategorySlot = selectedCategoryId !== undefined
    ? categorySlot(
        categories.find((c) => c.id === selectedCategoryId)?.name ?? ''
      )
    : undefined

  const sortIcon = (col: typeof sortBy) => {
    if (sortBy !== col) return null
    return <span aria-hidden="true">{sortDir === 'asc' ? '▲' : '▼'}</span>
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
            <Tooltip content={managePanelOpen ? 'Close manage panel' : 'Manage tags, libraries, and categories'}>
              <button
                type="button"
                className="cat-manage-btn"
                aria-label={managePanelOpen ? 'Close manage panel' : 'Manage tags, libraries, and categories'}
                onClick={() => setManagePanelOpen((v) => !v)}
              >
                {managePanelOpen ? '× Close' : '+ Manage'}
              </button>
            </Tooltip>
        <div className="cat-grid" role="listbox" aria-label="Sample categories">
          {rootCategories.map((cat) => {
            const isSelected = selectedCategoryId === cat.id
            return (
              <button
                key={cat.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                className="sample-bubble-hit-target sample-bubble-category-target"
                onClick={() => browser.onSelectCategory(isSelected ? undefined : cat.id)}
              >
                <span
                  className={`sample-bubble bubble-category${isSelected ? ' selected' : ''}`}
                  style={bubbleStyle(categorySlot(cat.name)) as React.CSSProperties}
                >
                  {cat.name}
                </span>
              </button>
            )
          })}
            </div>
          </div>
        </Panel>

        <PanelResizeHandle className="browser-resize-v" aria-label="Resize category tree" />

        <Panel id="samples" minSize="240px">
          <div className="tiles-section">
        <div className="subcats-row">
          {selectedCategoryId !== undefined && (
            <button
              type="button"
              className="subcat subcat-clear"
              onClick={() => browser.onSelectCategory(undefined)}
              aria-label="Clear category filter"
            >
              All
            </button>
          )}
          {subcatChips.map((sub) => (
            <button
              key={sub.id}
              type="button"
              className={`subcat${selectedCategoryId === sub.id ? ' subcat-active' : ''}`}
              onClick={() => browser.onSelectCategory(selectedCategoryId === sub.id ? undefined : sub.id)}
            >
              {sub.name}
            </button>
          ))}
          {tags.map((tag) => {
            const active = selectedTagIds.includes(tag.id)
            return (
              <button
                key={`tag-${tag.id}`}
                type="button"
                className={`subcat subcat-tag${active ? ' subcat-active' : ''}`}
                onClick={() => browser.onToggleTagFilter(tag.id)}
                aria-pressed={active}
              >
                {active ? `${tag.name} ×` : tag.name}
              </button>
            )
          })}
          <span className="subcats-count">
            {totalCount > 0 ? `${totalCount} samples` : ''}
          </span>
          {totalCount > 0 && (
            <span className="sort-row">
              {(['filename', 'duration', 'dateAdded'] as const).map((col) => (
                <button
                  key={col}
                  type="button"
                  className={`sort-btn${sortBy === col ? ' sort-btn-active' : ''}`}
                  onClick={() => browser.onSortChange(col)}
                  aria-sort={sortBy === col ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  {col === 'filename' ? 'Name' : col === 'duration' ? 'Dur' : 'Date'}
                  {sortIcon(col)}
                </button>
              ))}
            </span>
          )}
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
          activeCategorySlot={activeCategorySlot}
          categories={categories}
          loading={loading}
          error={error}
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
