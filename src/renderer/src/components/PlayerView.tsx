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
import { usePlayerShortcuts } from '../hooks/usePlayerShortcuts'
import { useDragCleanups } from '../hooks/useDragCleanups'
import { usePlacementDrag } from '../hooks/usePlacementDrag'
import MixJamBrowser from './MixJamBrowser'
import MiddleStrip from './MiddleStrip'
import SongControlsMain from './SongControlsMain'
import MixerColumn from './MixerColumn'
import SampleBrowser from './SampleBrowser'
import LaneRow from './LaneRow'
import ShortcutsOverlay from './ShortcutsOverlay'
import BottomWorkspace, {
  type BottomWorkspaceTab
} from './BottomWorkspace'
import {
  loadPlayerWorkspacePreferences,
  playerWorkspacePreferences
} from '../app-state/player-workspace-preferences'
import { ContextMenuContent, ContextMenuItem, ContextMenuRoot, ContextMenuTrigger } from './ui/ContextMenu'
import { Panel, PanelGroup, PanelResizeHandle, usePanelRef, type PanelLayout } from './ui/ResizablePanels'
import { SliderRoot, SliderThumb, SliderTrack } from './ui/Slider'
import { Tooltip } from './ui/Tooltip'
import { useUiGeometry } from '../ui-size'

const TRACKER_SCROLLPORT_ID = 'tracker-song-scrollport'

const BOTTOM_WORKSPACE_EXPANDED_PERCENT = 60
const BOTTOM_WORKSPACE_CUE_MINIMUM_PERCENT = 50

