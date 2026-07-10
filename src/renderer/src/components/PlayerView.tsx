import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { MixJamFileItem } from '../../../shared/backend-api'
import type { PlacementGroupEntry, FooterSampleDetail } from '../lib/arrangement'
import type {
  TrackerArrangementProps,
  PlayerBrowserProps,
  PlayerMixerProps,
  PlayerTransportProps
} from './playerProps'
import {
  LANE_HEAD_WIDTH_PX,
  LANE_HEIGHT_PX,
  LEFT_COL_DEFAULT_PX,
  LEFT_COL_MAX_FRACTION,
  LEFT_COL_MIN_PX,
  LEFT_COL_MIXER_THRESHOLD_PX,
  RULER_HEIGHT_PX,
  sampleBubbleScreenRect,
  timelinePixelsPerSecond
} from '../lib/arrangement'
import { clamp, nearestTick } from '../lib/sample-utils'
import { safeJsonParse } from '../lib/safeJsonParse'
import { BEATS_PER_BAR, TICKS_PER_BEAT } from '../engine/transport'
import { useTrackerShortcuts } from '../hooks/useTrackerShortcuts'
import { useDragResize } from '../hooks/useDragResize'
import MixJamBrowser from './MixJamBrowser'
import MiddleStrip from './MiddleStrip'
import SongControlsRail from './SongControlsRail'
import SampleBrowser from './SampleBrowser'
import LaneRow from './LaneRow'
import ShortcutsOverlay from './ShortcutsOverlay'

const LEFT_COL_STORAGE_KEY = 'mixjam-left-col-w'

