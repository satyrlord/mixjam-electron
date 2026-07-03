import { useCallback, useEffect, useRef, useState } from 'react'
import type { CategoryItem, SampleListItem } from '../../../shared/backend-api'
import type { FooterSampleDetail } from '../lib/playerShell'
import { bubbleStyle, categoryColor } from '../lib/sample-utils'
import type { TrackerBrowserProps } from './trackerProps'
import ManagePanel from './ManagePanel'
import SampleTileGrid from './SampleTileGrid'

interface SampleBrowserProps {
  browser: TrackerBrowserProps
  bpm: number
  /** Tracker lane scale, so browser tiles match tracker bubbles pixel-for-pixel. */
  pixelsPerTick: number
  flashSamplePath: string | null
  onSampleDragStart: (event: React.DragEvent, detail: FooterSampleDetail) => void
}

export default function SampleBrowser({
  browser,
  bpm,
  pixelsPerTick,
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
    libraries
  } = browser

  const [managePanelOpen, setManagePanelOpen] = useState(false)

  // Browser internal vertical resize: category-tree width in px.
  const [catsWidth, setCatsWidth] = useState(152)

  // Tears down the splitter's window listeners if the browser unmounts
  // mid-drag (e.g. the user navigates Home while still holding the button).
  const dragCleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => () => dragCleanupRef.current?.(), [])

  const handleCatsResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = catsWidth
    const onMove = (moveEvent: MouseEvent) => {
      const newWidth = startWidth + (moveEvent.clientX - startX)
      setCatsWidth(Math.max(80, Math.min(400, newWidth)))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      dragCleanupRef.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    dragCleanupRef.current = onUp
  }, [catsWidth])

  // Sample-tile context menu state (tag assignment, spec-004 AC-007)
  const [sampleMenu, setSampleMenu] = useState<{
    x: number
    y: number
    sample: SampleListItem
  } | null>(null)

  const handleSampleContextMenu = useCallback((sample: SampleListItem, e: React.MouseEvent) => {
    e.preventDefault()
    setSampleMenu({ x: e.clientX, y: e.clientY, sample })
  }, [])

  // Dismiss the context menu on any click outside
  useEffect(() => {
    if (!sampleMenu) return
    const dismiss = () => setSampleMenu(null)
    window.addEventListener('click', dismiss)
    return () => window.removeEventListener('click', dismiss)
  }, [sampleMenu])

  const rootCategories = categories.filter((c) => c.parentId === null)
  const childCategories = (parentId: number): CategoryItem[] =>
    categories.filter((c) => c.parentId === parentId)

  const subcatChips: CategoryItem[] = selectedCategoryId !== undefined
    ? childCategories(selectedCategoryId)
    : []

  const activeCategoryColor = selectedCategoryId !== undefined
    ? categoryColor(
        categories.find((c) => c.id === selectedCategoryId)?.name ?? ''
      )
    : undefined

  const sortIcon = (col: typeof sortBy) => {
    if (sortBy !== col) return null
    return <span aria-hidden="true">{sortDir === 'asc' ? '▲' : '▼'}</span>
  }

  return (
    <section className="browser-region" aria-label="Sample Browser">
      <div className="cats" style={{ width: catsWidth }}>
        <button
          type="button"
          className="cat-manage-btn"
          aria-label={managePanelOpen ? 'Close manage panel' : 'Manage tags, libraries, and categories'}
          title={managePanelOpen ? 'Close manage panel' : 'Manage tags, libraries, and categories'}
          onClick={() => setManagePanelOpen((v) => !v)}
        >
          {managePanelOpen ? '×' : '+'}
        </button>
        <div className="cat-grid" role="listbox" aria-label="Sample categories">
          {rootCategories.map((cat) => {
            const color = categoryColor(cat.name)
            const isSelected = selectedCategoryId === cat.id
            return (
              <button
                key={cat.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`sample-bubble bubble-category${isSelected ? ' selected' : ''}`}
                style={bubbleStyle(color)}
                onClick={() => browser.onSelectCategory(isSelected ? undefined : cat.id)}
              >
                {cat.name}
              </button>
            )
          })}
        </div>
      </div>

      <div
        className="browser-resize-v"
        role="separator"
        aria-label="Resize category tree"
        aria-orientation="vertical"
        onMouseDown={handleCatsResizeStart}
      />

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
                title={active ? `Stop filtering by ${tag.name}` : `Filter by ${tag.name}`}
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
          samples={samples}
          bpm={bpm}
          pixelsPerTick={pixelsPerTick}
          selectedSamplePath={selectedSamplePath}
          flashSamplePath={flashSamplePath}
          activeCategoryColor={activeCategoryColor}
          categories={categories}
          loading={loading}
          error={error}
          hasMore={hasMoreSamples}
          onLoadMore={browser.onLoadMoreSamples}
          onSelectSampleDetail={browser.onSelectSampleDetail}
          onPreviewSample={browser.onPreviewSample}
          onSampleDragStart={onSampleDragStart}
          onSampleContextMenu={handleSampleContextMenu}
        />
      </div>

      {managePanelOpen && (
        <ManagePanel
          tags={tags}
          libraries={libraries}
          categories={categories}
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

      {sampleMenu && (
        <div
          className="context-menu"
          style={{ left: sampleMenu.x, top: sampleMenu.y }}
          role="menu"
          aria-label={`Tags for ${sampleMenu.sample.name}`}
        >
          {tags.length === 0 ? (
            <span className="context-menu-note">No tags yet — create one in the Manage panel.</span>
          ) : (
            tags.map((tag) => {
              const assigned = sampleMenu.sample.tagIds.includes(tag.id)
              return (
                <button
                  key={tag.id}
                  type="button"
                  className="context-menu-item"
                  role="menuitemcheckbox"
                  aria-checked={assigned}
                  onClick={() => {
                    if (assigned) void browser.onUnassignTagFromSample(sampleMenu.sample, tag.id)
                    else void browser.onAssignTagToSample(sampleMenu.sample, tag.id)
                    setSampleMenu(null)
                  }}
                >
                  {assigned ? `Untag: ${tag.name}` : `Tag: ${tag.name}`}
                </button>
              )
            })
          )}
        </div>
      )}
    </section>
  )
}
