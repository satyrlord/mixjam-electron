import { act, render, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrackerArrangementProps, PlayerTransportProps } from '../components/playerProps'
import type { LaneState } from '../project/project-state'
import { emptyMasterMeterSnapshot } from '../engine/master-meter'
import { LANE_HEAD_WIDTH_PX, TRACKER_TOTAL_TICKS } from '../lib/arrangement'
import { useTrackerInteraction } from './useTrackerInteraction'

const dragSpies = vi.hoisted(() => ({
  cleanup: vi.fn(),
  handleLanesMouseDown: vi.fn(),
  handleSampleDragStart: vi.fn(),
  handlePlacementDragStart: vi.fn(),
  handleLaneCanvasDragOver: vi.fn(),
  handleLaneCanvasDrop: vi.fn()
}))

vi.mock('./usePlacementDrag', () => ({
  usePlacementDrag: () => ({
    selectionRect: null,
    handleLanesMouseDown: dragSpies.handleLanesMouseDown,
    handleSampleDragStart: dragSpies.handleSampleDragStart,
    handlePlacementDragStart: dragSpies.handlePlacementDragStart,
    handleLaneCanvasDragOver: dragSpies.handleLaneCanvasDragOver,
    handleLaneCanvasDrop: dragSpies.handleLaneCanvasDrop
  })
}))

function lane(index: number, placementCount = 0): LaneState {
  return {
    id: `lane-${index}`,
    index,
    name: `Lane ${index + 1}`,
    muted: false,
    solo: false,
    pan: 0,
    gain: 0.8,
    sends: [0, 0, 0, 0],
    placements: Array.from({ length: placementCount }, (_, placementIndex) => ({
      id: `placement-${index}-${placementIndex}`,
      samplePath: 'Drums/kick.wav',
      sampleName: 'kick.wav',
      startTick: placementIndex * 96,
      durationTicks: placementIndex === 0 ? 192 : 384,
      durationSeconds: 1
    }))
  }
}

function createOptions(overrides: {
  lanes?: LaneState[]
  currentTick?: number
  transportState?: PlayerTransportProps['transportState']
  songEndTick?: number
} = {}) {
  const arrangement: TrackerArrangementProps = {
    lanes: overrides.lanes ?? [lane(0, 1)],
    laneShouldDim: vi.fn(() => false),
    currentTick: overrides.currentTick ?? 0,
    missingSamplePaths: new Set(),
    onPlaceSampleDetailOnLane: vi.fn(),
    onMovePlacement: vi.fn(),
    onDuplicatePlacement: vi.fn(),
    onMovePlacementGroup: vi.fn(),
    onDuplicatePlacementGroup: vi.fn(),
    onRemovePlacementFromLane: vi.fn(),
    onRemovePlacements: vi.fn(),
    onSetLanePan: vi.fn(),
    onRenameLane: vi.fn(),
    onToggleLaneMute: vi.fn(),
    onToggleLaneSolo: vi.fn(),
    onAddLane: vi.fn(),
    onDeleteLane: vi.fn(),
    onDeleteEmptyLanes: vi.fn()
  }
  const transport = {
    transportState: overrides.transportState ?? 'stopped',
    songEndTick: overrides.songEndTick ?? 768,
    bpm: 120,
    masterGain: 0.8,
    masterMeter: emptyMasterMeterSnapshot(),
    canUndo: false,
    canRedo: false,
    onSetBpm: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onTransportPlay: vi.fn(),
    onTransportPause: vi.fn(),
    onTransportStop: vi.fn(),
    onTransportSkipBack: vi.fn(),
    onTransportJumpToEnd: vi.fn(),
    onTransportSeek: vi.fn()
  } satisfies PlayerTransportProps
  const browser = {
    onSearchChange: vi.fn(),
    onSelectCategory: vi.fn()
  }
  return { arrangement, transport, browser }
}

