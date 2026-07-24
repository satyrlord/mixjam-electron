import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import type { TrackerArrangementProps, PlayerBrowserProps, PlayerTransportProps } from '../components/playerProps'
import { LANE_HEAD_WIDTH_PX, TRACKER_TOTAL_TICKS, timelinePixelsPerSecond } from '../lib/arrangement'
import { useDragCleanups } from './useDragCleanups'
import { usePlacementDrag } from './usePlacementDrag'

export function reconcileSelectedLaneId(
  lanes: ReadonlyArray<{ id: string }>, selectedLaneId: string | null
): string | null {
  return selectedLaneId !== null && lanes.some((lane) => lane.id === selectedLaneId)
    ? selectedLaneId : lanes[0]?.id ?? null
}

interface UseTrackerInteractionOptions {
  arrangement: TrackerArrangementProps
  transport: PlayerTransportProps
  browser: Pick<PlayerBrowserProps, 'onSearchChange' | 'onSelectCategory'>
}

/** Owns Tracker selection, drag, scrolling, lane menus, and sample location state. */
export function useTrackerInteraction({ arrangement, transport, browser }: UseTrackerInteractionOptions) {
  const { lanes, tickStore } = arrangement
  const lanesRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const [laneContentWidth, setLaneContentWidth] = useState(0)
  const [selectedPlacementIds, setSelectedPlacementIds] = useState<Set<string>>(new Set())
  const [selectedLaneId, setSelectedLaneId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; laneIndex: number; placementId: string; samplePath: string; sampleName: string
  } | null>(null)
  const [laneContextMenu, setLaneContextMenu] = useState<{ laneIndex: number; laneName: string } | null>(null)
  const [renamingLaneIndex, setRenamingLaneIndex] = useState<number | null>(null)
  const [flashSamplePath, setFlashSamplePath] = useState<string | null>(null)
  const [flashVisible, setFlashVisible] = useState(false)
  const totalTicks = TRACKER_TOTAL_TICKS
  const clearSelection = useCallback(() => setSelectedPlacementIds(new Set()), [])
  // Stable identity: LaneRow is memoized, so an inline arrow here would fail
  // its shallow compare and re-render every lane on every PlayerView render.
  const cancelLaneRename = useCallback(() => setRenamingLaneIndex(null), [])
  const trackDragCleanup = useDragCleanups()

  useEffect(() => {
    const element = timelineRef.current
    if (!element) return
    const measure = () => setLaneContentWidth(element.clientWidth - LANE_HEAD_WIDTH_PX)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const pixelsPerTick = laneContentWidth > 0 ? laneContentWidth / totalTicks : 0
  const bubblePixelsPerSecond = timelinePixelsPerSecond(laneContentWidth, totalTicks, transport.bpm)
  const sampleDurationTicksByPath = useMemo(() => {
    const result = new Map<string, number>()
    for (const lane of lanes) for (const placement of lane.placements) {
      if (!result.has(placement.samplePath)) result.set(placement.samplePath, placement.durationTicks)
    }
    return result
  }, [lanes])
  const drag = usePlacementDrag({
    lanes, totalTicks, bpm: transport.bpm, sampleDurationTicksByPath, selectedPlacementIds, pixelsPerTick,
    onClearSelection: clearSelection, onPlaceSampleDetailOnLane: arrangement.onPlaceSampleDetailOnLane,
    onMovePlacement: arrangement.onMovePlacement, onDuplicatePlacement: arrangement.onDuplicatePlacement,
    onMovePlacementGroup: arrangement.onMovePlacementGroup, onDuplicatePlacementGroup: arrangement.onDuplicatePlacementGroup
  })

  const scrollToTick = useCallback((tick: number) => {
    const scrollport = lanesRef.current
    if (!scrollport) return
    const maximumScroll = Math.max(0, scrollport.scrollWidth - scrollport.clientWidth)
    const timelineWidth = Math.max(0, scrollport.scrollWidth - LANE_HEAD_WIDTH_PX)
    const boundedTick = Math.max(0, Math.min(totalTicks, tick))
    const targetX = LANE_HEAD_WIDTH_PX + (boundedTick / totalTicks) * timelineWidth
    scrollport.scrollLeft = boundedTick === 0 ? 0 : Math.max(0, Math.min(maximumScroll, targetX - scrollport.clientWidth + 8))
  }, [totalTicks])
  const onTransportStop = useCallback(() => { transport.onTransportStop(); scrollToTick(0) }, [scrollToTick, transport])
  const onTransportSkipBack = useCallback(() => { transport.onTransportSkipBack(); scrollToTick(0) }, [scrollToTick, transport])
  const onTransportJumpToEnd = useCallback(() => { transport.onTransportJumpToEnd(); scrollToTick(transport.songEndTick) }, [scrollToTick, transport])
  // Both effects key off discrete transitions (transport state, song end) and
  // read the playhead tick from the store at that moment, so the 10 Hz tick
  // advance itself never re-runs them.
  const previousTransportState = useRef(transport.transportState)
  useEffect(() => {
    if ((previousTransportState.current === 'playing' || previousTransportState.current === 'preparing') &&
      transport.transportState === 'stopped' && tickStore.get() === 0) scrollToTick(0)
    previousTransportState.current = transport.transportState
  }, [tickStore, scrollToTick, transport.transportState])
  const previousSongEndTick = useRef(transport.songEndTick)
  useEffect(() => {
    if (transport.songEndTick < previousSongEndTick.current && tickStore.get() > transport.songEndTick &&
      transport.transportState !== 'playing' && transport.transportState !== 'preparing') scrollToTick(transport.songEndTick)
    previousSongEndTick.current = transport.songEndTick
  }, [tickStore, scrollToTick, transport.songEndTick, transport.transportState])
  const handleLanesMouseDown = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const cleanup = drag.handleLanesMouseDown(event, lanesRef.current, setSelectedPlacementIds)
    if (cleanup) trackDragCleanup(cleanup)
    if (!event.ctrlKey) clearSelection()
  }, [clearSelection, drag, trackDragCleanup])
  useEffect(() => {
    const next = reconcileSelectedLaneId(lanes, selectedLaneId)
    if (next !== selectedLaneId) setSelectedLaneId(next)
  }, [lanes, selectedLaneId])
  useEffect(() => {
    if (!flashSamplePath) return
    setFlashVisible(true)
    let toggles = 0
    const timer = setInterval(() => {
      toggles++
      if (toggles >= 6) { clearInterval(timer); setFlashVisible(false); setFlashSamplePath(null) }
      else setFlashVisible((visible) => !visible)
    }, 300)
    return () => clearInterval(timer)
  }, [flashSamplePath])
  const onContextDelete = useCallback(() => {
    if (!contextMenu) return
    arrangement.onRemovePlacementFromLane(contextMenu.laneIndex, contextMenu.placementId)
    setContextMenu(null)
  }, [arrangement, contextMenu])
  const onContextLocate = useCallback(() => {
    if (!contextMenu) return
    browser.onSearchChange(contextMenu.sampleName.replace(/\.[^.]+$/, ''))
    browser.onSelectCategory(undefined)
    setFlashSamplePath(contextMenu.samplePath)
    setContextMenu(null)
  }, [browser, contextMenu])
  const onLaneContextMenu = useCallback((laneIndex: number, laneName: string) => setLaneContextMenu({ laneIndex, laneName }), [])
  const onRenameLane = useCallback(() => {
    if (!laneContextMenu) return
    setRenamingLaneIndex(laneContextMenu.laneIndex)
    setLaneContextMenu(null)
  }, [laneContextMenu])
  const onDeleteLane = useCallback(() => {
    if (!laneContextMenu) return
    const lane = lanes.find((candidate) => candidate.index === laneContextMenu.laneIndex)
    if (!lane || (lane.placements.length > 0 && !window.confirm(`Delete ${lane.name} and its ${lane.placements.length} sample event${lane.placements.length === 1 ? '' : 's'}?`))) return
    arrangement.onDeleteLane(lane.index)
    setLaneContextMenu(null)
  }, [arrangement, laneContextMenu, lanes])
  const onCommitLaneName = useCallback((laneIndex: number, name: string) => {
    arrangement.onRenameLane(laneIndex, name)
    setRenamingLaneIndex(null)
  }, [arrangement])

  return {
    lanesRef, timelineRef, totalTicks, laneContentWidth, pixelsPerTick, bubblePixelsPerSecond, sampleDurationTicksByPath,
    selectedPlacementIds, clearSelection, selectedLaneId, setSelectedLaneId, contextMenu, setContextMenu,
    laneContextMenu, setLaneContextMenu, renamingLaneIndex, activeFlashPath: flashVisible ? flashSamplePath : null,
    selectionRect: drag.selectionRect, handleLanesMouseDown, handleSampleDragStart: drag.handleSampleDragStart,
    handlePlacementDragStart: drag.handlePlacementDragStart, handleLaneCanvasDragOver: drag.handleLaneCanvasDragOver,
    handleLaneCanvasDrop: drag.handleLaneCanvasDrop, onTransportStop, onTransportSkipBack, onTransportJumpToEnd,
    onContextDelete, onContextLocate, onLaneContextMenu, onRenameLane, onDeleteLane, onCommitLaneName,
    onCancelLaneRename: cancelLaneRename
  }
}
