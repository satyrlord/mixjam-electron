import { useEffect, useRef, useState } from 'react'
import type { MixJamFileItem } from '../../../shared/backend-api'
import type {
  TrackerArrangementProps,
  PlayerBrowserProps,
  PlayerMasterBusProps,
  PlayerMixerProps,
  PlayerProjectProps,
  PlayerTransportProps
} from './playerProps'
import {
  LANE_HEAD_WIDTH_PX,
  LEFT_COL_MIN_PX,
  TRACKER_BAR_COUNT,
  TRACKER_TIMELINE_MIN_WIDTH_PX
} from '../lib/arrangement'
import { TICKS_PER_BEAT } from '../engine/transport'
import { usePlayerShortcuts } from '../hooks/usePlayerShortcuts'
import { useTrackerInteraction } from '../hooks/useTrackerInteraction'
import MixJamBrowser from './MixJamBrowser'
import MiddleStrip from './MiddleStrip'
import MasterBusStrip from './MasterBusStrip'
import { useMasterBusMeters } from '../hooks/useMasterBusMeters'
import MixerColumn from './MixerColumn'
import SampleBrowser from './SampleBrowser'
import LaneRow from './LaneRow'
import ShortcutsOverlay from './ShortcutsOverlay'
import BottomWorkspace, { useBottomWorkspace } from './BottomWorkspace'
import { ContextMenuContent, ContextMenuItem, ContextMenuRoot, ContextMenuTrigger } from './ui/ContextMenu'
import { Panel, PanelGroup, PanelResizeHandle } from './ui/ResizablePanels'
import { LinearSlider } from './ui/Slider'
import { Tooltip } from './ui/Tooltip'

const TRACKER_SCROLLPORT_ID = 'tracker-song-scrollport'

export interface PlayerViewProps {
  mixJamFiles: MixJamFileItem[]
  browser: PlayerBrowserProps
  arrangement: TrackerArrangementProps
  transport: PlayerTransportProps
  mixer: PlayerMixerProps
  masterBus: PlayerMasterBusProps
  project: PlayerProjectProps
}

