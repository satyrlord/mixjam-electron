import { useCallback, useEffect, useRef, useState } from 'react'
import type { CategoryItem, LibraryItem, RecentProjectItem, SampleListItem, ScanProgress, TagItem } from '../../../shared/ipc'
import type { FooterSampleDetail, LaneState } from '../lib/playerShell'
import { LANE_HEAD_WIDTH_PX, LANE_HEIGHT_PX } from '../lib/playerShell'
import {
  categoryColor,
  formatDuration,
  meterFillPct,
  nearestTick,
  tileWidth,
} from '../lib/sample-utils'
import ScanProgressBar from './ScanProgressBar'
import ManagePanel from './ManagePanel'

interface TrackerViewProps {
  recentProjects: RecentProjectItem[]
  samples: SampleListItem[]
  searchQuery: string
  loading: boolean
  error: string | null
  selectedSamplePath: string | null
  lanes: LaneState[]
  laneShouldDim: (lane: LaneState) => boolean
  transportState: 'stopped' | 'playing' | 'paused'
  currentTick: number
  bpm: number
  masterGain: number
  masterLevelDb: number
  totalCount: number
  onSetBpm: (bpm: number) => void
  onSetMasterGain: (value: number) => void
  onSelectSampleDetail: (detail: FooterSampleDetail) => void
  onSearchChange: (query: string) => void
  onRescan: () => void
  onPlaceSampleDetailOnLane: (detail: FooterSampleDetail, laneIndex: number, startTick: number) => void
  onMoveClipOnLane: (clipId: string, toLaneIndex: number, newStartTick: number) => void
  onRemoveClipFromLane: (laneIndex: number, clipId: string) => void
  onSetLanePan: (laneIndex: number, pan: number) => void
  onPreviewSample: (samplePath: string) => void
  onToggleLaneMute: (laneIndex: number) => void
  onToggleLaneSolo: (laneIndex: number) => void
  onTransportPlay: () => void
  onTransportPause: () => void
  onTransportStop: () => void
  onTransportSkipBack: () => void
  scanProgress: ScanProgress
  selectedCategoryId: number | undefined
  selectedTagIds: number[]
  sortBy: 'filename' | 'duration' | 'dateAdded'
  sortDir: 'asc' | 'desc'
  tags: TagItem[]
  categories: CategoryItem[]
  libraries: LibraryItem[]
  onDbSearchChange: (q: string) => void
  onSelectCategory: (id: number | undefined) => void
  onToggleTagFilter: (id: number) => void
  onSortChange: (col: 'filename' | 'duration' | 'dateAdded') => void
  onStartScan: () => void
  onCreateTag: (name: string, color?: string) => Promise<TagItem>
  onRenameTag: (id: number, name: string) => Promise<void>
  onDeleteTag: (id: number) => Promise<void>
  onCreateCategory: (name: string, parentId?: number) => Promise<CategoryItem>
  onDeleteCategory: (id: number) => Promise<void>
  onSaveLibrary: (name: string) => Promise<LibraryItem>
  onDeleteLibrary: (id: number) => Promise<void>
}