describe('useTrackerInteraction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps transport controls useful before the tracker scrollport is attached', () => {
    const options = createOptions()
    const { result } = renderHook(() => useTrackerInteraction(options))

    act(() => {
      result.current.onTransportStop()
      result.current.onTransportSkipBack()
      result.current.onTransportJumpToEnd()
      result.current.onContextDelete()
      result.current.onContextLocate()
      result.current.onRenameLane()
      result.current.onDeleteLane()
      result.current.onCancelLaneRename()
    })

    expect(options.transport.onTransportStop).toHaveBeenCalledOnce()
    expect(options.transport.onTransportSkipBack).toHaveBeenCalledOnce()
    expect(options.transport.onTransportJumpToEnd).toHaveBeenCalledOnce()
    expect(options.arrangement.onRemovePlacementFromLane).not.toHaveBeenCalled()
    expect(options.browser.onSearchChange).not.toHaveBeenCalled()
  })

  it('measures the timeline and keeps the first known duration for a repeated sample', async () => {
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1_000)
    const options = createOptions({ lanes: [lane(0, 2)] })
    let current!: ReturnType<typeof useTrackerInteraction>

    function Harness() {
      current = useTrackerInteraction(options)
      return <div ref={current.timelineRef} />
    }

    render(<Harness />)
    await waitFor(() => expect(current.laneContentWidth).toBe(1_000 - LANE_HEAD_WIDTH_PX))
    expect(current.pixelsPerTick).toBe((1_000 - LANE_HEAD_WIDTH_PX) / TRACKER_TOTAL_TICKS)
    expect(current.bubblePixelsPerSecond).toBeGreaterThan(0)
    expect(current.sampleDurationTicksByPath.get('Drums/kick.wav')).toBe(192)
    width.mockRestore()
  })

  it('returns the viewport to relevant transport positions', () => {
    let options = createOptions({ currentTick: 80, transportState: 'playing', songEndTick: 100 })
    const { result, rerender } = renderHook(() => useTrackerInteraction(options))
    const scrollport = { scrollWidth: 1_000, clientWidth: 300, scrollLeft: 80 }
    Object.defineProperty(result.current.lanesRef, 'current', { value: scrollport, configurable: true })

    options = createOptions({ currentTick: 0, transportState: 'stopped', songEndTick: 100 })
    rerender()
    expect(scrollport.scrollLeft).toBe(0)

    options = createOptions({
      currentTick: TRACKER_TOTAL_TICKS - 1,
      transportState: 'paused',
      songEndTick: TRACKER_TOTAL_TICKS
    })
    rerender()
    options = createOptions({
      currentTick: TRACKER_TOTAL_TICKS - 1,
      transportState: 'paused',
      songEndTick: TRACKER_TOTAL_TICKS - 50
    })
    rerender()
    expect(scrollport.scrollLeft).toBeGreaterThan(0)

    act(() => result.current.onTransportJumpToEnd())
    expect(options.transport.onTransportJumpToEnd).toHaveBeenCalledOnce()
    expect(scrollport.scrollLeft).toBeGreaterThan(0)
  })

  it('deletes and locates the selected sample event, including its flash lifecycle', () => {
    vi.useFakeTimers()
    const options = createOptions()
    const { result } = renderHook(() => useTrackerInteraction(options))

    act(() => result.current.setContextMenu({
      x: 10,
      y: 20,
      laneIndex: 0,
      placementId: 'placement-0-0',
      samplePath: 'Drums/kick.wav',
      sampleName: 'kick.wav'
    }))
    act(() => result.current.onContextDelete())
    expect(options.arrangement.onRemovePlacementFromLane).toHaveBeenCalledWith(0, 'placement-0-0')
    expect(result.current.contextMenu).toBeNull()

    act(() => result.current.setContextMenu({
      x: 10,
      y: 20,
      laneIndex: 0,
      placementId: 'placement-0-0',
      samplePath: 'Drums/kick.wav',
      sampleName: 'kick.wav'
    }))
    act(() => result.current.onContextLocate())
    expect(options.browser.onSearchChange).toHaveBeenCalledWith('kick')
    expect(options.browser.onSelectCategory).toHaveBeenCalledWith(undefined)
    expect(result.current.activeFlashPath).toBe('Drums/kick.wav')

    act(() => vi.advanceTimersByTime(1_800))
    expect(result.current.activeFlashPath).toBeNull()
    vi.useRealTimers()
  })

  it('renames lanes and confirms deletion only when a lane contains events', () => {
    const occupied = lane(0, 1)
    const empty = lane(1)
    const options = createOptions({ lanes: [occupied, empty] })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { result } = renderHook(() => useTrackerInteraction(options))

    act(() => result.current.onLaneContextMenu(0, occupied.name))
    act(() => result.current.onRenameLane())
    expect(result.current.renamingLaneIndex).toBe(0)
    act(() => result.current.onCommitLaneName(0, 'Kick'))
    expect(options.arrangement.onRenameLane).toHaveBeenCalledWith(0, 'Kick')
    expect(result.current.renamingLaneIndex).toBeNull()

    act(() => result.current.onLaneContextMenu(0, occupied.name))
    act(() => result.current.onDeleteLane())
    expect(confirm).toHaveBeenCalledWith('Delete Lane 1 and its 1 sample event?')
    expect(options.arrangement.onDeleteLane).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    act(() => result.current.onDeleteLane())
    expect(options.arrangement.onDeleteLane).toHaveBeenCalledWith(0)

    act(() => result.current.onLaneContextMenu(1, empty.name))
    act(() => result.current.onDeleteLane())
    expect(options.arrangement.onDeleteLane).toHaveBeenLastCalledWith(1)
    confirm.mockRestore()
  })
})
