import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MixJamFileItem } from '../../../shared/backend-api'
import type {
  TrackerArrangementProps,
  PlayerBrowserProps,
  PlayerMixerProps,
  PlayerProjectProps,
  PlayerTransportProps
} from './playerProps'
import {
  LANE_HEAD_WIDTH_PX,
  LEFT_COL_MIN_PX,
  TRACKER_BAR_COUNT,
  TRACKER_TIMELINE_MIN_WIDTH_PX,
  TRACKER_TOTAL_TICKS,
  timelinePixelsPerSecond
} from '../lib/arrangement'
import { TICKS_PER_BEAT } from '../engine/transport'
import { isEditableTarget, useTrackerShortcuts } from '../hooks/useTrackerShortcuts'
import { useDragCleanups } from '../hooks/useDragCleanups'
import { usePlacementDrag } from '../hooks/usePlacementDrag'
import MixJamBrowser from './MixJamBrowser'
import MiddleStrip from './MiddleStrip'
import SongControlsMain from './SongControlsMain'
import MixerColumn from './MixerColumn'
import SampleBrowser from './SampleBrowser'
import LaneRow from './LaneRow'
import SongProgressBar from './SongProgressBar'
import ShortcutsOverlay from './ShortcutsOverlay'
import EffectsWorkspace from './EffectsWorkspace'
import BottomWorkspace, {
  isBottomWorkspaceTab,
  type BottomWorkspaceTab
} from './BottomWorkspace'
import { ContextMenuContent, ContextMenuItem, ContextMenuRoot, ContextMenuTrigger } from './ui/ContextMenu'
import { Panel, PanelGroup, PanelResizeHandle, usePanelRef, type PanelLayout } from './ui/ResizablePanels'
import { SliderRoot, SliderThumb, SliderTrack } from './ui/Slider'

const TRACKER_SCROLLPORT_ID = 'tracker-song-scrollport'

const LEFT_COL_STORAGE_KEY = 'mixjam-left-col-w'
const UPPER_LAYOUT_STORAGE_KEY = 'mixjam:upper-work-layout'
const BOTTOM_LAYOUT_STORAGE_KEY = 'mixjam:bottom-workspace-layout'
const BOTTOM_EXPANSION_STORAGE_KEY = 'mixjam:bottom-workspace-expansion'
const BOTTOM_WORKSPACE_STORAGE_KEY = 'mixjam:bottom-workspace-tab'
const DEFAULT_BOTTOM_WORKSPACE_SIZE_PERCENT = 36
const BOTTOM_WORKSPACE_EXPANDED_PERCENT = 60
const BOTTOM_WORKSPACE_CUE_MINIMUM_PERCENT = 50

interface BottomWorkspaceExpansionState {
  expanded: boolean
  previousBottomSize: number
}

function initialBottomWorkspaceTab(): BottomWorkspaceTab {
  try {
    const stored = localStorage.getItem(BOTTOM_WORKSPACE_STORAGE_KEY)
    return isBottomWorkspaceTab(stored) ? stored : 'song'
  } catch {
    return 'song'
  }
}

function loadPanelLayout(key: string, fallback: PanelLayout): PanelLayout {
  try {
    const stored = localStorage.getItem(key)
    if (!stored) return fallback
    const parsed = JSON.parse(stored) as unknown
    if (!parsed || typeof parsed !== 'object') return fallback
    const entries = Object.entries(parsed)
    if (entries.length !== Object.keys(fallback).length) return fallback
    if (entries.some(([, value]) => typeof value !== 'number' || !Number.isFinite(value))) return fallback
    return Object.fromEntries(entries) as PanelLayout
  } catch {
    return fallback
  }
}

function savePanelLayout(key: string, layout: PanelLayout): void {
  try {
    localStorage.setItem(key, JSON.stringify(layout))
  } catch {
    // Storage can be unavailable; the current layout still remains usable.
  }
}

function loadBottomWorkspaceExpansionState(fallbackSize: number): BottomWorkspaceExpansionState {
  const fallback = { expanded: false, previousBottomSize: fallbackSize }
  try {
    const stored = localStorage.getItem(BOTTOM_EXPANSION_STORAGE_KEY)
    if (!stored) return fallback
    const parsed = JSON.parse(stored) as Partial<BottomWorkspaceExpansionState>
    if (typeof parsed.expanded !== 'boolean' ||
      typeof parsed.previousBottomSize !== 'number' ||
      !Number.isFinite(parsed.previousBottomSize) ||
      parsed.previousBottomSize <= 0 || parsed.previousBottomSize > 100) return fallback
    return { expanded: parsed.expanded, previousBottomSize: parsed.previousBottomSize }
  } catch {
    return fallback
  }
}