export default function PlayerView({
  mixJamFiles,
  browser,
  arrangement,
  transport,
  mixer,
  masterBus,
  project
}: PlayerViewProps) {
  const { lanes, laneShouldDim, currentTick } = arrangement
  const { transportState, onTransportSeek } = transport
  const hasPlacedSamples = lanes.some((lane) => lane.placements.length > 0)
  const emptyLaneCount = Math.max(0, lanes.filter((lane) => lane.placements.length === 0).length - (lanes.every((lane) => lane.placements.length === 0) ? 1 : 0))
  const tracker = useTrackerInteraction({ arrangement, transport, browser })
  const {
    lanesRef, timelineRef, totalTicks, pixelsPerTick, bubblePixelsPerSecond, sampleDurationTicksByPath,
    selectedPlacementIds, clearSelection, selectedLaneId, setSelectedLaneId, contextMenu, setContextMenu,
    laneContextMenu, setLaneContextMenu, renamingLaneIndex, activeFlashPath, selectionRect,
    handleLanesMouseDown, handleSampleDragStart, handlePlacementDragStart, handleLaneCanvasDragOver,
    handleLaneCanvasDrop, onTransportStop: handleTransportStop, onTransportSkipBack: handleTransportSkipBack,
    onTransportJumpToEnd: handleTransportJumpToEnd, onContextDelete: handleContextDelete,
    onContextLocate: handleContextLocate, onLaneContextMenu: handleLaneContextMenu,
    onRenameLane: handleRenameLane, onDeleteLane: handleDeleteLane, onCommitLaneName: handleCommitLaneName,
    onCancelLaneRename: handleCancelLaneRename
  } = tracker
  const lastGridTick = Math.floor((totalTicks - 1) / TICKS_PER_BEAT) * TICKS_PER_BEAT

  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const workspace = useBottomWorkspace()
  const {
    browserPanelRef, bottomPanelRef, bottomTab, expanded: bottomWorkspaceExpanded,
    bottomMinimumHeight, mixJamBrowserCollapsed, upperDefaultLayout, verticalDefaultLayout,
    setBottomTab, toggleExpanded: toggleBottomWorkspaceExpanded, openSamples: openSamplesFromCue,
    onBrowserCollapsedChange: handleMixJamBrowserCollapsedChange,
    onVerticalLayoutChanged, onUpperLayoutChanged
  } = workspace
  const { onSetVisualTelemetryActive } = mixer
  const {
    busy: projectBusy,
    onSave: saveProject,
    onSaveAs: saveProjectAs
  } = project

  useEffect(() => {
    onSetVisualTelemetryActive(bottomTab === 'mixer')
  }, [bottomTab, onSetVisualTelemetryActive])

  // Strip meters poll only while the Master tab is active (spec-012); the
  // OVER lamp latch lives here so it survives tab switches.
  const { meters: masterBusMeters, onResetOver: handleResetMasterBusOver } = useMasterBusMeters(
    bottomTab === 'master',
    masterBus.getMeterSnapshot,
    transport.masterMeter
  )

  useEffect(() => () => {
    onSetVisualTelemetryActive(false)
  }, [onSetVisualTelemetryActive])

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

  return (
    <PanelGroup
      id="player-workspace-split"
      className={`player-view${mixJamBrowserCollapsed ? ' mixjam-browser-collapsed' : ''}`}
      orientation="vertical"
      defaultLayout={verticalDefaultLayout}
      onLayoutChanged={onVerticalLayoutChanged}
    >
      <Panel id="upper" minSize="244px">
        <div className="upper-middle-work">
          <PanelGroup
            id="upper-work-split"
            className="upper-work-group"
            orientation="horizontal"
            defaultLayout={upperDefaultLayout}
            onLayoutChanged={onUpperLayoutChanged}
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
            <LinearSlider
              className="tracker-ruler-seek"
              value={Math.min(currentTick, lastGridTick)}
              min={0}
              max={totalTicks}
              step={TICKS_PER_BEAT}
              onValueChange={(tick) => onTransportSeek(Math.min(tick, lastGridTick))}
              ariaLabel="Tracker timeline"
              showRange={false}
              trackClassName="tracker-ruler-track"
              trackChildren={Array.from({ length: TRACKER_BAR_COUNT }, (_, i) => {
                  const barNumber = i + 1
                  return (
                    <div key={i} className="tracker-ruler-tick tracker-ruler-tick-bar">
                      {barNumber % 4 === 1 ? <span className="tracker-ruler-bar">{barNumber}</span> : null}
                    </div>
                  )
                })}
              thumbProps={{ 'aria-valuemax': lastGridTick }}
            />
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
        bpm={transport.bpm}
        onSetBpm={transport.onSetBpm}
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
        minSize={`${bottomMinimumHeight}px`}
        maxSize="75%"
      >
        <BottomWorkspace
        activeTab={bottomTab}
        bpm={transport.bpm}
        masterGain={transport.masterGain}
        minimumHeight={bottomMinimumHeight}
        expanded={bottomWorkspaceExpanded}
        onTabChange={setBottomTab}
        onToggleExpanded={toggleBottomWorkspaceExpanded}
        master={(
          <MasterBusStrip
            state={masterBus.state}
            meters={masterBusMeters}
            onSetParam={masterBus.onSetParam}
            onGestureStart={mixer.onBeginMixerGesture}
            onGestureEnd={mixer.onCommitMixerGesture}
            onTogglePower={masterBus.onTogglePower}
            onReorder={masterBus.onReorder}
            onApplyPreset={masterBus.onApplyPreset}
            onResetOver={handleResetMasterBusOver}
          />
        )}
        mixer={(
          <MixerColumn
            lanes={arrangement.lanes}
            returnBuses={mixer.returnBuses}
            channelLevels={mixer.channelLevels}
            channelPeaks={mixer.channelPeaks}
            selectedLaneId={selectedLaneId}
            bpm={transport.bpm}
            onSetBpm={transport.onSetBpm}
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