export function reconcileSelectedLaneId(
  lanes: ReadonlyArray<{ id: string }>,
  selectedLaneId: string | null
): string | null {
  if (selectedLaneId !== null && lanes.some((lane) => lane.id === selectedLaneId)) {
    return selectedLaneId
  }
  return lanes[0]?.id ?? null
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
  const emptyLaneCount = Math.max(0, lanes.filter((lane) => lane.placements.length === 0).length - (lanes.every((lane) => lane.placements.length === 0) ? 1 : 0))

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
  const [workspaceDefaults] = useState(() =>
    loadPlayerWorkspacePreferences(window.innerWidth, LEFT_COL_MIN_PX)
  )
  const uiGeometry = useUiGeometry()
  const mixerMinimumHeight = uiGeometry.tabRowHeight +
    (4 * uiGeometry.spaceMd) + uiGeometry.size +
    (2 * uiGeometry.mixerFxHeight) + uiGeometry.spaceSm + 14
  const [mixJamBrowserCollapsed, setMixJamBrowserCollapsed] = useState(
    workspaceDefaults.mixJamBrowserCollapsed
  )
  const browserPanelRef = usePanelRef()
  const upperDefaultLayout: PanelLayout = workspaceDefaults.upperLayout
  const verticalDefaultLayout: PanelLayout = workspaceDefaults.verticalLayout
  const [bottomTab, setBottomTabState] = useState<BottomWorkspaceTab>(workspaceDefaults.bottomTab)
  const bottomPanelRef = usePanelRef()
  const bottomTabSizesRef = useRef({ ...workspaceDefaults.bottomTabSizes })
  const initialExpansionState = workspaceDefaults.bottomExpansion
  const previousBottomSizeRef = useRef(initialExpansionState.previousBottomSize)
  const [bottomWorkspaceExpanded, setBottomWorkspaceExpanded] = useState(initialExpansionState.expanded)
  const [selectedLaneId, setSelectedLaneId] = useState<string | null>(null)
  const { onSetVisualTelemetryActive } = mixer
  const {
    busy: projectBusy,
    onSave: saveProject,
    onSaveAs: saveProjectAs
  } = project

  useEffect(() => {
    onSetVisualTelemetryActive(bottomTab === 'mixer')
  }, [bottomTab, onSetVisualTelemetryActive])

  useEffect(() => () => {
    onSetVisualTelemetryActive(false)
  }, [onSetVisualTelemetryActive])

  const setBottomTab = useCallback((tab: BottomWorkspaceTab) => {
    if (tab === bottomTab) return
    const currentSize = bottomPanelRef.current!.getSize().asPercentage
    bottomTabSizesRef.current = { ...bottomTabSizesRef.current, [bottomTab]: currentSize }
    playerWorkspacePreferences.saveBottomTabSizes(bottomTabSizesRef.current)
    setBottomTabState(tab)
    playerWorkspacePreferences.saveBottomTab(tab)
  }, [bottomPanelRef, bottomTab])

  useEffect(() => {
    const panel = bottomPanelRef.current!
    const targetPercentage = bottomTabSizesRef.current[bottomTab]
    if (bottomTab !== 'mixer') {
      panel.resize(`${targetPercentage}%`)
      return
    }
    const current = panel.getSize()
    const groupHeight = current.inPixels * 100 / current.asPercentage
    const rememberedHeight = groupHeight * targetPercentage / 100
    panel.resize(`${Math.max(mixerMinimumHeight, rememberedHeight)}px`)
  }, [bottomPanelRef, bottomTab, mixerMinimumHeight])

  const toggleBottomWorkspaceExpanded = useCallback(() => {
    const panel = bottomPanelRef.current!
    if (bottomWorkspaceExpanded) {
      playerWorkspacePreferences.saveBottomExpansion({
        expanded: false,
        previousBottomSize: previousBottomSizeRef.current
      })
      panel.resize(`${previousBottomSizeRef.current}%`)
      setBottomWorkspaceExpanded(false)
      return
    }
    previousBottomSizeRef.current = panel.getSize().asPercentage
    playerWorkspacePreferences.saveBottomExpansion({
      expanded: true,
      previousBottomSize: previousBottomSizeRef.current
    })
    panel.resize(`${BOTTOM_WORKSPACE_EXPANDED_PERCENT}%`)
    setBottomWorkspaceExpanded(true)
  }, [bottomPanelRef, bottomWorkspaceExpanded])

  const openSamplesFromCue = useCallback(() => {
    bottomTabSizesRef.current = {
      ...bottomTabSizesRef.current,
      samples: Math.max(
        bottomTabSizesRef.current.samples,
        BOTTOM_WORKSPACE_CUE_MINIMUM_PERCENT
      )
    }
    playerWorkspacePreferences.saveBottomTabSizes(bottomTabSizesRef.current)
    setBottomTab('samples')
  }, [setBottomTab])

  const handleMixJamBrowserCollapsedChange = useCallback((collapsed: boolean) => {
    setMixJamBrowserCollapsed(collapsed)
    playerWorkspacePreferences.saveMixJamBrowserCollapsed(collapsed)
    if (collapsed) browserPanelRef.current?.collapse()
    else browserPanelRef.current?.expand()
  }, [browserPanelRef])

  useEffect(() => {
    const nextLaneId = reconcileSelectedLaneId(arrangement.lanes, selectedLaneId)
    if (nextLaneId === selectedLaneId) return
    setSelectedLaneId(nextLaneId)
  }, [arrangement.lanes, selectedLaneId])

  // Refs for values read by the global keyboard shortcut handler so the
  // listener subscribes once instead of on every selection / transport change.
  const selectedPlacementIdsRef = useRef<ReadonlySet<string>>(selectedPlacementIds)
  selectedPlacementIdsRef.current = selectedPlacementIds
  const transportStateRef = useRef(transportState)
  transportStateRef.current = transportState
  const projectBusyRef = useRef(projectBusy)
  projectBusyRef.current = projectBusy

  usePlayerShortcuts({
    selectedPlacementIdsRef,
    clearSelection,
    transportStateRef,
    projectBusyRef,
    onRemovePlacements: arrangement.onRemovePlacements,
    onUndo: transport.onUndo,
    onRedo: transport.onRedo,
    onTransportPlay: transport.onTransportPlay,
    onTransportPause: transport.onTransportPause,
    onTransportStop: handleTransportStop,
    onSave: saveProject,
    onSaveAs: saveProjectAs,
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
  const [laneContextMenu, setLaneContextMenu] = useState<{
    laneIndex: number
    laneName: string
  } | null>(null)
  const [renamingLaneIndex, setRenamingLaneIndex] = useState<number | null>(null)

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

  const handleLaneContextMenu = useCallback((laneIndex: number, laneName: string) => {
    setLaneContextMenu({ laneIndex, laneName })
  }, [])

  const handleRenameLane = useCallback(() => {
    if (!laneContextMenu) return
    setRenamingLaneIndex(laneContextMenu.laneIndex)
    setLaneContextMenu(null)
  }, [laneContextMenu])

  const handleDeleteLane = useCallback(() => {
    if (!laneContextMenu) return
    const lane = lanes.find((candidate) => candidate.index === laneContextMenu.laneIndex)
    if (!lane) return
    if (lane.placements.length > 0 && !window.confirm(`Delete ${lane.name} and its ${lane.placements.length} sample event${lane.placements.length === 1 ? '' : 's'}?`)) return
    arrangement.onDeleteLane(lane.index)
    setLaneContextMenu(null)
  }, [arrangement, laneContextMenu, lanes])

  const onRenameLane = arrangement.onRenameLane
  const handleCommitLaneName = useCallback((laneIndex: number, name: string) => {
    onRenameLane(laneIndex, name)
    setRenamingLaneIndex(null)
  }, [onRenameLane])

  const handleCancelLaneRename = useCallback(() => {
    setRenamingLaneIndex(null)
  }, [])

  return (
    <PanelGroup
      id="player-workspace-split"
      className={`player-view${mixJamBrowserCollapsed ? ' mixjam-browser-collapsed' : ''}`}
      orientation="vertical"
      defaultLayout={verticalDefaultLayout}
      onLayoutChanged={(layout, meta) => {
        playerWorkspacePreferences.saveVerticalLayout(layout)
        const bottomSize = layout.bottom
        if (bottomSize === undefined) return
        bottomTabSizesRef.current = { ...bottomTabSizesRef.current, [bottomTab]: bottomSize }
        playerWorkspacePreferences.saveBottomTabSizes(bottomTabSizesRef.current)
        if (!meta.isUserInteraction || bottomTab === 'mixer') return
        previousBottomSizeRef.current = bottomSize
        setBottomWorkspaceExpanded(false)
        playerWorkspacePreferences.saveBottomExpansion({ expanded: false, previousBottomSize: bottomSize })
      }}
    >
      <Panel id="upper" minSize="244px">
        <div className="upper-middle-work">
          <PanelGroup
            id="upper-work-split"
            className="upper-work-group"
            orientation="horizontal"
            defaultLayout={upperDefaultLayout}
            onLayoutChanged={(layout) => playerWorkspacePreferences.saveUpperLayout(layout)}
          >
            <Panel
              id="browser"
              panelRef={browserPanelRef}
              defaultSize="240px"
              minSize={`${LEFT_COL_MIN_PX}px`}
              maxSize="45vw"
              groupResizeBehavior="preserve-pixel-size"
              collapsible
              collapsedSize="30px"
            >
              <MixJamBrowser
                mixJamFiles={mixJamFiles}
                busy={project.busy}
                collapsed={mixJamBrowserCollapsed}
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
        <ContextMenuRoot onOpenChange={(open) => {
          if (!open) {
            setContextMenu(null)
            setLaneContextMenu(null)
          }
        }}>
          <ContextMenuTrigger asChild>
            <div
              id={TRACKER_SCROLLPORT_ID}
              className="tracker-lanes"
              ref={lanesRef}
              onMouseDown={handleLanesMouseDown}
              onContextMenuCapture={() => {
                setContextMenu(null)
                setLaneContextMenu(null)
              }}
            >
          <div
            className="tracker-timeline"
            ref={timelineRef}
            style={{ minWidth: TRACKER_TIMELINE_MIN_WIDTH_PX }}
          >
          <div className="tracker-lane-actions" style={{ minHeight: 36 }}>
            <Tooltip content="Delete all empty lanes. An Empty Lane has no sample events anywhere in the song. This action does not ask for confirmation.">
              <span className="lane-action-tooltip-trigger">
                <button type="button" className="lane-empty-delete" onClick={arrangement.onDeleteEmptyLanes} disabled={emptyLaneCount === 0 || lanes.length <= 1} aria-label={`Delete ${emptyLaneCount} empty lanes`}>
                  <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14"><path d="M3 4h10M6 4V2h4v2m-6 0 1 10h6l1-10M7 7v4m2-4v4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg> {emptyLaneCount}
                </button>
              </span>
            </Tooltip>
          </div>
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
                key={lane.id}
                lane={lane}
                dimmed={dimmed}
                totalTicks={totalTicks}
                flashSamplePath={activeFlashPath}
                selectedPlacementIds={selectedPlacementIds}
                missingSamplePaths={arrangement.missingSamplePaths}
                onToggleLaneMute={arrangement.onToggleLaneMute}
                onToggleLaneSolo={arrangement.onToggleLaneSolo}
                onSetLanePan={arrangement.onSetLanePan}
                renaming={renamingLaneIndex === lane.index}
                onLaneContextMenu={handleLaneContextMenu}
                onCommitLaneName={handleCommitLaneName}
                onCancelLaneRename={handleCancelLaneRename}
                onPlacementDragStart={handlePlacementDragStart}
                onPlacementContextMenu={setContextMenu}
                onDragOver={handleLaneCanvasDragOver}
                onDrop={handleLaneCanvasDrop}
              />
            )
          })}
          <div className="tracker-lane-add-row">
            <div className="tracker-lane-add-head">
              <Tooltip content={lanes.length >= 64 ? 'The 64 lane limit has been reached.' : 'Add a lane after the final lane.'}>
                <span className="lane-action-tooltip-trigger">
                  <button type="button" className="lane-add-button" onClick={arrangement.onAddLane} disabled={lanes.length >= 64} aria-label="Add lane">+ Add Lane</button>
                </span>
              </Tooltip>
            </div>
            <div className="tracker-lane-add-canvas" aria-hidden="true" />
          </div>
          </div>
            </div>
          </ContextMenuTrigger>
          {contextMenu && (
            <ContextMenuContent aria-label={`Placement actions for ${contextMenu.sampleName}`}>
              <ContextMenuItem onSelect={handleContextDelete}>Delete</ContextMenuItem>
              <ContextMenuItem onSelect={handleContextLocate}>Locate in Browser</ContextMenuItem>
            </ContextMenuContent>
          )}
          {laneContextMenu && (
            <ContextMenuContent aria-label={`Lane actions for ${laneContextMenu.laneName}`}>
              <ContextMenuItem onSelect={handleRenameLane}>Rename lane</ContextMenuItem>
              <ContextMenuItem disabled={lanes.length <= 1} onSelect={handleDeleteLane}>Delete lane</ContextMenuItem>
            </ContextMenuContent>
          )}
        </ContextMenuRoot>
              </section>
            </Panel>
          </PanelGroup>

          <MiddleStrip
        trackerScrollportRef={lanesRef}
        trackerScrollportId={TRACKER_SCROLLPORT_ID}
        projectName={project.name}
        projectDirty={project.dirty}
        projectBusy={project.busy}
        canRegenerate={project.canRegenerate}
        onNewProject={() => void project.onNew()}
        onOpenProject={() => void project.onOpen()}
        onSaveProject={() => void project.onSave()}
        onSaveProjectAs={() => void project.onSaveAs()}
        onRegenerateExact={project.onRegenerateExact}
        onRegenerateCurrent={project.onRegenerateCurrent}
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
        librarySyncState={browser.librarySyncState}
        onRescanLibrary={browser.onRescanLibrary}
        onRetryLibrarySync={browser.onRetryLibrarySync}
        onCancelLibrarySync={browser.onCancelLibrarySync}
        onOpenShortcuts={() => setShortcutsOpen(true)}
          />
        </div>
      </Panel>

      <PanelResizeHandle
        className="bottom-workspace-resize"
        aria-label="Resize bottom workspace"
      />

      <Panel
        id="bottom"
        panelRef={bottomPanelRef}
        minSize={bottomTab === 'mixer' ? `${mixerMinimumHeight}px` : '60px'}
        maxSize="75%"
      >
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
            clipEdgeMicroFades={transport.clipEdgeMicroFades}
            masterMeter={transport.masterMeter}
            onSetBpm={transport.onSetBpm}
            onSetMasterGain={transport.onSetMasterGain}
            onSetClipEdgeMicroFades={transport.onSetClipEdgeMicroFades}
            onResetMasterMeter={transport.onResetMasterMeter}
          />
        )}
        mixer={(
          <MixerColumn
            lanes={arrangement.lanes}
            returnBuses={mixer.returnBuses}
            channelLevels={mixer.channelLevels}
            channelPeaks={mixer.channelPeaks}
            selectedLaneId={selectedLaneId}
            onGestureStart={mixer.onBeginMixerGesture}
            onGestureEnd={mixer.onCommitMixerGesture}
            onSetChannelGain={mixer.onSetChannelGain}
            onSetChannelPan={mixer.onSetChannelPan}
            onSetChannelSend={mixer.onSetChannelSend}
            onSetReturnBus={mixer.onSetReturnBus}
            onPreviewReturnBus={mixer.onPreviewReturnBus}
            onSelectLane={setSelectedLaneId}
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
