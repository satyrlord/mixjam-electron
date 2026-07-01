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
    // Clips are rendered on canvas; verify via data attributes on the canvas container.
    const containers = document.querySelectorAll('[data-clip-count]')
    const withClips = Array.from(containers).filter((el) => el.getAttribute('data-clip-count') !== '0')
    expect(withClips).toHaveLength(1)
    expect(withClips[0].getAttribute('data-clip-names')).toBe('kick_808.wav')
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

    // Clips are on canvas; fire contextMenu on the canvas container within lane 1.
    const canvasContainer = document.querySelector('[data-clip-names="kick.wav"]')!
    fireEvent.contextMenu(canvasContainer)

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

    // Clips are on canvas; fire contextMenu on the canvas container.
    const canvasContainer = document.querySelector('[data-clip-names="kick.wav"]')!
    fireEvent.contextMenu(canvasContainer)
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

  // --- AC-002c: Empty state for Recent Projects rail ---
  it('AC-002c: shows informational empty state when recentProjects is empty', () => {
    renderTracker({ recentProjects: [] })

    expect(screen.getByText(/no mixjam projects yet/i)).toBeInTheDocument()
  })

  // --- AC-004a: Song Controls rail shows Volume, dB meter, BPM slider ---
  it('AC-004a: Song Controls rail renders Master Volume slider, dB meter, and BPM slider', () => {
    renderTracker({})

    expect(screen.getByRole('slider', { name: 'Master Volume' })).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: 'Master loudness' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'BPM' })).toBeInTheDocument()
  })

  // --- AC-004b: BPM slider ranges 50-200, defaults to 120 ---
  it('AC-004b: BPM slider has min=50, max=200, and initializes at 120', () => {
    renderTracker({ bpm: 120 })

    const slider = screen.getByRole('slider', { name: 'BPM' })
    expect(slider).toHaveAttribute('min', '50')
    expect(slider).toHaveAttribute('max', '200')
    expect(slider).toHaveValue('120')
  })

  // --- AC-005: 16 lanes render ---
  it('AC-005: renders 16 lanes with M, S buttons and pan knob', () => {
    renderTracker({})

    const laneElements = document.querySelectorAll('.tracker-lane')
    expect(laneElements).toHaveLength(16)

    // Each lane has M, S, and pan
    expect(screen.getByRole('button', { name: 'Mute Lane 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Solo Lane 16' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Pan Lane 16' })).toBeInTheDocument()
  })

  // --- AC-010: Playhead visible during playback ---
  it('AC-010: playhead is visible during playback at correct position', () => {
    renderTracker({ transportState: 'playing', currentTick: 64 })

    const playhead = document.querySelector('.tracker-playhead')
    expect(playhead).not.toBeNull()
    // currentTick=64 out of totalTicks=256 => 0.25 fraction
    expect(playhead!.getAttribute('style')).toContain('0.25')
  })

  it('AC-010: playhead is hidden when transport is stopped', () => {
    renderTracker({ transportState: 'stopped', currentTick: 0 })

    const playhead = document.querySelector('.tracker-playhead')
    expect(playhead).toBeNull()
  })

  // --- AC-011: Ruler tick marks and bar numbers ---
  it('AC-011: ruler displays bar numbers (1, 5, 9, 13) and tick marks', () => {
    renderTracker({})

    const ruler = document.querySelector('.tracker-ruler')
    expect(ruler).not.toBeNull()

    const barLabels = document.querySelectorAll('.tracker-ruler-bar')
    expect(barLabels.length).toBeGreaterThan(0)
    // First bar label is 1
    expect(barLabels[0].textContent).toBe('1')
    // Second bar label is 5 (every 4 ticks/32 grouping)
    expect(barLabels[1].textContent).toBe('5')
  })

  // --- AC-015: BPM click-to-edit ---
  it('AC-015: clicking BPM opens editor, typing new value and pressing Enter commits it', () => {
    const onSetBpm = vi.fn()
    renderTracker({ bpm: 120, onSetBpm })

    // Initially shows BPM button
    const bpmBtn = screen.getByRole('button', { name: 'Edit BPM' })
    expect(bpmBtn).toHaveTextContent('120 BPM')

    // Click to start editing
    fireEvent.click(bpmBtn)

    // Input appears
    const input = screen.getByLabelText('Edit BPM') as HTMLInputElement
    expect(input.tagName).toBe('INPUT')
    expect(input.value).toBe('120')

    // Change to 140 and press Enter
    fireEvent.change(input, { target: { value: '140' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSetBpm).toHaveBeenCalledWith(140)
  })

  it('AC-015: pressing Escape discards BPM edit without committing', () => {
    const onSetBpm = vi.fn()
    renderTracker({ bpm: 120, onSetBpm })

    fireEvent.click(screen.getByRole('button', { name: 'Edit BPM' }))
    const input = screen.getByLabelText('Edit BPM')
    fireEvent.change(input, { target: { value: '999' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(onSetBpm).not.toHaveBeenCalled()
    // Button is back
    expect(screen.getByRole('button', { name: 'Edit BPM' })).toHaveTextContent('120 BPM')
  })

  // --- AC-015a: BPM sync between Middle Strip and Song Controls ---
  it('AC-015a: Song Controls BPM slider reflects the same bpm prop as the Middle Strip', () => {
    renderTracker({ bpm: 145 })

    // Middle strip shows the current BPM
    expect(screen.getByRole('button', { name: 'Edit BPM' })).toHaveTextContent('145 BPM')
    // Song Controls slider also reflects the value
    expect(screen.getByRole('slider', { name: 'BPM' })).toHaveValue('145')
  })

  it('AC-015a: changing BPM via Song Controls slider calls onSetBpm', () => {
    const onSetBpm = vi.fn()
    renderTracker({ bpm: 120, onSetBpm })

    const slider = screen.getByRole('slider', { name: 'BPM' })
    fireEvent.change(slider, { target: { value: '90' } })
    expect(onSetBpm).toHaveBeenCalledWith(90)
  })

  // --- AC-016: Browser vertical resize handle ---
  it('AC-016: browser vertical resize handle is present and draggable', () => {
    renderTracker({})

    const handle = screen.getByRole('separator', { name: 'Resize category tree' })
    expect(handle).toBeInTheDocument()

    // Simulate drag
    fireEvent.mouseDown(handle, { clientX: 152 })
    fireEvent.mouseMove(window, { clientX: 200 })
    fireEvent.mouseUp(window)

    // The cats panel should have width updated via style
    const cats = document.querySelector('.cats') as HTMLElement
    expect(cats).not.toBeNull()
    // Width should have increased from 152 (default) by the delta (48)
    expect(parseInt(cats.style.width)).toBe(200)
  })

  it('calls onDbSearchChange and onSelectCategory when Locate in Browser is clicked', () => {
    const onDbSearchChange = vi.fn()
    const onSelectCategory = vi.fn()
    const lanesWithClip: LaneState[] = LANES.map((lane) =>
      lane.index === 0
        ? { ...lane, clips: [{ id: 'clip-1', samplePath: 'Drums/kick.wav', sampleName: 'kick.wav', startTick: 0, durationTicks: 32, durationSeconds: 1 }] }
        : lane
    )
    renderTracker({ lanes: lanesWithClip, onDbSearchChange, onSelectCategory })

    const canvasContainer = document.querySelector('[data-clip-names="kick.wav"]')!
    fireEvent.contextMenu(canvasContainer)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Locate in Browser' }))

    expect(onDbSearchChange).toHaveBeenCalledWith('kick')
    expect(onSelectCategory).toHaveBeenCalledWith(undefined)
  })

  it('sets drag data when a sample tile drag starts', () => {
    renderTracker({
      samples: [{ id: '/s/kick.wav', name: 'kick.wav', filepath: '/s/kick.wav', category: 'Drums', durationSeconds: 1.5, tags: [], categoryId: null, tagIds: [] }],
      totalCount: 1
    })

    const tile = screen.getByText(/kick/i).closest('button')!
    // jsdom DragEvent does not populate dataTransfer; create one manually
    const dataTransfer = { setData: vi.fn(), effectAllowed: '' }
    const nativeEvent = new Event('dragstart', { bubbles: true })
    Object.defineProperty(nativeEvent, 'dataTransfer', { value: dataTransfer, configurable: true })
    tile.dispatchEvent(nativeEvent)
    expect(dataTransfer.setData).toHaveBeenCalledWith('application/mixjam-sample', expect.any(String))
  })

  it('handles horizontal browser resize drag', () => {
    renderTracker({})

    const handle = screen.getByRole('separator', { name: 'Resize sample browser' })
    fireEvent.mouseDown(handle, { clientY: 200 })
    fireEvent.mouseMove(window, { clientY: 100 })
    fireEvent.mouseUp(window)
  })

  it('renders sample color from categoryId when no category filter is active', () => {
    renderTracker({
      samples: [{ id: '/s/kick.wav', name: 'kick.wav', filepath: '/s/kick.wav', category: 'Drums', durationSeconds: 1.5, tags: [], categoryId: 2, tagIds: [] }],
      totalCount: 1,
      categories: DEFAULT_CATEGORIES
    })

    const tile = screen.getByText(/kick/i).closest('button')! as HTMLElement
    expect(tile.style.background).toBeTruthy()
  })

  it('renders subcategory chips and All button when a category is selected', () => {
    const categoriesWithChildren = [
      ...DEFAULT_CATEGORIES,
      { id: 9, name: 'SubBass', parentId: 1 }
    ]
    renderTracker({
      categories: categoriesWithChildren,
      selectedCategoryId: 1
    })

    expect(screen.getByText('All')).toBeInTheDocument()
    expect(screen.getByText('SubBass')).toBeInTheDocument()
  })

  it('renders tag filter chips and calls onToggleTagFilter on click', () => {
    const onToggleTagFilter = vi.fn()
    renderTracker({
      tags: [{ id: 5, name: 'Cool', color: '#f00' }],
      selectedTagIds: [5],
      onToggleTagFilter
    })

    const chip = screen.getByText(/Cool/)
    fireEvent.click(chip.closest('button')!)
    expect(onToggleTagFilter).toHaveBeenCalledWith(5)
  })

  it('shows error message when samples fail to load', () => {
    renderTracker({ error: 'Database locked', loading: false, samples: [] })

    expect(screen.getByText('Database locked')).toBeInTheDocument()
  })
})
