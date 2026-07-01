import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TrackerView from './TrackerView'
import type { RecentProjectItem, SampleListItem } from '../../../shared/ipc'
import type { LaneState } from '../lib/playerShell'

const asyncNoop = async () => { /* empty */ }

const RECENT_PROJECTS: RecentProjectItem[] = [
  {
    path: 'c:/users/test/mixjam/club-night.mixjam',
    displayName: 'club-night',
    lastOpened: '2026-06-28T12:00:00.000Z'
  }
]

const SAMPLES: SampleListItem[] = [
  {
    id: 'C:/Samples/Drums/Kicks/kick_808.wav',
    name: 'kick_808.wav',
    filepath: 'C:/Samples/Drums/Kicks/kick_808.wav',
    category: 'Drums',
    durationSeconds: null,
    tags: ['Drums', 'WAV'],
    categoryId: null,
    tagIds: []
  }
]

const LANES: LaneState[] = Array.from({ length: 16 }, (_, index) => ({
  index,
  name: `Lane ${index + 1}`,
  muted: false,
  solo: false,
  pan: 0,
  clips: []
}))

const noop = () => undefined

const DEFAULT_CATEGORIES = [
  { id: 1, name: 'Bass', parentId: null },
  { id: 2, name: 'Drums', parentId: null },
  { id: 3, name: 'FX', parentId: null },
  { id: 4, name: 'Synth', parentId: null },
  { id: 5, name: 'Vocal', parentId: null },
  { id: 6, name: 'Loop', parentId: null },
  { id: 7, name: 'Percussion', parentId: null },
  { id: 8, name: 'Atmosphere', parentId: null }
]

const IDLE_PROGRESS = { status: 'idle' as const, phase: null, found: 0, processed: 0, total: 0 }

function renderTracker(props: Partial<Parameters<typeof TrackerView>[0]> = {}) {
  return render(
    <TrackerView
      recentProjects={[]}
      samples={[]}
      searchQuery=""
      loading={false}
      error={null}
      selectedSamplePath={null}
      lanes={LANES}
      laneShouldDim={() => false}
      transportState="stopped"
      currentTick={0}
      bpm={120}
      masterGain={0.8}
      masterLevelDb={-100}
      totalCount={0}
      onSetBpm={noop}
      onSetMasterGain={noop}
      onSelectSampleDetail={noop}
      onSearchChange={noop}
      onRescan={noop}
      onPlaceSampleDetailOnLane={noop}
      onMoveClipOnLane={noop}
      onRemoveClipFromLane={noop}
      onSetLanePan={noop}
      onPreviewSample={noop}
      onToggleLaneMute={noop}
      onToggleLaneSolo={noop}
      onTransportPlay={noop}
      onTransportPause={noop}
      onTransportStop={noop}
      onTransportSkipBack={noop}
      scanProgress={IDLE_PROGRESS}
      selectedCategoryId={undefined}
      selectedTagIds={[]}
      sortBy="filename"
      sortDir="asc"
      tags={[]}
      categories={DEFAULT_CATEGORIES}
      libraries={[]}
      onDbSearchChange={noop}
      onSelectCategory={noop}
      onToggleTagFilter={noop}
      onSortChange={noop}
      onStartScan={asyncNoop}
      onCreateTag={asyncNoop as never}
      onRenameTag={asyncNoop as never}
      onDeleteTag={asyncNoop as never}
      onCreateCategory={asyncNoop as never}
      onDeleteCategory={asyncNoop as never}
      onSaveLibrary={asyncNoop as never}
      onDeleteLibrary={asyncNoop as never}
      {...props}
    />
  )
}

