import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { MixJamFileItem } from '../../../shared/backend-api'
import type {
  TrackerArrangementProps,
  PlayerBrowserProps,
  PlayerMixerProps,
  PlayerTransportProps
} from './playerProps'
import {
  LANE_HEAD_WIDTH_PX,
  LEFT_COL_DEFAULT_PX,
  LEFT_COL_MAX_FRACTION,
  LEFT_COL_MIN_PX,
  timelinePixelsPerSecond
} from '../lib/arrangement'
import { clamp, nearestTick } from '../lib/sample-utils'
import { BEATS_PER_BAR, TICKS_PER_BEAT } from '../engine/transport'
import { useTrackerShortcuts } from '../hooks/useTrackerShortcuts'
import { useDragResize } from '../hooks/useDragResize'
import { useDragCleanups } from '../hooks/useDragCleanups'
import { usePlacementDrag } from '../hooks/usePlacementDrag'
import MixJamBrowser from './MixJamBrowser'
import MiddleStrip from './MiddleStrip'
import SongControlsMain from './SongControlsMain'
import MixerColumn from './MixerColumn'
import SampleBrowser from './SampleBrowser'
import LaneRow from './LaneRow'
import ShortcutsOverlay from './ShortcutsOverlay'
import EffectsWorkspace from './EffectsWorkspace'
import BottomWorkspace, {
  isBottomWorkspaceTab,
  type BottomWorkspaceTab
} from './BottomWorkspace'

const LEFT_COL_STORAGE_KEY = 'mixjam-left-col-w'
const BOTTOM_WORKSPACE_STORAGE_KEY = 'mixjam:bottom-workspace-tab'

function initialBottomWorkspaceTab(): BottomWorkspaceTab {
  try {
    const stored = localStorage.getItem(BOTTOM_WORKSPACE_STORAGE_KEY)
    return isBottomWorkspaceTab(stored) ? stored : 'song'
  } catch {
    return 'song'
  }
}

