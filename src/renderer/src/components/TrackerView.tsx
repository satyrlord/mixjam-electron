import { useCallback, useEffect, useRef, useState } from 'react'
import type { CategoryItem, LibraryItem, RecentProjectItem, SampleListItem, ScanProgress, TagItem } from '../../../shared/ipc'
import type { ClipGroupEntry, FooterSampleDetail, LaneState } from '../lib/playerShell'
import {
  LANE_HEAD_WIDTH_PX,
  LANE_HEIGHT_PX,
  RULER_HEIGHT_PX,
  clamp,
  clipScreenRect,
} from '../lib/playerShell'
import {
  bubbleStyle,
  categoryColor,
  meterFillPct,
  nearestTick,
} from '../lib/sample-utils'
import { useTrackerShortcuts } from '../hooks/useTrackerShortcuts'
import { useBpmEditor } from '../hooks/useBpmEditor'
import ScanProgressBar from './ScanProgressBar'
import ManagePanel from './ManagePanel'
import LaneClipCanvas from './LaneClipCanvas'
import SampleTileGrid from './SampleTileGrid'
import ShortcutsOverlay from './ShortcutsOverlay'

// Transport and edit glyphs as inline SVGs: emoji codepoints render through a
// color emoji font on Windows and ignore the theme's currentColor.
const TRANSPORT_ICON_PATHS: Record<'skip-back' | 'play' | 'pause' | 'stop' | 'undo', string> = {
  'skip-back': 'M3 2.5h2v11H3zM13.5 2.5v11L6 8z',
  play: 'M4.5 2.5v11L13 8z',
  pause: 'M4 2.5h3v11H4zM9 2.5h3v11H9z',
  stop: 'M3.5 3.5h9v9h-9z',
  undo: 'M7.5 1.5 2 6l5.5 4.5V7.75h1.75a2.87 2.87 0 0 1 0 5.75H6.5v2h2.75a4.88 4.88 0 0 0 0-9.75H7.5V1.5z'
}