describe('TrackerView', () => {
  it('renders the player shell regions and recent projects rail', () => {
    renderTracker({
      recentProjects: RECENT_PROJECTS,
      samples: SAMPLES,
      totalCount: 1
    })

    expect(screen.getByText('Recent Projects')).toBeInTheDocument()
    expect(screen.getByText('club-night')).toBeInTheDocument()
    expect(screen.getByText('Lane 1')).toBeInTheDocument()
    expect(screen.getByText('Song Controls')).toBeInTheDocument()
    expect(screen.getByRole('listbox', { name: /sample categories/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /kick_808/ })).toBeInTheDocument()
  })

  it('renders clip bubbles on a lane after placement', () => {
    const lanesWithClip: LaneState[] = LANES.map((lane) =>
      lane.index === 0
        ? {
            ...lane,
            clips: [
              {
                id: 'clip-1',
                samplePath: 'Drums/Kicks/kick_808.wav',
                sampleName: 'kick_808.wav',
                startTick: 0,
                durationTicks: 32,
                durationSeconds: null
              }
            ]
          }
        : lane
    )

    renderTracker({ lanes: lanesWithClip })
    expect(screen.getAllByTitle('kick_808.wav')).toHaveLength(1)
  })

  it('fires onPlaceSampleDetailOnLane when a sample tile is dropped onto a lane canvas', () => {
    const onPlaceSampleDetailOnLane = vi.fn()
    const detail = {
      name: 'kick_808.wav',
      path: 'Drums/Kicks/kick_808.wav',
      metadata: [],
      tags: [],
      duration: 0.5
    }

    renderTracker({ onPlaceSampleDetailOnLane })

    const laneCanvas = screen.getByRole('region', { name: 'Lane 1 track area' })
    fireEvent.drop(laneCanvas, {
      dataTransfer: { getData: () => JSON.stringify(detail), types: ['application/mixjam-sample'] }
    })
    expect(onPlaceSampleDetailOnLane).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'kick_808.wav', path: 'Drums/Kicks/kick_808.wav' }),
      0,
      expect.any(Number)
    )
  })

  it('fires onToggleLaneMute when clicking the M button', () => {
    const onToggleLaneMute = vi.fn()
    renderTracker({ onToggleLaneMute })

    fireEvent.click(screen.getByRole('button', { name: 'Mute Lane 1' }))
    expect(onToggleLaneMute).toHaveBeenCalledWith(0)
  })

  it('fires onToggleLaneSolo when clicking the S button', () => {
    const onToggleLaneSolo = vi.fn()
    renderTracker({ onToggleLaneSolo })

    fireEvent.click(screen.getByRole('button', { name: 'Solo Lane 2' }))
    expect(onToggleLaneSolo).toHaveBeenCalledWith(1)
  })

  it('shows active mute button state for muted lanes', () => {
    const mutedLanes = LANES.map((lane) =>
      lane.index === 3 ? { ...lane, muted: true } : lane
    )
    renderTracker({ lanes: mutedLanes })

    const muteBtn = screen.getByRole('button', { name: 'Mute Lane 4' })
    expect(muteBtn.className).toContain('tracker-lane-mute-active')
  })

  it('shows active solo button state for soloed lanes', () => {
    const soloLanes = LANES.map((lane) =>
      lane.index === 5 ? { ...lane, solo: true } : lane
    )
    renderTracker({
      lanes: soloLanes,
      laneShouldDim: (lane) => lane.index !== 5
    })

    const soloBtn = screen.getByRole('button', { name: 'Solo Lane 6' })
    expect(soloBtn.className).toContain('tracker-lane-solo-active')
  })

  it('dims non-soloed lanes when any lane is soloed', () => {
    const soloLanes = LANES.map((lane) =>
      lane.index === 0 ? { ...lane, solo: true } : lane
    )
    renderTracker({
      lanes: soloLanes,
      laneShouldDim: (lane) => lane.index !== 0
    })

    const dimmedLane = document.querySelector('.tracker-lane-dimmed')
    expect(dimmedLane).not.toBeNull()
  })

  it('fires transport callbacks when buttons are clicked', () => {
    const onTransportPlay = vi.fn()
    const onTransportPause = vi.fn()
    const onTransportStop = vi.fn()
    const onTransportSkipBack = vi.fn()

    renderTracker({
      onTransportPlay,
      onTransportPause,
      onTransportStop,
      onTransportSkipBack
    })

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(onTransportPlay).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(onTransportStop).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Skip Back' }))
    expect(onTransportSkipBack).toHaveBeenCalledTimes(1)
  })

  it('shows Pause button when transport is playing', () => {
    renderTracker({ transportState: 'playing' })

    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument()
  })

  it('fires onPreviewSample when clicking a sample tile', () => {
    const onPreviewSample = vi.fn()
    renderTracker({
      onPreviewSample,
      samples: [{ id: '/s/kick.wav', name: 'kick.wav', filepath: '/s/kick.wav', category: 'Drums', durationSeconds: 1.5, tags: [], categoryId: null, tagIds: [] }],
      totalCount: 1,
      categories: DEFAULT_CATEGORIES
    })

    // The accessible name is "kick 1.5s" (inner b + i text)
    const tile = screen.getByText(/kick/i).closest('button')!
    fireEvent.click(tile)
    expect(onPreviewSample).toHaveBeenCalledWith('/s/kick.wav')
  })

  it('shows context menu on right-clicking a clip', () => {
    const lanesWithClip: LaneState[] = LANES.map((lane) =>
      lane.index === 0
        ? { ...lane, clips: [{ id: 'clip-1', samplePath: 'Drums/kick.wav', sampleName: 'kick.wav', startTick: 0, durationTicks: 32, durationSeconds: 1 }] }
        : lane
    )
    renderTracker({ lanes: lanesWithClip })

    const clip = screen.getByTitle('kick.wav')
    fireEvent.contextMenu(clip)

    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Locate in Browser' })).toBeInTheDocument()
  })

  it('calls onRemoveClipFromLane when Delete is clicked in context menu', () => {
    const onRemoveClipFromLane = vi.fn()
    const lanesWithClip: LaneState[] = LANES.map((lane) =>
      lane.index === 0
        ? { ...lane, clips: [{ id: 'clip-1', samplePath: 'Drums/kick.wav', sampleName: 'kick.wav', startTick: 0, durationTicks: 32, durationSeconds: 1 }] }
        : lane
    )
    renderTracker({ lanes: lanesWithClip, onRemoveClipFromLane })

    const clip = screen.getByTitle('kick.wav')
    fireEvent.contextMenu(clip)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))

    expect(onRemoveClipFromLane).toHaveBeenCalledWith(0, 'clip-1')
  })

  it('calls onMoveClipOnLane when a clip is dragged and dropped on another lane', () => {
    const onMoveClipOnLane = vi.fn()
    const lanesWithClip: LaneState[] = LANES.map((lane) =>
      lane.index === 0
        ? { ...lane, clips: [{ id: 'clip-1', samplePath: 'Drums/kick.wav', sampleName: 'kick.wav', startTick: 0, durationTicks: 32, durationSeconds: 1 }] }
        : lane
    )
    renderTracker({ lanes: lanesWithClip, onMoveClipOnLane })

    const canvas = screen.getByRole('region', { name: 'Lane 3 track area' })
    // Simulate drag over first (to allow drop) with matching types
    fireEvent.dragOver(canvas, {
      dataTransfer: { types: ['application/mixjam-clip'], getData: () => '' }
    })
    fireEvent.drop(canvas, {
      dataTransfer: {
        types: ['application/mixjam-clip'],
        getData: (type: string) => type === 'application/mixjam-clip' ? JSON.stringify({ clipId: 'clip-1' }) : ''
      }
    })

    expect(onMoveClipOnLane).toHaveBeenCalledWith('clip-1', 2, expect.any(Number))
  })

  it('fires onSetLanePan on pan dial mouse interaction', () => {
    const onSetLanePan = vi.fn()
    renderTracker({ onSetLanePan })

    const panDial = screen.getByRole('slider', { name: 'Pan Lane 1' })
    fireEvent.mouseDown(panDial, { clientX: 100, button: 0 })
    // Pan listener is attached to window, not the element
    fireEvent.mouseMove(window, { clientX: 150 })
    fireEvent.mouseUp(window)

    expect(onSetLanePan).toHaveBeenCalledWith(0, expect.any(Number))
  })

  it('transport-button-play class only appears when playing', () => {
    renderTracker({ transportState: 'stopped' })
    const btn = screen.getByRole('button', { name: 'Play' })
    expect(btn.className).not.toContain('transport-button-play')
  })

  it('transport-button-play class present when playing', () => {
    renderTracker({ transportState: 'playing' })
    const btn = screen.getByRole('button', { name: 'Pause' })
    expect(btn.className).toContain('transport-button-play')
  })
})