interface PlacementDragPayload {
  placementId: string
  group?: Array<{ placementId: string; tickOffset: number; laneOffset: number }>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFooterSampleDetail(value: unknown): value is FooterSampleDetail {
  if (!isRecord(value)) return false
  return typeof value.name === 'string' &&
    typeof value.relpath === 'string' &&
    Array.isArray(value.tags) &&
    (value.duration === null || typeof value.duration === 'number') &&
    (value.slot === undefined || typeof value.slot === 'number')
}

function isPlacementDragPayload(value: unknown): value is PlacementDragPayload {
  if (!isRecord(value) || typeof value.placementId !== 'string') return false
  if (value.group === undefined) return true
  return Array.isArray(value.group) && value.group.every((entry) =>
    isRecord(entry) &&
    typeof entry.placementId === 'string' &&
    typeof entry.tickOffset === 'number' &&
    typeof entry.laneOffset === 'number'
  )
}

export interface PlayerViewProps {
  mixJamFiles: MixJamFileItem[]
  browser: PlayerBrowserProps
  arrangement: TrackerArrangementProps
  transport: PlayerTransportProps
  mixer: PlayerMixerProps
}

export default function PlayerView({
  mixJamFiles,
  browser,
  arrangement,
  transport,
  mixer
}: PlayerViewProps) {
  const { lanes, laneShouldDim, currentTick } = arrangement
  const { transportState, onTransportSeek } = transport

  const totalTicks = 256
  const rulerBeatCount = totalTicks / TICKS_PER_BEAT

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
  const bubblePixelsPerSecond = timelinePixelsPerSecond(
    laneContentWidth,
    totalTicks,
    transport.bpm
  )
  const lastGridTick = Math.floor((totalTicks - 1) / TICKS_PER_BEAT) * TICKS_PER_BEAT

  const handleRulerClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const contentWidth = rect.width - LANE_HEAD_WIDTH_PX
    const clickX = event.clientX - rect.left - LANE_HEAD_WIDTH_PX
    if (clickX < 0 || clickX > contentWidth) return
    onTransportSeek(nearestTick(clickX, contentWidth, totalTicks, TICKS_PER_BEAT))
  }, [onTransportSeek])

  const handleRulerKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    let nextTick: number
    switch (event.key) {
      case 'ArrowLeft':
        nextTick = Math.max(0, Math.ceil(currentTick / TICKS_PER_BEAT - 1) * TICKS_PER_BEAT)
        break
      case 'ArrowRight':
        nextTick = Math.min(lastGridTick, Math.floor(currentTick / TICKS_PER_BEAT + 1) * TICKS_PER_BEAT)
        break
      case 'Home':
        nextTick = 0
        break
      case 'End':
        nextTick = lastGridTick
        break
      default:
        return
    }
    event.preventDefault()
    onTransportSeek(nextTick)
  }, [currentTick, lastGridTick, onTransportSeek])

  const [selectedPlacementIds, setSelectedPlacementIds] = useState<Set<string>>(new Set())
  const [selectionRect, setSelectionRect] = useState<{
    startX: number; startY: number; currentX: number; currentY: number
  } | null>(null)
  // Tracks the window mousemove/mouseup listeners of every in-progress drag
  // (rectangle select, splitter, pan knobs) so they are torn down if
  // PlayerView unmounts mid-drag (e.g. the user navigates Home while still
  // holding the mouse button).
  const dragCleanupsRef = useRef<Set<() => void>>(new Set())

  const trackDragCleanup = useCallback((cleanup: () => void) => {
    dragCleanupsRef.current.add(cleanup)
    return () => dragCleanupsRef.current.delete(cleanup)
  }, [])

  useEffect(() => {
    const cleanups = dragCleanupsRef.current
    return () => {
      for (const cleanup of [...cleanups]) cleanup()
      cleanups.clear()
    }
  }, [])

  const handleLanesMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!e.ctrlKey) {
      setSelectedPlacementIds(new Set())
      return
    }
    const container = lanesRef.current
    if (!container) return
    // Capture geometry once at drag start — re-measuring on every mousemove is
    // wasted work, and scroll offsets keep hit-testing correct if the list scrolls.
    const rect = container.getBoundingClientRect()
    const localX = e.clientX - rect.left
    const localY = e.clientY - rect.top
    if (localX < LANE_HEAD_WIDTH_PX || localY < RULER_HEIGHT_PX) return

    e.preventDefault()
    const startX = localX + container.scrollLeft
    const startY = localY + container.scrollTop
    setSelectionRect({ startX, startY, currentX: startX, currentY: startY })
    setSelectedPlacementIds(new Set())

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
        for (const placement of lane.placements) {
          const { x: bubbleX, width: bubbleWidth } = sampleBubbleScreenRect(
            placement,
            pixelsPerTick,
            bubblePixelsPerSecond
          )
          if (bubbleX + bubbleWidth > x1 && bubbleX < x2) {
            ids.add(placement.id)
          }
        }
      }
      setSelectedPlacementIds(ids)
    }

    const onUp = () => {
      setSelectionRect(null)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      untrack()
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    const untrack = trackDragCleanup(onUp)
  }, [lanes, pixelsPerTick, bubblePixelsPerSecond, trackDragCleanup])

  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [mixJamBrowserCollapsed, setMixJamBrowserCollapsed] = useState(false)

  // Refs for values read by the global keyboard shortcut handler so the
  // listener subscribes once instead of on every selection / transport change.
  const selectedPlacementIdsRef = useRef<ReadonlySet<string>>(selectedPlacementIds)
  selectedPlacementIdsRef.current = selectedPlacementIds
  const transportStateRef = useRef(transportState)
  transportStateRef.current = transportState

  useTrackerShortcuts({
    selectedPlacementIdsRef,
    clearSelection: () => setSelectedPlacementIds(new Set()),
    transportStateRef,
    onRemovePlacements: arrangement.onRemovePlacements,
    onUndo: transport.onUndo,
    onRedo: transport.onRedo,
    onTransportPlay: transport.onTransportPlay,
    onTransportPause: transport.onTransportPause,
    onTransportStop: transport.onTransportStop,
    onOpenShortcuts: () => setShortcutsOpen(true)
  })

  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    laneIndex: number
    placementId: string
    samplePath: string
    sampleName: string
  } | null>(null)

  // Flash state for "locate in browser": the target path stays put for the
  // whole animation while a visibility flag blinks, so the effect below never
  // re-runs (and kills its own interval) mid-flash.
  const [flashSamplePath, setFlashSamplePath] = useState<string | null>(null)
  const [flashVisible, setFlashVisible] = useState(false)
  const activeFlashPath = flashVisible ? flashSamplePath : null

  // Dismiss the placement context menu on any click outside
  useEffect(() => {
    if (!contextMenu) return
    const dismiss = () => setContextMenu(null)
    window.addEventListener('click', dismiss)
    return () => window.removeEventListener('click', dismiss)
  }, [contextMenu])

  // Flash effect: blink the highlight 3 times (6 visibility toggles) then clear.
  useEffect(() => {
    if (!flashSamplePath) return
    setFlashVisible(true)
    let toggles = 0
    const timer = setInterval(() => {
      toggles++
      if (toggles >= 6) {
        clearInterval(timer)
        setFlashVisible(false)
        setFlashSamplePath(null)
      } else {
        setFlashVisible((v) => !v)
      }
    }, 300)
    return () => clearInterval(timer)
  }, [flashSamplePath])

  const handleContextDelete = useCallback(() => {
    if (!contextMenu) return
    arrangement.onRemovePlacementFromLane(contextMenu.laneIndex, contextMenu.placementId)
    setContextMenu(null)
  }, [contextMenu, arrangement])

  const handleContextLocate = useCallback(() => {
    if (!contextMenu) return
    browser.onSearchChange(contextMenu.sampleName.replace(/\.[^.]+$/, ''))
    browser.onSelectCategory(undefined)
    setFlashSamplePath(contextMenu.samplePath)
    setContextMenu(null)
  }, [contextMenu, browser])

  const handleSampleDragStart = useCallback((event: React.DragEvent, detail: FooterSampleDetail) => {
    event.dataTransfer.setData('application/mixjam-sample', JSON.stringify(detail))
    event.dataTransfer.effectAllowed = 'copy'
  }, [])

  const handlePlacementDragStart = useCallback((placementId: string, event: React.DragEvent) => {
    if (selectedPlacementIds.size > 1 && selectedPlacementIds.has(placementId)) {
      let anchorLaneIndex = 0
      let anchorStartTick = 0
      for (const lane of lanes) {
        const placement = lane.placements.find((c) => c.id === placementId)
        if (placement) { anchorLaneIndex = lane.index; anchorStartTick = placement.startTick; break }
      }
      const group: Array<{ placementId: string; tickOffset: number; laneOffset: number }> = []
      for (const lane of lanes) {
        for (const placement of lane.placements) {
          if (selectedPlacementIds.has(placement.id)) {
            group.push({
              placementId: placement.id,
              tickOffset: placement.startTick - anchorStartTick,
              laneOffset: lane.index - anchorLaneIndex
            })
          }
        }
      }
      event.dataTransfer.setData('application/mixjam-clip-placement', JSON.stringify({ placementId, group }))
    } else {
      event.dataTransfer.setData('application/mixjam-clip-placement', JSON.stringify({ placementId }))
    }
    // Must permit 'copy' too: the dragover handler sets dropEffect='copy' when
    // Shift is held (duplicate), and Chromium cancels the drop entirely if
    // dropEffect is outside effectAllowed.
    event.dataTransfer.effectAllowed = 'copyMove'
    event.stopPropagation()
  }, [selectedPlacementIds, lanes])

  const handleLaneCanvasDragOver = useCallback((event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes('application/mixjam-sample') &&
        !event.dataTransfer.types.includes('application/mixjam-clip-placement')) return
    event.preventDefault()
    if (event.dataTransfer.types.includes('application/mixjam-clip-placement')) {
      event.dataTransfer.dropEffect = event.shiftKey ? 'copy' : 'move'
    } else {
      event.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const handleLaneCanvasDrop = useCallback((laneIndex: number, event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    // Default: snap to beat. Hold Alt for freeform (per-tick).
    const snap = event.altKey ? 1 : TICKS_PER_BEAT
    const raw = event.dataTransfer.getData('application/mixjam-sample')
    if (raw) {
      const detail = safeJsonParse(raw, null, isFooterSampleDetail)
      if (detail) {
        const rect = event.currentTarget.getBoundingClientRect()
        const clickX = event.clientX - rect.left
        const tick = nearestTick(clickX, rect.width, totalTicks, snap)
        arrangement.onPlaceSampleDetailOnLane(detail, laneIndex, tick)
      }
      return
    }
    // Intra-player placement move or duplicate
    const placementRaw = event.dataTransfer.getData('application/mixjam-clip-placement')
    if (placementRaw) {
      const parsed = safeJsonParse(placementRaw, null, isPlacementDragPayload)
      if (parsed) {
        const rect = event.currentTarget.getBoundingClientRect()
        const clickX = event.clientX - rect.left
        const anchorTick = nearestTick(clickX, rect.width, totalTicks, snap)

        if (parsed.group && parsed.group.length > 1) {
          const entries: PlacementGroupEntry[] = parsed.group.map((g) => ({
            placementId: g.placementId,
            toLaneIndex: clamp(laneIndex + g.laneOffset, 0, lanes.length - 1),
            newStartTick: clamp(anchorTick + g.tickOffset, 0, totalTicks - 1)
          }))
          const applyGroup = event.shiftKey
            ? arrangement.onDuplicatePlacementGroup
            : arrangement.onMovePlacementGroup
          applyGroup(entries)
          setSelectedPlacementIds(new Set())
        } else {
          const applySingle = event.shiftKey
            ? arrangement.onDuplicatePlacement
            : arrangement.onMovePlacement
          applySingle(parsed.placementId, laneIndex, anchorTick)
          setSelectedPlacementIds(new Set())
        }
      }
    }
  }, [lanes.length, totalTicks, arrangement])

  // Browser/tracker split: fraction of remaining space given to the browser
  // region.  1 = equal split with the tracker region.
  const [browserFlex, setBrowserFlex] = useState(1)

  const handleResizeStart = useDragResize(
    useCallback(() => browserFlex, [browserFlex]),
    useCallback((_dx, dy, startFlex) => {
      // Convert pixel delta to flex ratio (heuristic: ~600px = 1fr unit)
      const newFlex = Math.max(0.3, Math.min(3, startFlex - dy / 600))
      setBrowserFlex(newFlex)
    }, [])
  )

  // Left-column resize seam: drag the right edge of column 1 to resize it.
  // The mixer column shows when width exceeds 272px (168px + 104px); the
  // 420px default keeps it visible on first entry. The 168px drag minimum
  // still lets users narrow the column below the mixer threshold, which is
  // how the mixer is hidden. The dragged width persists so a hidden mixer
  // stays hidden across reloads.
  const playerViewRef = useRef<HTMLDivElement>(null)

  // Clamp a left-column width to [min, viewport fraction] so a persisted or
  // dragged value can never push column 2 (and the seam itself) off-screen —
  // there is no in-app way to recover from an off-viewport seam.
  const clampLeftColWidth = useCallback((px: number): number => {
    const max = Math.max(LEFT_COL_MIN_PX, window.innerWidth * LEFT_COL_MAX_FRACTION)
    return clamp(px, LEFT_COL_MIN_PX, max)
  }, [])

  // Write the width to the CSS var and mark the mixer hidden below the reveal
  // threshold. The `mixer-hidden` class makes the clipped mixer inert (CSS)
  // so keyboard focus can't land on off-screen strips and force-scroll the
  // rail past the master section.
  const applyLeftColWidth = useCallback((px: number): void => {
    const el = playerViewRef.current
    if (!el) return
    const width = clampLeftColWidth(px)
    el.style.setProperty('--left-col-w', `${width}px`)
    el.classList.toggle('mixer-hidden', width < LEFT_COL_MIXER_THRESHOLD_PX)
  }, [clampLeftColWidth])

  // Apply the persisted width imperatively before paint (useLayoutEffect, not
  // useEffect) so a hidden mixer never flashes at the wider CSS default on
  // tracker entry. The JSX style prop must never contain --left-col-w or
  // React's style diffing would clobber the imperative drag value.
  useLayoutEffect(() => {
    const stored = parseFloat(localStorage.getItem(LEFT_COL_STORAGE_KEY) ?? '')
    // Apply the stored width, or sync the hidden-class for the CSS default.
    applyLeftColWidth(
      Number.isFinite(stored) && stored >= LEFT_COL_MIN_PX ? stored : LEFT_COL_DEFAULT_PX
    )
  }, [applyLeftColWidth])

  const handleLeftColResizeStart = useDragResize(
    useCallback(() => {
      const el = playerViewRef.current
      return el
        ? parseFloat(getComputedStyle(el).getPropertyValue('--left-col-w')) ||
            LEFT_COL_DEFAULT_PX
        : LEFT_COL_DEFAULT_PX
    }, []),
    useCallback((dx, _dy, initialPx) => {
      applyLeftColWidth(initialPx + dx)
    }, [applyLeftColWidth]),
    useCallback(() => {
      // Inline style, not computed: it holds the value the drag just wrote.
      const width = parseFloat(
        playerViewRef.current?.style.getPropertyValue('--left-col-w') ?? ''
      )
      if (Number.isFinite(width)) {
        try {
          localStorage.setItem(LEFT_COL_STORAGE_KEY, String(width))
        } catch {
          // Storage full or unavailable — non-critical.
        }
      }
    }, [])
  )

  return (
    <div
      ref={playerViewRef}
      className={`player-view${mixJamBrowserCollapsed ? ' mixjam-browser-collapsed' : ''}`}
      style={{
        gridTemplateRows: `minmax(0, 1fr) 44px 6px minmax(0, ${browserFlex}fr)`
      }}
    >
      <MixJamBrowser
        mixJamFiles={mixJamFiles}
        onCollapsedChange={setMixJamBrowserCollapsed}
      />

      <section className="tracker-zone tracker-region">
        {currentTick < totalTicks && (
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
          <div
            className="tracker-ruler"
            role="slider"
            tabIndex={0}
            aria-label="Tracker timeline"
            aria-valuemin={0}
            aria-valuemax={lastGridTick}
            aria-valuenow={Math.min(currentTick, lastGridTick)}
            onClick={handleRulerClick}
            onKeyDown={handleRulerKeyDown}
          >
            <div className="tracker-ruler-spacer" />
            {Array.from({ length: rulerBeatCount }, (_, i) => {
              const isBar = i % BEATS_PER_BAR === 0
              const barNumber = i / BEATS_PER_BAR + 1
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
              <LaneRow
                key={lane.index}
                lane={lane}
                dimmed={dimmed}
                totalTicks={totalTicks}
                bubblePixelsPerSecond={bubblePixelsPerSecond}
                flashSamplePath={activeFlashPath}
                selectedPlacementIds={selectedPlacementIds}
                missingSamplePaths={arrangement.missingSamplePaths}
                onToggleLaneMute={arrangement.onToggleLaneMute}
                onToggleLaneSolo={arrangement.onToggleLaneSolo}
                onSetLanePan={arrangement.onSetLanePan}
                onSetLaneNativeBpm={arrangement.onSetLaneNativeBpm}
                onPlacementDragStart={handlePlacementDragStart}
                onPlacementContextMenu={setContextMenu}
                onDragOver={handleLaneCanvasDragOver}
                onDrop={handleLaneCanvasDrop}
                trackDragCleanup={trackDragCleanup}
              />
            )
          })}
        </div>
      </section>

      <MiddleStrip
        transportState={transportState}
        canUndo={transport.canUndo}
        canRedo={transport.canRedo}
        onUndo={transport.onUndo}
        onRedo={transport.onRedo}
        onTransportPlay={transport.onTransportPlay}
        onTransportPause={transport.onTransportPause}
        onTransportStop={transport.onTransportStop}
        onTransportSkipBack={transport.onTransportSkipBack}
        searchQuery={browser.searchQuery}
        onSearchChange={browser.onSearchChange}
        scanProgress={browser.scanProgress}
        analysisProgress={browser.analysisProgress}
        onStartScan={browser.onStartScan}
        onCancelScan={browser.onCancelScan}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      />

      <div
        className="browser-resize-h"
        role="separator"
        aria-label="Resize sample browser"
        aria-orientation="horizontal"
        onMouseDown={handleResizeStart}
      />

      <SongControlsRail
        bpm={transport.bpm}
        masterGain={transport.masterGain}
        masterLevelDb={transport.masterLevelDb}
        onSetBpm={transport.onSetBpm}
        onSetMasterGain={transport.onSetMasterGain}
        mixerChannels={mixer.channels}
        mixerChannelLevels={mixer.channelLevels}
        mixerChannelPeaks={mixer.channelPeaks}
        canRestoreChannel={mixer.canRestoreChannel}
        onSetChannelGain={mixer.onSetChannelGain}
        onSetChannelPan={mixer.onSetChannelPan}
        onToggleChannelMute={mixer.onToggleChannelMute}
        onToggleChannelSolo={mixer.onToggleChannelSolo}
        onRemoveChannel={mixer.onRemoveChannel}
        onRestoreChannel={mixer.onRestoreChannel}
      />

      <div
        className="left-col-resize-seam"
        role="separator"
        aria-label="Resize left column"
        aria-orientation="vertical"
        onMouseDown={handleLeftColResizeStart}
      />

      <SampleBrowser
        browser={browser}
        bubblePixelsPerSecond={bubblePixelsPerSecond}
        flashSamplePath={activeFlashPath}
        onSampleDragStart={handleSampleDragStart}
      />

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

      {shortcutsOpen && <ShortcutsOverlay onClose={() => setShortcutsOpen(false)} />}
    </div>
  )
}