function TransportIcon({ shape, mirrored = false }: {
  shape: keyof typeof TRANSPORT_ICON_PATHS
  mirrored?: boolean
}) {
  return (
    <svg className="transport-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d={TRANSPORT_ICON_PATHS[shape]}
        {...(mirrored ? { transform: 'scale(-1 1) translate(-16 0)' } : {})}
      />
    </svg>
  )
}

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
  onDuplicateClipOnLane: (clipId: string, toLaneIndex: number, newStartTick: number) => void
  onMoveClipGroup: (moves: ClipGroupEntry[]) => void
  onDuplicateClipGroup: (sources: ClipGroupEntry[]) => void
  onRemoveClipFromLane: (laneIndex: number, clipId: string) => void
  onRemoveClips: (clipIds: string[]) => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  projectName: string | null
  onOpenRecentProject: (project: RecentProjectItem) => void
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
  onDuplicateClipOnLane,
  onMoveClipGroup,
  onDuplicateClipGroup,
  onRemoveClipFromLane,
  onRemoveClips,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  projectName,
  onOpenRecentProject,
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
  const ticksPerBeat = 8
  const ticksPerBar = 32
  const beatsPerBar = ticksPerBar / ticksPerBeat
  const rulerBeatCount = totalTicks / ticksPerBeat
  const isPlaying = transportState === 'playing'

  const [managePanelOpen, setManagePanelOpen] = useState(false)

  const {
    editingBpm,
    bpmDraft,
    bpmInputRef,
    setBpmDraft,
    handleBpmEditStart,
    handleBpmEditCommit,
    handleBpmEditKeyDown
  } = useBpmEditor({ bpm, onSetBpm })

  // Lane content width measurement for consistent bubble widths
  const lanesRef = useRef<HTMLDivElement>(null)
  const [laneContentWidth, setLaneContentWidth] = useState(0)

  useEffect(() => {
    const el = lanesRef.current
    if (!el) return
    const measure = () => setLaneContentWidth(el.clientWidth - LANE_HEAD_WIDTH_PX)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const pixelsPerTick = laneContentWidth > 0 ? laneContentWidth / totalTicks : 0

  const [selectedClipIds, setSelectedClipIds] = useState<Set<string>>(new Set())
  const [selectionRect, setSelectionRect] = useState<{
    startX: number; startY: number; currentX: number; currentY: number
  } | null>(null)
  // Tracks the mousemove/mouseup listeners for an in-progress rectangle-select
  // drag so they can be torn down if TrackerView unmounts mid-drag (e.g. the
  // user navigates Home while still holding the mouse button).
  const dragCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => dragCleanupRef.current?.()
  }, [])

  const handleLanesMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!e.ctrlKey) {
      setSelectedClipIds(new Set())
      return
    }
    const container = lanesRef.current
    if (!container) return
    // Capture geometry once at drag start — the container doesn't resize or
    // reposition mid-drag, so re-measuring on every mousemove is wasted work.
    // Also capture scroll offsets so the rendered selection-rect and the
    // hit-testing stay correct if the lanes list is scrolled mid-drag.
    const rect = container.getBoundingClientRect()
    const localX = e.clientX - rect.left
    const localY = e.clientY - rect.top
    if (localX < LANE_HEAD_WIDTH_PX || localY < RULER_HEIGHT_PX) return

    e.preventDefault()
    const startX = localX + container.scrollLeft
    const startY = localY + container.scrollTop
    setSelectionRect({ startX, startY, currentX: startX, currentY: startY })
    setSelectedClipIds(new Set())

    const onMove = (moveEvent: MouseEvent) => {
      const cx = moveEvent.clientX - rect.left + container.scrollLeft
      const cy = moveEvent.clientY - rect.top + container.scrollTop
      setSelectionRect((prev) => prev ? { ...prev, currentX: cx, currentY: cy } : null)

      const x1 = Math.min(startX, cx) - LANE_HEAD_WIDTH_PX
      const x2 = Math.max(startX, cx) - LANE_HEAD_WIDTH_PX
      const y1 = Math.min(startY, cy) - RULER_HEIGHT_PX
      const y2 = Math.max(startY, cy) - RULER_HEIGHT_PX

      const minLane = Math.max(0, Math.floor(y1 / LANE_HEIGHT_PX))
      const maxLane = Math.min(lanes.length - 1, Math.floor(y2 / LANE_HEIGHT_PX))

      const ids = new Set<string>()
      for (let li = minLane; li <= maxLane; li++) {
        const lane = lanes[li]
        if (!lane) continue
        for (const clip of lane.clips) {
          const { x: clipX, width: clipW } = clipScreenRect(clip, pixelsPerTick)
          if (clipX + clipW > x1 && clipX < x2) {
            ids.add(clip.id)
          }
        }
      }
      setSelectedClipIds(ids)
    }

    const onUp = () => {
      setSelectionRect(null)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      dragCleanupRef.current = null
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    dragCleanupRef.current = onUp
  }, [lanes, pixelsPerTick])

  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  // Refs for values read by the global keyboard shortcut handler so the
  // listener subscribes once instead of on every selection / transport change.
  const selectedClipIdsRef = useRef<ReadonlySet<string>>(selectedClipIds)
  selectedClipIdsRef.current = selectedClipIds
  const transportStateRef = useRef(transportState)
  transportStateRef.current = transportState

  useTrackerShortcuts({
    selectedClipIdsRef,
    clearSelection: () => setSelectedClipIds(new Set()),
    transportStateRef,
    onRemoveClips,
    onUndo,
    onRedo,
    onTransportPlay,
    onTransportPause,
    onOpenShortcuts: () => setShortcutsOpen(true)
  })

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    laneIndex: number
    clipId: string
    samplePath: string
    sampleName: string
  } | null>(null)

  // Recent-projects context menu state
  const [recentMenu, setRecentMenu] = useState<{
    x: number
    y: number
    project: RecentProjectItem
  } | null>(null)

  // Flash state for "locate in browser"
  const [flashSamplePath, setFlashSamplePath] = useState<string | null>(null)
  const flashCountRef = useRef(0)

  // Dismiss context menus on any click outside
  useEffect(() => {
    if (!contextMenu && !recentMenu) return
    const dismiss = () => {
      setContextMenu(null)
      setRecentMenu(null)
    }
    window.addEventListener('click', dismiss)
    return () => window.removeEventListener('click', dismiss)
  }, [contextMenu, recentMenu])

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
    if (selectedClipIds.size > 1 && selectedClipIds.has(clipId)) {
      let anchorLaneIndex = 0
      let anchorStartTick = 0
      for (const lane of lanes) {
        const clip = lane.clips.find((c) => c.id === clipId)
        if (clip) { anchorLaneIndex = lane.index; anchorStartTick = clip.startTick; break }
      }
      const group: Array<{ clipId: string; tickOffset: number; laneOffset: number }> = []
      for (const lane of lanes) {
        for (const clip of lane.clips) {
          if (selectedClipIds.has(clip.id)) {
            group.push({
              clipId: clip.id,
              tickOffset: clip.startTick - anchorStartTick,
              laneOffset: lane.index - anchorLaneIndex
            })
          }
        }
      }
      event.dataTransfer.setData('application/mixjam-clip', JSON.stringify({ clipId, group }))
    } else {
      event.dataTransfer.setData('application/mixjam-clip', JSON.stringify({ clipId }))
    }
    // Must permit 'copy' too: the dragover handler sets dropEffect='copy' when
    // Shift is held (duplicate), and Chromium cancels the drop entirely if
    // dropEffect is outside effectAllowed.
    event.dataTransfer.effectAllowed = 'copyMove'
    event.stopPropagation()
  }

  const handleLaneCanvasDragOver = (event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes('application/mixjam-sample') &&
        !event.dataTransfer.types.includes('application/mixjam-clip')) return
    event.preventDefault()
    if (event.dataTransfer.types.includes('application/mixjam-clip')) {
      event.dataTransfer.dropEffect = event.shiftKey ? 'copy' : 'move'
    } else {
      event.dataTransfer.dropEffect = 'copy'
    }
  }

  const handleLaneCanvasDrop = (laneIndex: number, event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    // Default: snap to beat (8 ticks). Hold Alt for freeform (per-tick).
    const snap = event.altKey ? 1 : ticksPerBeat
    const raw = event.dataTransfer.getData('application/mixjam-sample')
    if (raw) {
      try {
        const detail = JSON.parse(raw) as FooterSampleDetail
        const rect = event.currentTarget.getBoundingClientRect()
        const clickX = event.clientX - rect.left
        const tick = nearestTick(clickX, rect.width, totalTicks, snap)
        onPlaceSampleDetailOnLane(detail, laneIndex, tick)
      } catch { /* malformed drag data */ }
      return
    }
    // Intra-player clip move or duplicate
    const clipRaw = event.dataTransfer.getData('application/mixjam-clip')
    if (clipRaw) {
      try {
        const parsed = JSON.parse(clipRaw) as {
          clipId: string
          group?: Array<{ clipId: string; tickOffset: number; laneOffset: number }>
        }
        const rect = event.currentTarget.getBoundingClientRect()
        const clickX = event.clientX - rect.left
        const anchorTick = nearestTick(clickX, rect.width, totalTicks, snap)

        if (parsed.group && parsed.group.length > 1) {
          const entries: ClipGroupEntry[] = parsed.group.map((g) => ({
            clipId: g.clipId,
            toLaneIndex: clamp(laneIndex + g.laneOffset, 0, lanes.length - 1),
            newStartTick: clamp(anchorTick + g.tickOffset, 0, totalTicks - 1)
          }))
          const applyGroup = event.shiftKey ? onDuplicateClipGroup : onMoveClipGroup
          applyGroup(entries)
          setSelectedClipIds(new Set())
        } else {
          const applySingle = event.shiftKey ? onDuplicateClipOnLane : onMoveClipOnLane
          applySingle(parsed.clipId, laneIndex, anchorTick)
          setSelectedClipIds(new Set())
        }
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

  // Browser internal vertical resize: category-tree width in px.
  const [catsWidth, setCatsWidth] = useState(152)

  const handleBrowserResizeVStart = useCallback((e: React.MouseEvent) => {
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
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [catsWidth])

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
                <button
                  type="button"
                  className="recent-projects-open"
                  title={`Open ${project.displayName}`}
                  onClick={() => onOpenRecentProject(project)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setRecentMenu({ x: e.clientX, y: e.clientY, project })
                  }}
                >
                  <span className="recent-projects-name">{project.displayName}</span>
                  <span className="recent-projects-path">{project.path}</span>
                </button>
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
        <div className="tracker-lanes" ref={lanesRef} onMouseDown={handleLanesMouseDown}>
          {selectionRect && (() => {
            const x = Math.min(selectionRect.startX, selectionRect.currentX)
            const y = Math.min(selectionRect.startY, selectionRect.currentY)
            const w = Math.abs(selectionRect.currentX - selectionRect.startX)
            const h = Math.abs(selectionRect.currentY - selectionRect.startY)
            return <div className="selection-rect" style={{ left: x, top: y, width: w, height: h }} />
          })()}
          <div className="tracker-ruler">
            <div className="tracker-ruler-spacer" />
            {Array.from({ length: rulerBeatCount }, (_, i) => {
              const isBar = i % beatsPerBar === 0
              const barNumber = i / beatsPerBar + 1
              return (
                <div key={i} className={`tracker-ruler-tick${isBar ? ' tracker-ruler-tick-bar' : ''}`}>
                  {isBar && barNumber % 4 === 1 ? <span className="tracker-ruler-bar">{barNumber}</span> : null}
                </div>
              )
            })}
          </div>
          {lanes.map((lane) => {
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
                      title={lane.muted ? 'Unmute lane' : 'Mute lane'}
                      onClick={() => onToggleLaneMute(lane.index)}
                    >M</button>
                    <button
                      type="button"
                      className={`tracker-lane-solo${lane.solo ? ' tracker-lane-solo-active' : ''}`}
                      aria-label={`Solo ${lane.name}`}
                      title={lane.solo ? 'Unsolo lane' : 'Solo lane'}
                      onClick={() => onToggleLaneSolo(lane.index)}
                    >S</button>
                    <span
                      className="tracker-lane-pan"
                      role="slider"
                      aria-label={`Pan ${lane.name}`}
                      title="Drag horizontally to pan"
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
                  <LaneClipCanvas
                    clips={lane.clips}
                    totalTicks={totalTicks}
                    laneIndex={lane.index}
                    flashSamplePath={flashSamplePath}
                    selectedClipIds={selectedClipIds}
                    onClipDragStart={(clipId, e) => handleClipDragStart(e, clipId)}
                    onClipContextMenu={setContextMenu}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="middle-strip">
        <div className="strip-left">
          <span className="strip-proj">{projectName ?? 'Untitled'}</span>
          <span className="strip-sep" />
          {editingBpm ? (
            <input
              ref={bpmInputRef}
              type="number"
              className="strip-bpm-input"
              min={50}
              max={200}
              value={bpmDraft}
              onChange={(e) => setBpmDraft(e.currentTarget.value)}
              onBlur={handleBpmEditCommit}
              onKeyDown={handleBpmEditKeyDown}
              aria-label="Edit BPM"
            />
          ) : (
            <button
              type="button"
              className="strip-bpm"
              onClick={handleBpmEditStart}
              aria-label="Edit BPM"
              title="Click to edit BPM (50-200), Enter commits, Esc cancels"
            >
              {bpm} BPM
            </button>
          )}
        </div>
        <div className="strip-center">
          <button type="button" className="transport-button" aria-label="Skip Back" title="Skip back to start" onClick={onTransportSkipBack}>
            <TransportIcon shape="skip-back" />
          </button>
          <button
            type="button"
            className={`transport-button${isPlaying ? ' transport-button-play' : ''}`}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            onClick={isPlaying ? onTransportPause : onTransportPlay}
          >
            <TransportIcon shape={isPlaying ? 'pause' : 'play'} />
          </button>
          <button type="button" className="transport-button" aria-label="Stop" title="Stop" onClick={onTransportStop}>
            <TransportIcon shape="stop" />
          </button>
          <span className="strip-sep" />
          <button
            type="button"
            className="transport-button"
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
            disabled={!canUndo}
            onClick={onUndo}
          >
            <TransportIcon shape="undo" />
          </button>
          <button
            type="button"
            className="transport-button"
            aria-label="Redo"
            title="Redo (Ctrl+Y)"
            disabled={!canRedo}
            onClick={onRedo}
          >
            <TransportIcon shape="undo" mirrored />
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
            title="Re-scan the Sample Folder into the library"
          >
            {scanProgress.status === 'scanning' ? 'Scanning…' : 'Re-scan'}
          </button>
          <button
            type="button"
            className="strip-help"
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
            onClick={() => setShortcutsOpen(true)}
          >
            ?
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
          <span className="song-control-head">
            Master Volume
            <span className="song-control-value">{Math.round(masterGain * 100)}%</span>
          </span>
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
      </aside>

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
                  onClick={() => onSelectCategory(isSelected ? undefined : cat.id)}
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
          onMouseDown={handleBrowserResizeVStart}
        />

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
            onSelectSampleDetail={onSelectSampleDetail}
            onPreviewSample={onPreviewSample}
            onSampleDragStart={handleSampleDragStart}
          />
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

      {recentMenu && (
        <div
          className="context-menu"
          style={{ left: recentMenu.x, top: recentMenu.y }}
          role="menu"
        >
          <button
            type="button"
            className="context-menu-item"
            role="menuitem"
            onClick={() => {
              onOpenRecentProject(recentMenu.project)
              setRecentMenu(null)
            }}
          >
            Open
          </button>
          <button
            type="button"
            className="context-menu-item"
            role="menuitem"
            onClick={() => {
              void navigator.clipboard?.writeText(recentMenu.project.path).catch(() => {
                // Clipboard access denied — nothing sensible to do.
              })
              setRecentMenu(null)
            }}
          >
            Copy Path
          </button>
        </div>
      )}

      {shortcutsOpen && <ShortcutsOverlay onClose={() => setShortcutsOpen(false)} />}
    </div>
  )
}