export function reconcileSelectedChannelIndex(
  channels: ReadonlyArray<{ channelIndex: number }>,
  selectedChannelIndex: number | null
): number | null {
  if (selectedChannelIndex !== null && channels.some((channel) => channel.channelIndex === selectedChannelIndex)) {
    return selectedChannelIndex
  }
  if (selectedChannelIndex === null) return channels[0]?.channelIndex ?? null
  return channels.find((channel) => channel.channelIndex > selectedChannelIndex)?.channelIndex ??
    [...channels].reverse().find((channel) => channel.channelIndex < selectedChannelIndex)?.channelIndex ??
    null
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
  const clearSelection = useCallback(() => setSelectedPlacementIds(new Set()), [])

  const trackDragCleanup = useDragCleanups()

  const {
    selectionRect,
    handleLanesMouseDown: lanesMouseDown,
    handleSampleDragStart,
    handlePlacementDragStart,
    handleLaneCanvasDragOver,
    handleLaneCanvasDrop
  } = usePlacementDrag({
    lanes,
    totalTicks,
    selectedPlacementIds,
    pixelsPerTick,
    bubblePixelsPerSecond,
    onClearSelection: clearSelection,
    onPlaceSampleDetailOnLane: arrangement.onPlaceSampleDetailOnLane,
    onMovePlacement: arrangement.onMovePlacement,
    onDuplicatePlacement: arrangement.onDuplicatePlacement,
    onMovePlacementGroup: arrangement.onMovePlacementGroup,
    onDuplicatePlacementGroup: arrangement.onDuplicatePlacementGroup
  })

  const handleLanesMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const container = lanesRef.current
    const cleanup = lanesMouseDown(e, container, setSelectedPlacementIds)
    if (cleanup) trackDragCleanup(cleanup)
    if (!e.ctrlKey) {
      clearSelection()
    }
  }, [lanesMouseDown, trackDragCleanup, clearSelection])

  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [mixJamBrowserCollapsed, setMixJamBrowserCollapsed] = useState(false)
  const [bottomTab, setBottomTabState] = useState<BottomWorkspaceTab>(initialBottomWorkspaceTab)
  const [selectedChannelIndex, setSelectedChannelIndex] = useState<number | null>(null)
  const [selectedEffectId, setSelectedEffectId] = useState<string | null>(null)
  const { onSetVisualTelemetryActive } = mixer

  useEffect(() => {
    onSetVisualTelemetryActive(bottomTab === 'mixer' || bottomTab === 'fx')
  }, [bottomTab, onSetVisualTelemetryActive])

  useEffect(() => () => {
    onSetVisualTelemetryActive(false)
  }, [onSetVisualTelemetryActive])

  const setBottomTab = useCallback((tab: BottomWorkspaceTab) => {
    setBottomTabState(tab)
    try {
      localStorage.setItem(BOTTOM_WORKSPACE_STORAGE_KEY, tab)
    } catch {
      // Storage can be unavailable; the active in-memory tab still works.
    }
  }, [])

  useEffect(() => {
    const nextChannelIndex = reconcileSelectedChannelIndex(mixer.channels, selectedChannelIndex)
    if (nextChannelIndex === selectedChannelIndex) return
    setSelectedChannelIndex(nextChannelIndex)
    setSelectedEffectId(null)
  }, [mixer.channels, selectedChannelIndex])

  // Refs for values read by the global keyboard shortcut handler so the
  // listener subscribes once instead of on every selection / transport change.
  const selectedPlacementIdsRef = useRef<ReadonlySet<string>>(selectedPlacementIds)
  selectedPlacementIdsRef.current = selectedPlacementIds
  const transportStateRef = useRef(transportState)
  transportStateRef.current = transportState

  useTrackerShortcuts({
    selectedPlacementIdsRef,
    clearSelection,
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

  // Upper-work resize seam: drag the MixJam Browser edge to resize only the
  // browser/tracker split. The full-width Bottom Workspace is independent.
  const playerViewRef = useRef<HTMLDivElement>(null)

  // Clamp a left-column width to [min, viewport fraction] so a persisted or
  // dragged value can never push column 2 (and the seam itself) off-screen —
  // there is no in-app way to recover from an off-viewport seam.
  const clampLeftColWidth = useCallback((px: number): number => {
    const max = Math.max(LEFT_COL_MIN_PX, window.innerWidth * LEFT_COL_MAX_FRACTION)
    return clamp(px, LEFT_COL_MIN_PX, max)
  }, [])

  // Write the upper browser width to the shared grid's first-column variable.
  const applyLeftColWidth = useCallback((px: number): void => {
    const el = playerViewRef.current
    if (!el) return
    const width = clampLeftColWidth(px)
    el.style.setProperty('--left-col-w', `${width}px`)
  }, [clampLeftColWidth])

  // Apply the persisted width before paint. The JSX style prop must never
  // contain --left-col-w or React would clobber the imperative drag value.
  useLayoutEffect(() => {
    const stored = parseFloat(localStorage.getItem(LEFT_COL_STORAGE_KEY) ?? '')
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
        className="upper-work-resize"
        role="separator"
        aria-label="Resize MixJam Browser"
        aria-orientation="vertical"
        onMouseDown={handleLeftColResizeStart}
      />

      <BottomWorkspace
        activeTab={bottomTab}
        bpm={transport.bpm}
        masterGain={transport.masterGain}
        onTabChange={setBottomTab}
        song={(
          <SongControlsMain
            bpm={transport.bpm}
            masterGain={transport.masterGain}
            masterLevelDb={transport.masterLevelDb}
            onSetBpm={transport.onSetBpm}
            onSetMasterGain={transport.onSetMasterGain}
          />
        )}
        mixer={(
          <MixerColumn
            channels={mixer.channels}
            channelLevels={mixer.channelLevels}
            channelPeaks={mixer.channelPeaks}
            canRestoreChannel={mixer.canRestoreChannel}
            selectedChannelIndex={selectedChannelIndex}
            onSetChannelGain={mixer.onSetChannelGain}
            onSetChannelPan={mixer.onSetChannelPan}
            onToggleChannelMute={mixer.onToggleChannelMute}
            onToggleChannelSolo={mixer.onToggleChannelSolo}
            onRemoveChannel={mixer.onRemoveChannel}
            onRestoreChannel={mixer.onRestoreChannel}
            onSelectChannel={(channelIndex) => { setSelectedChannelIndex(channelIndex); setSelectedEffectId(null) }}
            onOpenChannelEffects={(channelIndex) => { setSelectedChannelIndex(channelIndex); setSelectedEffectId(null); setBottomTab('fx') }}
          />
        )}
        fx={(
          <EffectsWorkspace
            channels={mixer.channels}
            selectedChannelIndex={selectedChannelIndex}
            selectedEffectId={selectedEffectId}
            effectReductions={mixer.effectReductions}
            onSelectChannel={(channelIndex) => { setSelectedChannelIndex(channelIndex); setSelectedEffectId(null) }}
            onSelectEffect={setSelectedEffectId}
            onAdd={mixer.onAddChannelEffect}
            onUpdate={mixer.onUpdateChannelEffect}
            onToggleBypass={mixer.onToggleChannelEffectBypass}
            onRemove={mixer.onRemoveChannelEffect}
            onRestore={mixer.onRestoreChannelEffect}
            onMove={mixer.onMoveChannelEffect}
          />
        )}
        samples={(
          <SampleBrowser
            browser={browser}
            bubblePixelsPerSecond={bubblePixelsPerSecond}
            flashSamplePath={activeFlashPath}
            onSampleDragStart={handleSampleDragStart}
          />
        )}
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