export default function TrackerView({
  recentProjects,
  samples,
  searchQuery,
  loading,
  error,
  selectedSamplePath,
  lanes,
  laneShouldDim,
  transportState,
  currentTick,
  bpm,
  masterGain,
  masterLevelDb,
  totalCount,
  onSetBpm,
  onSetMasterGain,
  onSelectSampleDetail,
  onSearchChange,
  onRescan,
  onPlaceSampleDetailOnLane,
  onMoveClipOnLane,
  onRemoveClipFromLane,
  onSetLanePan,
  onPreviewSample,
  onToggleLaneMute,
  onToggleLaneSolo,
  onTransportPlay,
  onTransportPause,
  onTransportStop,
  onTransportSkipBack,
  scanProgress,
  selectedCategoryId,
  selectedTagIds,
  sortBy,
  sortDir,
  tags,
  categories,
  libraries,
  onDbSearchChange,
  onSelectCategory,
  onToggleTagFilter,
  onSortChange,
  onStartScan,
  onCreateTag,
  onRenameTag,
  onDeleteTag,
  onCreateCategory,
  onDeleteCategory,
  onSaveLibrary,
  onDeleteLibrary,
}: TrackerViewProps) {
  const totalTicks = 256
  const isPlaying = transportState === 'playing'

  const [managePanelOpen, setManagePanelOpen] = useState(false)

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    laneIndex: number
    clipId: string
    samplePath: string
    sampleName: string
  } | null>(null)

  // Flash state for "locate in browser"
  const [flashSamplePath, setFlashSamplePath] = useState<string | null>(null)
  const flashCountRef = useRef(0)

  // Dismiss context menu on any click outside
  useEffect(() => {
    if (!contextMenu) return
    const dismiss = () => setContextMenu(null)
    window.addEventListener('click', dismiss)
    return () => window.removeEventListener('click', dismiss)
  }, [contextMenu])

  // Flash effect: flash 3 times then clear
  useEffect(() => {
    if (!flashSamplePath) return
    flashCountRef.current = 0
    const timer = setInterval(() => {
      flashCountRef.current++
      if (flashCountRef.current >= 6) {
        setFlashSamplePath(null)
        clearInterval(timer)
      } else {
        // Toggle visibility to create flash effect
        setFlashSamplePath((prev) => (prev ? null : flashSamplePath))
      }
    }, 300)
    return () => clearInterval(timer)
  }, [flashSamplePath])

  // Context menu actions
  const handleContextDelete = useCallback(() => {
    if (!contextMenu) return
    onRemoveClipFromLane(contextMenu.laneIndex, contextMenu.clipId)
    setContextMenu(null)
  }, [contextMenu, onRemoveClipFromLane])

  const handleContextLocate = useCallback(() => {
    if (!contextMenu) return
    // Search for the sample name to locate it in the browser
    onDbSearchChange(contextMenu.sampleName.replace(/\.[^.]+$/, ''))
    onSelectCategory(undefined)
    // Flash the sample
    setFlashSamplePath(contextMenu.samplePath)
    setContextMenu(null)
  }, [contextMenu, onDbSearchChange, onSelectCategory])

  const handleSampleDragStart = (event: React.DragEvent, detail: FooterSampleDetail) => {
    event.dataTransfer.setData('application/mixjam-sample', JSON.stringify(detail))
    event.dataTransfer.effectAllowed = 'copy'
  }

  const handleClipDragStart = (event: React.DragEvent, clipId: string) => {
    event.dataTransfer.setData('application/mixjam-clip', JSON.stringify({ clipId }))
    event.dataTransfer.effectAllowed = 'move'
    event.stopPropagation()
  }

  const handleLaneCanvasDragOver = (event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes('application/mixjam-sample') &&
        !event.dataTransfer.types.includes('application/mixjam-clip')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = event.dataTransfer.types.includes('application/mixjam-clip') ? 'move' : 'copy'
  }

  const handleLaneCanvasDrop = (laneIndex: number, event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const raw = event.dataTransfer.getData('application/mixjam-sample')
    if (raw) {
      try {
        const detail = JSON.parse(raw) as FooterSampleDetail
        const rect = event.currentTarget.getBoundingClientRect()
        const clickX = event.clientX - rect.left
        const tick = nearestTick(clickX, rect.width, totalTicks)
        onPlaceSampleDetailOnLane(detail, laneIndex, tick)
      } catch { /* malformed drag data */ }
      return
    }
    // Intra-player clip move
    const clipRaw = event.dataTransfer.getData('application/mixjam-clip')
    if (clipRaw) {
      try {
        const { clipId } = JSON.parse(clipRaw) as { clipId: string }
        const rect = event.currentTarget.getBoundingClientRect()
        const clickX = event.clientX - rect.left
        const tick = nearestTick(clickX, rect.width, totalTicks)
        onMoveClipOnLane(clipId, laneIndex, tick)
      } catch { /* malformed drag data */ }
    }
  }

  const rootCategories = categories.filter((c) => c.parentId === null)
  const childCategories = (parentId: number) => categories.filter((c) => c.parentId === parentId)

  const subcatChips: CategoryItem[] = selectedCategoryId !== undefined
    ? childCategories(selectedCategoryId)
    : []

  // Compute the active category color for sample bubbles
  const activeCategoryColor = selectedCategoryId !== undefined
    ? categoryColor(
        categories.find((c) => c.id === selectedCategoryId)?.name ?? ''
      )
    : undefined

  // Browser/tracker split: fraction of remaining space given to the browser
  // region.  1 = equal split with the tracker region.
  const [browserFlex, setBrowserFlex] = useState(1)

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startFlex = browserFlex
    const onMove = (moveEvent: MouseEvent) => {
      const deltaY = startY - moveEvent.clientY
      // Convert pixel delta to flex ratio (heuristic: ~600px = 1fr unit)
      const newFlex = Math.max(0.3, Math.min(3, startFlex + deltaY / 600))
      setBrowserFlex(newFlex)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [browserFlex])

  const sortIcon = (col: typeof sortBy) => {
    if (sortBy !== col) return null
    return <span aria-hidden="true">{sortDir === 'asc' ? '▲' : '▼'}</span>
  }

  const resultCount = totalCount

  return (
    <div
      className="tracker-view"
      style={{
        gridTemplateRows: `minmax(0, 1fr) 44px 6px minmax(0, ${browserFlex}fr)`
      }}
    >
      <aside className="tracker-zone recent-projects-rail">
        <h2 className="tracker-zone-title">Recent Projects</h2>
        {recentProjects.length === 0 ? (
          <p className="recent-projects-empty">
            No MixJam projects yet. Save the current project or open an existing .mixjam file to
            populate this rail.
          </p>
        ) : (
          <ol className="recent-projects-list">
            {recentProjects.map((project) => (
              <li key={project.path} className="recent-projects-item">
                <span className="recent-projects-name">{project.displayName}</span>
                <span className="recent-projects-path">{project.path}</span>
              </li>
            ))}
          </ol>
        )}
      </aside>

      <section className="tracker-zone tracker-region">
        {transportState !== 'stopped' && currentTick < totalTicks && (
          <div
            className="tracker-playhead"
            style={{
              left: `calc(${LANE_HEAD_WIDTH_PX}px + (${currentTick} / ${totalTicks}) * (100% - ${LANE_HEAD_WIDTH_PX}px))`,
            }}
            aria-hidden="true"
          />
        )}
        <div className="tracker-ruler">
          <div className="tracker-ruler-spacer" />
          {Array.from({ length: totalTicks / 32 }, (_, i) => (
            <div key={i} className="tracker-ruler-tick">
              {i % 4 === 0 ? <span className="tracker-ruler-bar">{i + 1}</span> : null}
            </div>
          ))}
        </div>
        <div className="tracker-lanes">
          {lanes.map((lane) => {
            const tickWidth = `calc(100% / ${totalTicks})`
            const dimmed = laneShouldDim(lane)
            return (
              <div
                key={lane.index}
                className={`tracker-lane${dimmed ? ' tracker-lane-dimmed' : ''}`}
                style={{ height: LANE_HEIGHT_PX }}
              >
                <div className="tracker-lane-head" style={{ width: LANE_HEAD_WIDTH_PX }}>
                  <span className="tracker-lane-name">{lane.name}</span>
                  <div className="tracker-lane-controls">
                    <button
                      type="button"
                      className={`tracker-lane-mute${lane.muted ? ' tracker-lane-mute-active' : ''}`}
                      aria-label={`Mute ${lane.name}`}
                      onClick={() => onToggleLaneMute(lane.index)}
                    >M</button>
                    <button
                      type="button"
                      className={`tracker-lane-solo${lane.solo ? ' tracker-lane-solo-active' : ''}`}
                      aria-label={`Solo ${lane.name}`}
                      onClick={() => onToggleLaneSolo(lane.index)}
                    >S</button>
                    <span
                      className="tracker-lane-pan"
                      role="slider"
                      aria-label={`Pan ${lane.name}`}
                      aria-valuemin={-100}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(lane.pan * 100)}
                      style={{ '--pan-angle': `${lane.pan * 135}deg` } as React.CSSProperties}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        const startX = e.clientX
                        const startPan = lane.pan
                        const onMove = (moveEvent: MouseEvent) => {
                          const delta = (moveEvent.clientX - startX) * 0.01
                          onSetLanePan(lane.index, Math.max(-1, Math.min(1, startPan + delta)))
                        }
                        const onUp = () => {
                          window.removeEventListener('mousemove', onMove)
                          window.removeEventListener('mouseup', onUp)
                        }
                        window.addEventListener('mousemove', onMove)
                        window.addEventListener('mouseup', onUp)
                      }}
                    />
                  </div>
                </div>
                <div
                  className="tracker-lane-canvas"
                  onDragOver={handleLaneCanvasDragOver}
                  onDrop={(event) => handleLaneCanvasDrop(lane.index, event)}
                  role="region"
                  aria-label={`Lane ${lane.index + 1} track area`}
                >
                  {lane.clips.map((clip) => {
                    return (
                    <div
                      key={clip.id}
                      className={`tracker-lane-clip sample-bubble${flashSamplePath === clip.samplePath ? ' tracker-lane-clip-flash' : ''}`}
                      style={{
                        left: `calc(${clip.startTick} * ${tickWidth})`,
                        width: `${tileWidth(clip.durationSeconds)}px`,
                        ...(clip.color ? { background: clip.color, borderColor: clip.color } : {}),
                      }}
                      title={clip.sampleName}
                      draggable
                      onDragStart={(e) => handleClipDragStart(e, clip.id)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setContextMenu({
                          x: e.clientX,
                          y: e.clientY,
                          laneIndex: lane.index,
                          clipId: clip.id,
                          samplePath: clip.samplePath,
                          sampleName: clip.sampleName
                        })
                      }}
                    >
                      <span className="tracker-lane-clip-label">{clip.sampleName}</span>
                    </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="middle-strip">
        <div className="strip-left">
          <span className="strip-proj">Untitled</span>
          <span className="strip-sep" />
          <span className="strip-bpm">{bpm} BPM</span>
        </div>
        <div className="strip-center">
          <button type="button" className="transport-button" aria-label="Skip Back" onClick={onTransportSkipBack}>
            <span aria-hidden="true">&#9198;</span>
          </button>
          <button
            type="button"
            className={`transport-button${isPlaying ? ' transport-button-play' : ''}`}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            onClick={isPlaying ? onTransportPause : onTransportPlay}
          >
            <span aria-hidden="true">{isPlaying ? '⏸' : '▶'}</span>
          </button>
          <button type="button" className="transport-button" aria-label="Stop" onClick={onTransportStop}>
            <span aria-hidden="true">&#9209;</span>
          </button>
        </div>
        <div className="strip-right">
          <ScanProgressBar progress={scanProgress} />
          <input
            type="search"
            className="strip-search"
            placeholder="Search samples…"
            aria-label="Search samples"
            value={searchQuery}
            onChange={(e) => {
              onSearchChange(e.currentTarget.value)
              onDbSearchChange(e.currentTarget.value)
            }}
          />
          <button
            type="button"
            className="strip-rescan"
            onClick={() => { onRescan(); void onStartScan() }}
            disabled={scanProgress.status === 'scanning'}
            aria-label={scanProgress.status === 'scanning' ? 'Scanning…' : 'Re-scan'}
          >
            {scanProgress.status === 'scanning' ? 'Scanning…' : 'Re-scan'}
          </button>
        </div>
      </section>

      <div
        className="browser-resize-h"
        role="separator"
        aria-label="Resize sample browser"
        aria-orientation="horizontal"
        onMouseDown={handleResizeStart}
      />

      <aside className="tracker-zone song-controls-rail">
        <h2 className="tracker-zone-title">Song Controls</h2>
        <label className="song-control">
          <span>Master Volume</span>
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(masterGain * 100)}
            aria-label="Master Volume"
            onChange={(e) => onSetMasterGain(Number(e.currentTarget.value) / 100)}
          />
        </label>
        <div className="song-control">
          <span>dB Loudness</span>
          <div
            className="loudness-meter"
            role="meter"
            aria-label="Master loudness"
            aria-valuemin={-100}
            aria-valuemax={0}
            aria-valuenow={Math.round(masterLevelDb)}
          >
            <div
              className="loudness-meter-fill"
              style={{ width: `${meterFillPct(masterLevelDb)}%` }}
            />
          </div>
        </div>
        <label className="song-control">
          <span>BPM</span>
          <input
            type="range"
            min="50"
            max="200"
            value={bpm}
            aria-label="BPM"
            onChange={(e) => onSetBpm(Number(e.currentTarget.value))}
          />
        </label>
      </aside>

      <section className="browser-region" aria-label="Sample Browser">
        <div className="cats">
          <button
            type="button"
            className="cat-manage-btn"
            aria-label="Manage tags and libraries"
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
                  style={{ background: color, borderColor: color } as React.CSSProperties}
                  onClick={() => onSelectCategory(isSelected ? undefined : cat.id)}
                >
                  {cat.name}
                </button>
              )
            })}
          </div>
        </div>

        <div className="tiles-section">
          <div className="subcats-row">
            {selectedCategoryId !== undefined && (
              <button
                type="button"
                className="subcat subcat-clear"
                onClick={() => onSelectCategory(undefined)}
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
                onClick={() => onSelectCategory(selectedCategoryId === sub.id ? undefined : sub.id)}
              >
                {sub.name}
              </button>
            ))}
            {tags.filter((t) => selectedTagIds.includes(t.id)).map((tag) => (
              <button
                key={tag.id}
                type="button"
                className="subcat subcat-tag subcat-active"
                onClick={() => onToggleTagFilter(tag.id)}
                aria-pressed={true}
              >
                {tag.name} ×
              </button>
            ))}
            <span className="subcats-count">
              {resultCount > 0 ? `${resultCount} samples` : ''}
            </span>
            {totalCount > 0 && (
              <span className="sort-row">
                {(['filename', 'duration', 'dateAdded'] as const).map((col) => (
                  <button
                    key={col}
                    type="button"
                    className={`sort-btn${sortBy === col ? ' sort-btn-active' : ''}`}
                    onClick={() => onSortChange(col)}
                    aria-sort={sortBy === col ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    {col === 'filename' ? 'Name' : col === 'duration' ? 'Dur' : 'Date'}
                    {sortIcon(col)}
                  </button>
                ))}
              </span>
            )}
          </div>

          <div className="tiles">
            {samples.map((sample) => {
              const width = tileWidth(sample.durationSeconds)
              const isSelected = selectedSamplePath === sample.filepath
              // Compute the sample's own category colour for drag-to-tracker.
              // When a category filter is active all visible samples share that
              // colour; when unfiltered each sample uses its real category.
              const sampleColor = activeCategoryColor
                ?? (sample.categoryId !== null
                  ? (() => {
                      const cat = categories.find((c) => c.id === sample.categoryId)
                      return cat ? categoryColor(cat.name) : undefined
                    })()
                  : undefined)
              return (
                <button
                  key={sample.id}
                  type="button"
                  className={`sample-bubble${isSelected ? ' selected' : ''}${flashSamplePath === sample.filepath ? ' clip-flash' : ''}`}
                  style={{ width: `${width}px`, ...(sampleColor ? { background: sampleColor, borderColor: sampleColor } : {}) } as React.CSSProperties}
                  draggable
                  onDragStart={(e) => handleSampleDragStart(e, {
                    name: sample.name,
                    filepath: sample.filepath,
                    tags: sample.tags,
                    duration: sample.durationSeconds,
                    color: sampleColor,
                  })}
                  onClick={() => {
                    onSelectSampleDetail({
                      name: sample.name,
                      filepath: sample.filepath,
                      tags: sample.tags,
                      duration: sample.durationSeconds,
                    })
                    onPreviewSample(sample.filepath)
                  }}
                >
                  <b>{sample.name.replace(/\.[^.]+$/, '')}</b>
                  <i>{formatDuration(sample.durationSeconds)}</i>
                </button>
              )
            })}
            {!loading && samples.length === 0 && (
              <p className="tiles-empty">
                {error ?? 'No samples found. Choose a Sample Folder and Re-scan.'}
              </p>
            )}
          </div>
        </div>

        {managePanelOpen && (
          <ManagePanel
            tags={tags}
            libraries={libraries}
            categories={categories}
            onCreateTag={onCreateTag}
            onRenameTag={onRenameTag}
            onDeleteTag={onDeleteTag}
            onCreateCategory={onCreateCategory}
            onDeleteCategory={onDeleteCategory}
            onSaveLibrary={onSaveLibrary}
            onDeleteLibrary={onDeleteLibrary}
          />
        )}
      </section>

      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
        >
          <button
            type="button"
            className="context-menu-item"
            role="menuitem"
            onClick={handleContextDelete}
          >
            Delete
          </button>
          <button
            type="button"
            className="context-menu-item"
            role="menuitem"
            onClick={handleContextLocate}
          >
            Locate in Browser
          </button>
        </div>
      )}
    </div>
  )
}