function saveBottomWorkspaceExpansionState(state: BottomWorkspaceExpansionState): void {
  try {
    localStorage.setItem(BOTTOM_EXPANSION_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage can be unavailable; the current in-memory state still works.
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
  project: PlayerProjectProps
}

export default function PlayerView({
  mixJamFiles,
  browser,
  arrangement,
  transport,
  mixer,
  project
}: PlayerViewProps) {
  const { lanes, laneShouldDim, currentTick } = arrangement
  const { transportState, onTransportSeek } = transport
  const hasPlacedSamples = lanes.some((lane) => lane.placements.length > 0)

  const totalTicks = TRACKER_TOTAL_TICKS

  // Lane content width measurement for consistent bubble widths
  const lanesRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const [laneContentWidth, setLaneContentWidth] = useState(0)

  useEffect(() => {
    const el = timelineRef.current
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
  const sampleDurationTicksByPath = useMemo(() => {
    const result = new Map<string, number>()
    for (const lane of lanes) {
      for (const placement of lane.placements) {
        if (!result.has(placement.samplePath)) {
          result.set(placement.samplePath, placement.durationTicks)
        }
      }
    }
    return result
  }, [lanes])

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
    bpm: transport.bpm,
    sampleDurationTicksByPath,
    selectedPlacementIds,
    pixelsPerTick,
    onClearSelection: clearSelection,
    onPlaceSampleDetailOnLane: arrangement.onPlaceSampleDetailOnLane,
    onMovePlacement: arrangement.onMovePlacement,
    onDuplicatePlacement: arrangement.onDuplicatePlacement,
    onMovePlacementGroup: arrangement.onMovePlacementGroup,
    onDuplicatePlacementGroup: arrangement.onDuplicatePlacementGroup
  })

  const scrollTrackerToTick = useCallback((tick: number) => {
    const scrollport = lanesRef.current
    if (!scrollport) return
    const maximumScroll = Math.max(0, scrollport.scrollWidth - scrollport.clientWidth)
    const timelineWidth = Math.max(0, scrollport.scrollWidth - LANE_HEAD_WIDTH_PX)
    const boundedTick = Math.max(0, Math.min(totalTicks, tick))
    const targetX = LANE_HEAD_WIDTH_PX + (boundedTick / totalTicks) * timelineWidth
    const nextScrollLeft = boundedTick === 0
      ? 0
      : Math.max(0, Math.min(maximumScroll, targetX - scrollport.clientWidth + 8))
    scrollport.scrollLeft = nextScrollLeft
  }, [totalTicks])

  const handleTransportStop = useCallback(() => {
    transport.onTransportStop()
    scrollTrackerToTick(0)
  }, [scrollTrackerToTick, transport])

  const handleTransportSkipBack = useCallback(() => {
    transport.onTransportSkipBack()
    scrollTrackerToTick(0)
  }, [scrollTrackerToTick, transport])

  const handleTransportJumpToEnd = useCallback(() => {
    transport.onTransportJumpToEnd()
    scrollTrackerToTick(transport.songEndTick)
  }, [scrollTrackerToTick, transport])

  const previousTransportStateRef = useRef(transportState)
  useEffect(() => {
    const previousState = previousTransportStateRef.current
    if ((previousState === 'playing' || previousState === 'preparing') &&
        transportState === 'stopped' && currentTick === 0) {
      scrollTrackerToTick(0)
    }
    previousTransportStateRef.current = transportState
  }, [currentTick, scrollTrackerToTick, transportState])

  const previousSongEndTickRef = useRef(transport.songEndTick)
  useEffect(() => {
    const previousEndTick = previousSongEndTickRef.current
    if (transport.songEndTick < previousEndTick &&
        currentTick > transport.songEndTick &&
        transportState !== 'playing' && transportState !== 'preparing') {
      scrollTrackerToTick(transport.songEndTick)
    }
    previousSongEndTickRef.current = transport.songEndTick
  }, [currentTick, scrollTrackerToTick, transport.songEndTick, transportState])

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
  const browserPanelRef = usePanelRef()
  const [upperDefaultLayout] = useState<PanelLayout>(() => {
    const fallbackBrowserPercent = (() => {
      try {
        const legacyWidth = Number(localStorage.getItem(LEFT_COL_STORAGE_KEY))
        if (Number.isFinite(legacyWidth) && legacyWidth >= LEFT_COL_MIN_PX) {
          return Math.max(15, Math.min(45, legacyWidth / window.innerWidth * 100))
        }
      } catch {
        // Use the regular default below.
      }
      return 24
    })()
    return loadPanelLayout(UPPER_LAYOUT_STORAGE_KEY, {
      browser: fallbackBrowserPercent,
      tracker: 100 - fallbackBrowserPercent
    })
  })
  const [verticalDefaultLayout] = useState<PanelLayout>(() =>
    loadPanelLayout(BOTTOM_LAYOUT_STORAGE_KEY, {
      upper: 100 - DEFAULT_BOTTOM_WORKSPACE_SIZE_PERCENT,
      bottom: DEFAULT_BOTTOM_WORKSPACE_SIZE_PERCENT
    })
  )
  const [bottomTab, setBottomTabState] = useState<BottomWorkspaceTab>(initialBottomWorkspaceTab)
  const bottomPanelRef = usePanelRef()
  const initialBottomSize = verticalDefaultLayout.bottom ?? DEFAULT_BOTTOM_WORKSPACE_SIZE_PERCENT
  const [initialExpansionState] = useState(() => loadBottomWorkspaceExpansionState(initialBottomSize))
  const previousBottomSizeRef = useRef(initialExpansionState.previousBottomSize)
  const [bottomWorkspaceExpanded, setBottomWorkspaceExpanded] = useState(initialExpansionState.expanded)
  const [selectedChannelIndex, setSelectedChannelIndex] = useState<number | null>(null)
  const [selectedEffectId, setSelectedEffectId] = useState<string | null>(null)
  const { onSetVisualTelemetryActive } = mixer
  const {
    busy: projectBusy,
    onSave: saveProject,
    onSaveAs: saveProjectAs
  } = project

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

  const toggleBottomWorkspaceExpanded = useCallback(() => {
    const panel = bottomPanelRef.current
    if (!panel) return
    if (bottomWorkspaceExpanded) {
      saveBottomWorkspaceExpansionState({
        expanded: false,
        previousBottomSize: previousBottomSizeRef.current
      })
      panel.resize(`${previousBottomSizeRef.current}%`)
      setBottomWorkspaceExpanded(false)
      return
    }
    previousBottomSizeRef.current = panel.getSize().asPercentage
    saveBottomWorkspaceExpansionState({
      expanded: true,
      previousBottomSize: previousBottomSizeRef.current
    })
    panel.resize(`${BOTTOM_WORKSPACE_EXPANDED_PERCENT}%`)
    setBottomWorkspaceExpanded(true)
  }, [bottomPanelRef, bottomWorkspaceExpanded])

  const openSamplesFromCue = useCallback(() => {
    setBottomTab('samples')
    const panel = bottomPanelRef.current
    if (panel && panel.getSize().asPercentage < BOTTOM_WORKSPACE_CUE_MINIMUM_PERCENT) {
      panel.resize(`${BOTTOM_WORKSPACE_CUE_MINIMUM_PERCENT}%`)
    }
  }, [bottomPanelRef, setBottomTab])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 's') return
      if (event.repeat || isEditableTarget(event.target) || projectBusy) return
      event.preventDefault()
      if (event.shiftKey) void saveProjectAs()
      else void saveProject()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [projectBusy, saveProject, saveProjectAs])

  const handleMixJamBrowserCollapsedChange = useCallback((collapsed: boolean) => {
    setMixJamBrowserCollapsed(collapsed)
    if (collapsed) browserPanelRef.current?.collapse()
    else browserPanelRef.current?.expand()
  }, [browserPanelRef])

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
    onTransportStop: handleTransportStop,
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

  return (
    <PanelGroup
      id="player-workspace-split"
      className={`player-view${mixJamBrowserCollapsed ? ' mixjam-browser-collapsed' : ''}`}
      orientation="vertical"
      defaultLayout={verticalDefaultLayout}
      onLayoutChanged={(layout, meta) => {
        savePanelLayout(BOTTOM_LAYOUT_STORAGE_KEY, layout)
        const bottomSize = layout.bottom
        if (!meta.isUserInteraction || bottomSize === undefined) return
        previousBottomSizeRef.current = bottomSize
        setBottomWorkspaceExpanded(false)
        saveBottomWorkspaceExpansionState({ expanded: false, previousBottomSize: bottomSize })
      }}
    >
      <Panel id="upper" minSize="244px">
        <div className="upper-middle-work">
          <PanelGroup
            id="upper-work-split"
            className="upper-work-group"
            orientation="horizontal"
            defaultLayout={upperDefaultLayout}
            onLayoutChanged={(layout) => savePanelLayout(UPPER_LAYOUT_STORAGE_KEY, layout)}
          >
            <Panel
              id="browser"
              panelRef={browserPanelRef}
              defaultSize="320px"
              minSize={`${LEFT_COL_MIN_PX}px`}
              maxSize="45vw"
              groupResizeBehavior="preserve-pixel-size"
              collapsible
              collapsedSize="30px"
            >
              <MixJamBrowser
                mixJamFiles={mixJamFiles}
                busy={project.busy}
                onOpenProject={(path) => void project.onOpenPath(path)}
                onCollapsedChange={handleMixJamBrowserCollapsedChange}
              />
            </Panel>

            <PanelResizeHandle
              className="upper-work-resize"
              aria-label="Resize MixJam Browser"
              disabled={mixJamBrowserCollapsed}
            />

            <Panel id="tracker" minSize="320px">

              <section className="tracker-zone tracker-region">
        {!hasPlacedSamples && (
          <aside className="tracker-first-sample-cue" aria-label="Start with a sample">
            <strong>Start with a sample</strong>
            <span>Browse your library, preview a sound, then drag it onto any lane.</span>
            <button type="button" onClick={openSamplesFromCue}>Open Samples</button>
          </aside>
        )}
        <ContextMenuRoot onOpenChange={(open) => { if (!open) setContextMenu(null) }}>
          <ContextMenuTrigger asChild>
            <div
              id={TRACKER_SCROLLPORT_ID}
              className="tracker-lanes"
              ref={lanesRef}
              onMouseDown={handleLanesMouseDown}
              onContextMenuCapture={() => setContextMenu(null)}
            >
          <div
            className="tracker-timeline"
            ref={timelineRef}
            style={{ minWidth: TRACKER_TIMELINE_MIN_WIDTH_PX }}
          >
          {currentTick < totalTicks && (
            <div
              className="tracker-playhead"
              style={{
                left: `calc(${LANE_HEAD_WIDTH_PX}px + (${currentTick} / ${totalTicks}) * (100% - ${LANE_HEAD_WIDTH_PX}px))`,
              }}
              aria-hidden="true"
            />
          )}
          {selectionRect && (() => {
            const x = Math.min(selectionRect.startX, selectionRect.currentX)
            const y = Math.min(selectionRect.startY, selectionRect.currentY)
            const w = Math.abs(selectionRect.currentX - selectionRect.startX)
            const h = Math.abs(selectionRect.currentY - selectionRect.startY)
            return <div className="selection-rect" style={{ left: x, top: y, width: w, height: h }} />
          })()}
          <div className="tracker-ruler">
            <div className="tracker-ruler-spacer" />
            <SliderRoot
              className="tracker-ruler-seek"
              value={[Math.min(currentTick, lastGridTick)]}
              min={0}
              max={totalTicks}
              step={TICKS_PER_BEAT}
              onValueChange={([tick]) => onTransportSeek(Math.min(tick, lastGridTick))}
            >
              <SliderTrack className="tracker-ruler-track">
                {Array.from({ length: TRACKER_BAR_COUNT }, (_, i) => {
                  const barNumber = i + 1
                  return (
                    <div key={i} className="tracker-ruler-tick tracker-ruler-tick-bar">
                      {barNumber % 4 === 1 ? <span className="tracker-ruler-bar">{barNumber}</span> : null}
                    </div>
                  )
                })}
              </SliderTrack>
              <SliderThumb
                className="tracker-ruler-thumb"
                aria-label="Tracker timeline"
                aria-valuemax={lastGridTick}
              />
            </SliderRoot>
          </div>
          {lanes.map((lane) => {
            const dimmed = laneShouldDim(lane)
            return (
              <LaneRow
                key={lane.index}
                lane={lane}
                dimmed={dimmed}
                totalTicks={totalTicks}
                flashSamplePath={activeFlashPath}
                selectedPlacementIds={selectedPlacementIds}
                missingSamplePaths={arrangement.missingSamplePaths}
                onToggleLaneMute={arrangement.onToggleLaneMute}
                onToggleLaneSolo={arrangement.onToggleLaneSolo}
                onSetLanePan={arrangement.onSetLanePan}
                onPlacementDragStart={handlePlacementDragStart}
                onPlacementContextMenu={setContextMenu}
                onDragOver={handleLaneCanvasDragOver}
                onDrop={handleLaneCanvasDrop}
              />
            )
          })}
          </div>
            </div>
          </ContextMenuTrigger>
          {contextMenu && (
            <ContextMenuContent aria-label={`Placement actions for ${contextMenu.sampleName}`}>
              <ContextMenuItem onSelect={handleContextDelete}>Delete</ContextMenuItem>
              <ContextMenuItem onSelect={handleContextLocate}>Locate in Browser</ContextMenuItem>
            </ContextMenuContent>
          )}
        </ContextMenuRoot>
        <SongProgressBar scrollportRef={lanesRef} scrollportId={TRACKER_SCROLLPORT_ID} />
              </section>
            </Panel>
          </PanelGroup>

          <MiddleStrip
        projectName={project.name}
        projectDirty={project.dirty}
        projectBusy={project.busy}
        onOpenProject={() => void project.onOpen()}
        onSaveProject={() => void project.onSave()}
        onSaveProjectAs={() => void project.onSaveAs()}
        transportState={transportState}
        canUndo={transport.canUndo}
        canRedo={transport.canRedo}
        onUndo={transport.onUndo}
        onRedo={transport.onRedo}
        onTransportPlay={transport.onTransportPlay}
        onTransportPause={transport.onTransportPause}
        onTransportStop={handleTransportStop}
        onTransportSkipBack={handleTransportSkipBack}
        onTransportJumpToEnd={handleTransportJumpToEnd}
        jumpToEndDisabled={transport.songEndTick === 0}
        searchQuery={browser.searchQuery}
        onSearchChange={browser.onSearchChange}
        scanProgress={browser.scanProgress}
        analysisProgress={browser.analysisProgress}
        onStartScan={browser.onStartScan}
        onCancelScan={browser.onCancelScan}
        onOpenShortcuts={() => setShortcutsOpen(true)}
          />
        </div>
      </Panel>

      <PanelResizeHandle
        className="bottom-workspace-resize"
        aria-label="Resize bottom workspace"
      />

      <Panel id="bottom" panelRef={bottomPanelRef} minSize="60px" maxSize="60%">
        <BottomWorkspace
        activeTab={bottomTab}
        bpm={transport.bpm}
        masterGain={transport.masterGain}
        expanded={bottomWorkspaceExpanded}
        onTabChange={setBottomTab}
        onToggleExpanded={toggleBottomWorkspaceExpanded}
        song={(
          <SongControlsMain
            bpm={transport.bpm}
            masterGain={transport.masterGain}
            masterMeter={transport.masterMeter}
            onSetBpm={transport.onSetBpm}
            onSetMasterGain={transport.onSetMasterGain}
            onResetMasterMeter={transport.onResetMasterMeter}
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
            canRestoreChannel={mixer.canRestoreChannel}
            onOpenMixer={() => setBottomTab('mixer')}
            onRestoreChannel={mixer.onRestoreChannel}
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
            active={bottomTab === 'samples'}
            browser={browser}
            bubblePixelsPerSecond={bubblePixelsPerSecond}
            pixelsPerTick={pixelsPerTick}
            projectBpm={transport.bpm}
            durationTicksBySamplePath={sampleDurationTicksByPath}
            flashSamplePath={activeFlashPath}
            onSampleDragStart={handleSampleDragStart}
          />
        )}
        />
      </Panel>

      {shortcutsOpen && <ShortcutsOverlay onClose={() => setShortcutsOpen(false)} />}
    </PanelGroup>
  )
}
