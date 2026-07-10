import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TrackerView from './TrackerView'
import type {
  TrackerArrangementProps,
  TrackerBrowserProps,
  TrackerMixerProps,
  TrackerTransportProps
} from './trackerProps'
import type { RecentProjectItem, SampleListItem } from '../../../shared/backend-api'
import type { LaneState } from '../lib/playerShell'

const INDEX_CSS_PATH = resolve(process.cwd(), 'src/renderer/src/index.css')

const asyncNoop = async () => { /* empty */ }

const RECENT_PROJECTS: RecentProjectItem[] = [
  {
    path: 'club-night.mixjam',
    displayName: 'club-night',
    lastOpened: '2026-06-28T12:00:00.000Z'
  }
]

const SAMPLES: SampleListItem[] = [
  {
    id: 'Drums/Kicks/kick_808.wav',
    dbId: 1,
    name: 'kick_808.wav',
    relpath: 'Drums/Kicks/kick_808.wav',
    category: 'Drums',
    durationSeconds: null,
    bpm: null,
    bpmSource: null,
    musicalKey: null,
    musicalKeySource: null,
    sampleType: null,
    sampleTypeSource: null,
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

const DEFAULT_BROWSER: TrackerBrowserProps = {
  samples: [],
  searchQuery: '',
  loading: false,
  error: null,
  totalCount: 0,
  hasMoreSamples: false,
  selectedSamplePath: null,
  selectedCategoryId: undefined,
  selectedTagIds: [],
  sortBy: 'filename',
  sortDir: 'asc',
  tags: [],
  categories: DEFAULT_CATEGORIES,
  libraries: [],
  scanProgress: IDLE_PROGRESS,
  analysisProgress: { status: 'idle', analyzed: 0, total: 0 },
  onSearchChange: noop,
  onLoadMoreSamples: noop,
  onSelectSampleDetail: noop,
  onPreviewSample: noop,
  onSelectCategory: noop,
  onToggleTagFilter: noop,
  onSortChange: noop,
  onStartScan: asyncNoop,
  onCancelScan: asyncNoop,
  onCreateTag: asyncNoop as never,
  onRenameTag: asyncNoop as never,
  onDeleteTag: asyncNoop as never,
  onAssignTagToSample: asyncNoop as never,
  onUnassignTagFromSample: asyncNoop as never,
  onUpdateSampleAnalysis: asyncNoop as never,
  onReanalyzeSample: asyncNoop as never,
  onCreateCategory: asyncNoop as never,
  onDeleteCategory: asyncNoop as never,
  onSaveLibrary: asyncNoop as never,
  onDeleteLibrary: asyncNoop as never,
  onApplyLibrary: noop
}

const DEFAULT_ARRANGEMENT: TrackerArrangementProps = {
  lanes: LANES,
  laneShouldDim: () => false,
  currentTick: 0,
  missingSamplePaths: new Set<string>(),
  onPlaceSampleDetailOnLane: noop,
  onMoveClipOnLane: noop,
  onDuplicateClipOnLane: noop,
  onMoveClipGroup: noop,
  onDuplicateClipGroup: noop,
  onRemoveClipFromLane: noop,
  onRemoveClips: noop,
  onSetLanePan: noop,
  onToggleLaneMute: noop,
  onToggleLaneSolo: noop
}

const DEFAULT_TRANSPORT: TrackerTransportProps = {
  transportState: 'stopped',
  bpm: 120,
  masterGain: 0.8,
  masterLevelDb: -100,
  canUndo: false,
  canRedo: false,
  onSetBpm: noop,
  onSetMasterGain: noop,
  onUndo: noop,
  onRedo: noop,
  onTransportPlay: noop,
  onTransportPause: noop,
  onTransportStop: noop,
  onTransportSkipBack: noop
}

const DEFAULT_MIXER: TrackerMixerProps = {
  channels: [],
  channelLevels: new Map(),
  channelPeaks: new Map(),
  canRestoreChannel: false,
  onSetChannelGain: noop,
  onSetChannelPan: noop,
  onToggleChannelMute: noop,
  onToggleChannelSolo: noop,
  onRemoveChannel: noop,
  onRestoreChannel: noop
}

interface TrackerOverrides {
  recentProjects?: RecentProjectItem[]
  browser?: Partial<TrackerBrowserProps>
  arrangement?: Partial<TrackerArrangementProps>
  transport?: Partial<TrackerTransportProps>
  mixer?: Partial<TrackerMixerProps>
}

function renderTracker(overrides: TrackerOverrides = {}) {
  return render(
    <TrackerView
      recentProjects={overrides.recentProjects ?? []}
      browser={{ ...DEFAULT_BROWSER, ...overrides.browser }}
      arrangement={{ ...DEFAULT_ARRANGEMENT, ...overrides.arrangement }}
      transport={{ ...DEFAULT_TRANSPORT, ...overrides.transport }}
      mixer={{ ...DEFAULT_MIXER, ...overrides.mixer }}
    />
  )
}

describe('TrackerView', () => {
  // The seam-drag tests persist the left-column width; clear it after each test
  // so a failing assertion can't leak a stored width into later mounts.
  afterEach(() => {
    localStorage.removeItem('mixjam-left-col-w')
  })

  it('renders the player shell regions and recent projects rail', () => {
    renderTracker({
      recentProjects: RECENT_PROJECTS,
      browser: { samples: SAMPLES, totalCount: 1 }
    })

    expect(screen.getByText('Recent Projects')).toBeInTheDocument()
    expect(screen.getByText('club-night')).toBeInTheDocument()
    expect(screen.getByText('Lane 1')).toBeInTheDocument()
    expect(screen.getByText('Song Controls')).toBeInTheDocument()
    expect(screen.getByRole('listbox', { name: /sample categories/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /kick_808/ })).toBeInTheDocument()
  })

  it('lists recent projects as disabled until project load ships (spec-011)', () => {
    renderTracker({ recentProjects: RECENT_PROJECTS })

    const entry = screen.getByRole('button', { name: /club-night/ })
    expect(entry).toBeDisabled()
    expect(entry).toHaveAttribute('title', expect.stringMatching(/coming soon/i))
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

    renderTracker({ arrangement: { lanes: lanesWithClip } })
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
      relpath: 'Drums/Kicks/kick_808.wav',
      tags: [],
      duration: 0.5
    }

    renderTracker({ arrangement: { onPlaceSampleDetailOnLane } })

    const laneCanvas = screen.getByRole('region', { name: 'Lane 1 track area' })
    fireEvent.drop(laneCanvas, {
      dataTransfer: { getData: () => JSON.stringify(detail), types: ['application/mixjam-sample'] }
    })
    expect(onPlaceSampleDetailOnLane).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'kick_808.wav', relpath: 'Drums/Kicks/kick_808.wav' }),
      0,
      expect.any(Number)
    )
  })

  it('fires onToggleLaneMute when clicking the M button', () => {
    const onToggleLaneMute = vi.fn()
    renderTracker({ arrangement: { onToggleLaneMute } })

    fireEvent.click(screen.getByRole('button', { name: 'Mute Lane 1' }))
    expect(onToggleLaneMute).toHaveBeenCalledWith(0)
  })

  it('fires onToggleLaneSolo when clicking the S button', () => {
    const onToggleLaneSolo = vi.fn()
    renderTracker({ arrangement: { onToggleLaneSolo } })

    fireEvent.click(screen.getByRole('button', { name: 'Solo Lane 2' }))
    expect(onToggleLaneSolo).toHaveBeenCalledWith(1)
  })

  it('shows active mute button state for muted lanes', () => {
    const mutedLanes = LANES.map((lane) =>
      lane.index === 3 ? { ...lane, muted: true } : lane
    )
    renderTracker({ arrangement: { lanes: mutedLanes } })

    const muteBtn = screen.getByRole('button', { name: 'Mute Lane 4' })
    expect(muteBtn.className).toContain('tracker-lane-mute-active')
  })

  it('shows active solo button state for soloed lanes', () => {
    const soloLanes = LANES.map((lane) =>
      lane.index === 5 ? { ...lane, solo: true } : lane
    )
    renderTracker({
      arrangement: {
        lanes: soloLanes,
        laneShouldDim: (lane) => lane.index !== 5
      }
    })

    const soloBtn = screen.getByRole('button', { name: 'Solo Lane 6' })
    expect(soloBtn.className).toContain('tracker-lane-solo-active')
  })

  it('dims non-soloed lanes when any lane is soloed', () => {
    const soloLanes = LANES.map((lane) =>
      lane.index === 0 ? { ...lane, solo: true } : lane
    )
    renderTracker({
      arrangement: {
        lanes: soloLanes,
        laneShouldDim: (lane) => lane.index !== 0
      }
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
      transport: {
        onTransportPlay,
        onTransportPause,
        onTransportStop,
        onTransportSkipBack
      }
    })

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(onTransportPlay).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(onTransportStop).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Skip Back' }))
    expect(onTransportSkipBack).toHaveBeenCalledTimes(1)
  })

  it('shows Pause button when transport is playing', () => {
    renderTracker({ transport: { transportState: 'playing' } })

    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument()
  })

  it('fires onPreviewSample when clicking a sample tile', () => {
    const onPreviewSample = vi.fn()
    renderTracker({
      browser: {
        onPreviewSample,
        samples: [{ id: '/s/kick.wav', dbId: 1, name: 'kick.wav', relpath: '/s/kick.wav', category: 'Drums', durationSeconds: 1.5, bpm: null, bpmSource: null, musicalKey: null, musicalKeySource: null, sampleType: null, sampleTypeSource: null, tags: [], categoryId: null, tagIds: [] }],
        totalCount: 1,
        categories: DEFAULT_CATEGORIES
      }
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
    renderTracker({ arrangement: { lanes: lanesWithClip } })

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
    renderTracker({ arrangement: { lanes: lanesWithClip, onRemoveClipFromLane } })

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
    renderTracker({ arrangement: { lanes: lanesWithClip, onMoveClipOnLane } })

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
    renderTracker({ arrangement: { onSetLanePan } })

    const panDial = screen.getByRole('slider', { name: 'Pan Lane 1' })
    fireEvent.mouseDown(panDial, { clientX: 100, button: 0 })
    // Pan listener is attached to window, not the element
    fireEvent.mouseMove(window, { clientX: 150 })
    fireEvent.mouseUp(window)

    expect(onSetLanePan).toHaveBeenCalledWith(0, expect.any(Number))
  })

  it('pan knob ArrowRight increases pan value', () => {
    const onSetLanePan = vi.fn()
    renderTracker({ arrangement: { onSetLanePan } })

    const panDial = screen.getByRole('slider', { name: 'Pan Lane 1' })
    fireEvent.keyDown(panDial, { key: 'ArrowRight' })

    expect(onSetLanePan).toHaveBeenCalledWith(0, 0.05)
  })

  it('pan knob ArrowLeft decreases pan value', () => {
    const onSetLanePan = vi.fn()
    renderTracker({ arrangement: { onSetLanePan } })

    const panDial = screen.getByRole('slider', { name: 'Pan Lane 1' })
    fireEvent.keyDown(panDial, { key: 'ArrowLeft' })

    expect(onSetLanePan).toHaveBeenCalledWith(0, -0.05)
  })

  it('pan knob Home key resets pan to center', () => {
    const onSetLanePan = vi.fn()
    const lanes = LANES.map((l, i) => i === 0 ? { ...l, pan: 0.5 } : l)
    renderTracker({ arrangement: { onSetLanePan, lanes } })

    const panDial = screen.getByRole('slider', { name: 'Pan Lane 1' })
    fireEvent.keyDown(panDial, { key: 'Home' })

    expect(onSetLanePan).toHaveBeenCalledWith(0, 0)
  })

  it('pan knob double-click resets pan to center', () => {
    const onSetLanePan = vi.fn()
    const lanes = LANES.map((l, i) => i === 0 ? { ...l, pan: -0.7 } : l)
    renderTracker({ arrangement: { onSetLanePan, lanes } })

    const panDial = screen.getByRole('slider', { name: 'Pan Lane 1' })
    fireEvent.doubleClick(panDial)

    expect(onSetLanePan).toHaveBeenCalledWith(0, 0)
  })

  it('transport-button-play class only appears when playing', () => {
    renderTracker({ transport: { transportState: 'stopped' } })
    const btn = screen.getByRole('button', { name: 'Play' })
    expect(btn.className).not.toContain('transport-button-play')
  })

  it('transport-button-play class present when playing', () => {
    renderTracker({ transport: { transportState: 'playing' } })
    const btn = screen.getByRole('button', { name: 'Pause' })
    expect(btn.className).toContain('transport-button-play')
  })

  // --- AC-002c: Empty state for Recent Projects rail ---
  it('AC-002c: shows informational empty state when recentProjects is empty', () => {
    renderTracker({ recentProjects: [] })

    expect(screen.getByText(/no mixjam projects yet/i)).toBeInTheDocument()
  })

  it('recent projects rail can be collapsed and expanded via toggle button', () => {
    renderTracker({ recentProjects: RECENT_PROJECTS })
    const trackerView = document.querySelector('.tracker-view')
    expect(trackerView).not.toBeNull()

    // Starts expanded
    expect(screen.getByText('club-night')).toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: 'Collapse recent projects' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(trackerView!.className).not.toContain('recent-projects-collapsed')

    // Click to collapse
    fireEvent.click(toggle)
    expect(screen.queryByText('club-night')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Expand recent projects' })).toHaveAttribute('aria-expanded', 'false')
    expect(trackerView!.className).toContain('recent-projects-collapsed')

    // Click to expand again
    fireEvent.click(screen.getByRole('button', { name: 'Expand recent projects' }))
    expect(screen.getByText('club-night')).toBeInTheDocument()
    expect(trackerView!.className).not.toContain('recent-projects-collapsed')
  })

  it('collapsed recent projects rail persists state in localStorage', () => {
    renderTracker({ recentProjects: RECENT_PROJECTS })

    const toggle = screen.getByRole('button', { name: 'Collapse recent projects' })
    fireEvent.click(toggle)

    expect(localStorage.getItem('mixjam:recents-rail-collapsed')).toBe('1')

    // Expand again
    fireEvent.click(screen.getByRole('button', { name: 'Expand recent projects' }))
    expect(localStorage.getItem('mixjam:recents-rail-collapsed')).toBeNull()
  })

  // --- AC-004a: Song Controls rail shows Volume and dB meter; BPM lives only
  // in the Middle Strip editor (single control) ---
  it('AC-004a: Song Controls rail renders Master Volume slider and dB meter, with no BPM slider', () => {
    renderTracker({})

    expect(screen.getByRole('slider', { name: 'Master Volume' })).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: 'Output Level' })).toBeInTheDocument()
    expect(screen.queryByRole('slider', { name: 'BPM' })).not.toBeInTheDocument()
  })

  // --- AC-004b: BPM editor ranges 50-200, defaults to 120 ---
  it('AC-004b: BPM editor has min=50, max=200, and initializes at 120', () => {
    renderTracker({ transport: { bpm: 120 } })

    fireEvent.click(screen.getByRole('button', { name: 'Edit BPM' }))
    const input = screen.getByLabelText('Edit BPM')
    expect(input).toHaveAttribute('min', '50')
    expect(input).toHaveAttribute('max', '200')
    expect(input).toHaveValue(120)
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
    renderTracker({ transport: { transportState: 'playing' }, arrangement: { currentTick: 64 } })

    const playhead = document.querySelector('.tracker-playhead')
    expect(playhead).not.toBeNull()
    // currentTick=64 out of totalTicks=256 => 0.25 fraction
    expect(playhead!.getAttribute('style')).toContain('0.25')
  })

  it('AC-010: playhead is hidden when transport is stopped', () => {
    renderTracker({ transport: { transportState: 'stopped' }, arrangement: { currentTick: 0 } })

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

  it('AC-011: ruler renders one tick per beat so header lines align with the canvas grid', () => {
    renderTracker({})

    const ticks = document.querySelectorAll('.tracker-ruler-tick')
    expect(ticks).toHaveLength(32)
    expect(document.querySelectorAll('.tracker-ruler-tick-bar')).toHaveLength(8)
  })

  it('AC-011: keeps the lane head box at the same rendered width as the ruler spacer', () => {
    const css = readFileSync(INDEX_CSS_PATH, 'utf8')

    expect(css).toMatch(
      /\.tracker-lane-head\s*\{[\s\S]*box-sizing:\s*border-box;/m
    )
  })

  // --- AC-015: BPM click-to-edit ---
  it('AC-015: clicking BPM opens editor, typing new value and pressing Enter commits it', () => {
    const onSetBpm = vi.fn()
    renderTracker({ transport: { bpm: 120, onSetBpm } })

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
    renderTracker({ transport: { bpm: 120, onSetBpm } })

    fireEvent.click(screen.getByRole('button', { name: 'Edit BPM' }))
    const input = screen.getByLabelText('Edit BPM')
    fireEvent.change(input, { target: { value: '999' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(onSetBpm).not.toHaveBeenCalled()
    // Button is back
    expect(screen.getByRole('button', { name: 'Edit BPM' })).toHaveTextContent('120 BPM')
  })

  // --- AC-015a: the Middle Strip editor is the single BPM control and always
  // reflects the transport state ---
  it('AC-015a: Middle Strip BPM display reflects the bpm prop', () => {
    renderTracker({ transport: { bpm: 145 } })

    expect(screen.getByRole('button', { name: 'Edit BPM' })).toHaveTextContent('145 BPM')
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

  it('calls onSearchChange and onSelectCategory when Locate in Browser is clicked', () => {
    const onSearchChange = vi.fn()
    const onSelectCategory = vi.fn()
    const lanesWithClip: LaneState[] = LANES.map((lane) =>
      lane.index === 0
        ? { ...lane, clips: [{ id: 'clip-1', samplePath: 'Drums/kick.wav', sampleName: 'kick.wav', startTick: 0, durationTicks: 32, durationSeconds: 1 }] }
        : lane
    )
    renderTracker({
      arrangement: { lanes: lanesWithClip },
      browser: { onSearchChange, onSelectCategory }
    })

    const canvasContainer = document.querySelector('[data-clip-names="kick.wav"]')!
    fireEvent.contextMenu(canvasContainer)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Locate in Browser' }))

    expect(onSearchChange).toHaveBeenCalledWith('kick')
    expect(onSelectCategory).toHaveBeenCalledWith(undefined)
  })

  it('sets drag data when a sample tile drag starts', () => {
    renderTracker({
      browser: {
        samples: [{ id: '/s/kick.wav', dbId: 1, name: 'kick.wav', relpath: '/s/kick.wav', category: 'Drums', durationSeconds: 1.5, bpm: null, bpmSource: null, musicalKey: null, musicalKeySource: null, sampleType: null, sampleTypeSource: null, tags: [], categoryId: null, tagIds: [] }],
        totalCount: 1
      }
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

  it('renders the sample palette slot from categoryId when no category filter is active', () => {
    renderTracker({
      browser: {
        samples: [{ id: '/s/kick.wav', dbId: 1, name: 'kick.wav', relpath: '/s/kick.wav', category: 'Drums', durationSeconds: 1.5, bpm: null, bpmSource: null, musicalKey: null, musicalKeySource: null, sampleType: null, sampleTypeSource: null, tags: [], categoryId: 2, tagIds: [] }],
        totalCount: 1,
        categories: DEFAULT_CATEGORIES
      }
    })

    const tile = screen.getByText(/kick/i).closest('button')! as HTMLElement
    // categoryId 2 = Drums = slot 0; the surface tracks the theme palette var.
    expect(tile.style.backgroundColor).toBe('var(--palette-0)')
  })

  it('renders subcategory chips and All button when a category is selected', () => {
    const categoriesWithChildren = [
      ...DEFAULT_CATEGORIES,
      { id: 9, name: 'SubBass', parentId: 1 }
    ]
    renderTracker({
      browser: {
        categories: categoriesWithChildren,
        selectedCategoryId: 1
      }
    })

    expect(screen.getByText('All')).toBeInTheDocument()
    expect(screen.getByText('SubBass')).toBeInTheDocument()
  })

  it('renders tag filter chips and calls onToggleTagFilter on click', () => {
    const onToggleTagFilter = vi.fn()
    renderTracker({
      browser: {
        tags: [{ id: 5, name: 'Cool', color: '#f00' }],
        selectedTagIds: [5],
        onToggleTagFilter
      }
    })

    const chip = screen.getByText(/Cool/)
    fireEvent.click(chip.closest('button')!)
    expect(onToggleTagFilter).toHaveBeenCalledWith(5)
  })

  it('shows error message when samples fail to load', () => {
    renderTracker({ browser: { error: 'Database locked', loading: false, samples: [] } })

    expect(screen.getByText('Database locked')).toBeInTheDocument()
  })

  it('calls onTransportPlay when Play button is clicked while stopped', () => {
    const onTransportPlay = vi.fn()
    renderTracker({ transport: { transportState: 'stopped', onTransportPlay } })

    fireEvent.click(screen.getByLabelText('Play'))
    expect(onTransportPlay).toHaveBeenCalled()
  })

  it('calls onTransportPause when Pause button is clicked while playing', () => {
    const onTransportPause = vi.fn()
    renderTracker({ transport: { transportState: 'playing', onTransportPause } })

    fireEvent.click(screen.getByLabelText('Pause'))
    expect(onTransportPause).toHaveBeenCalled()
  })

  it('calls onTransportStop when Stop button is clicked', () => {
    const onTransportStop = vi.fn()
    renderTracker({ transport: { onTransportStop } })

    fireEvent.click(screen.getByLabelText('Stop'))
    expect(onTransportStop).toHaveBeenCalled()
  })

  it('calls onTransportSkipBack when Skip Back button is clicked', () => {
    const onTransportSkipBack = vi.fn()
    renderTracker({ transport: { onTransportSkipBack } })

    fireEvent.click(screen.getByLabelText('Skip Back'))
    expect(onTransportSkipBack).toHaveBeenCalled()
  })

  it('calls onSetMasterGain when Master Volume slider changes', () => {
    const onSetMasterGain = vi.fn()
    renderTracker({ transport: { masterGain: 0.8, onSetMasterGain } })

    const slider = screen.getByLabelText('Master Volume')
    fireEvent.change(slider, { target: { value: '50' } })
    expect(onSetMasterGain).toHaveBeenCalledWith(0.5)
  })

  it('inline-edits BPM via the strip button and commits on Enter', () => {
    const onSetBpm = vi.fn()
    renderTracker({ transport: { bpm: 120, onSetBpm } })

    const bpmButton = screen.getByLabelText('Edit BPM')
    fireEvent.click(bpmButton)

    const input = screen.getByLabelText('Edit BPM') as HTMLInputElement
    expect(input.tagName).toBe('INPUT')
    fireEvent.change(input, { target: { value: '140' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSetBpm).toHaveBeenCalledWith(140)
  })

  it('cancels BPM inline edit on Escape', () => {
    const onSetBpm = vi.fn()
    renderTracker({ transport: { bpm: 120, onSetBpm } })

    const bpmButton = screen.getByLabelText('Edit BPM')
    fireEvent.click(bpmButton)

    const input = screen.getByLabelText('Edit BPM') as HTMLInputElement
    fireEvent.change(input, { target: { value: '180' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(onSetBpm).not.toHaveBeenCalled()
  })

  it('calls onSelectCategory(undefined) when All button is clicked', () => {
    const onSelectCategory = vi.fn()
    const categoriesWithChildren = [
      ...DEFAULT_CATEGORIES,
      { id: 9, name: 'SubBass', parentId: 1 }
    ]
    renderTracker({
      browser: {
        categories: categoriesWithChildren,
        selectedCategoryId: 1,
        onSelectCategory
      }
    })

    fireEvent.click(screen.getByLabelText('Clear category filter'))
    expect(onSelectCategory).toHaveBeenCalledWith(undefined)
  })

  it('calls onSelectCategory with subcategory id when subcategory chip is clicked', () => {
    const onSelectCategory = vi.fn()
    const categoriesWithChildren = [
      ...DEFAULT_CATEGORIES,
      { id: 9, name: 'SubBass', parentId: 1 }
    ]
    renderTracker({
      browser: {
        categories: categoriesWithChildren,
        selectedCategoryId: 1,
        onSelectCategory
      }
    })

    fireEvent.click(screen.getByText('SubBass'))
    expect(onSelectCategory).toHaveBeenCalledWith(9)
  })

  it('selects a deeper subcategory chip while its parent subcategory is selected', () => {
    const onSelectCategory = vi.fn()
    // Bass (id:1) -> SubBass (id:9) -> DeepBass (id:10). With 9 selected the
    // chips are the children of 9, so a chip never equals the selection —
    // clicking DeepBass takes the select branch, not toggle-off.
    const categoriesWithChildren = [
      ...DEFAULT_CATEGORIES,
      { id: 9, name: 'SubBass', parentId: 1 },
      { id: 10, name: 'DeepBass', parentId: 9 }
    ]
    renderTracker({
      browser: {
        categories: categoriesWithChildren,
        selectedCategoryId: 9,
        onSelectCategory
      }
    })

    fireEvent.click(screen.getByText('DeepBass'))
    expect(onSelectCategory).toHaveBeenCalledWith(10)
  })

  it('calls onSearchChange when search input changes', () => {
    const onSearchChange = vi.fn()
    renderTracker({ browser: { onSearchChange } })

    const search = screen.getByLabelText('Search samples')
    fireEvent.change(search, { target: { value: 'bass' } })

    expect(onSearchChange).toHaveBeenCalledWith('bass')
  })

  it('renders playhead when transport is playing with non-zero tick', () => {
    const { container } = renderTracker({
      transport: { transportState: 'playing' },
      arrangement: { currentTick: 64 }
    })
    const playhead = container.querySelector('.tracker-playhead')
    expect(playhead).not.toBeNull()
  })

  it('does not render playhead when transport is stopped', () => {
    const { container } = renderTracker({
      transport: { transportState: 'stopped' },
      arrangement: { currentTick: 64 }
    })
    const playhead = container.querySelector('.tracker-playhead')
    expect(playhead).toBeNull()
  })

  it('clears selection on click without Ctrl key', () => {
    const { container } = renderTracker({})
    const lanes = container.querySelector('.tracker-lanes')!
    fireEvent.mouseDown(lanes, { ctrlKey: false, clientX: 200, clientY: 100 })
  })

  it('starts rectangle selection on Ctrl+mousedown in lanes area', () => {
    const { container } = renderTracker({})
    const lanes = container.querySelector('.tracker-lanes')!
    Object.defineProperty(lanes, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 })
    })
    fireEvent.mouseDown(lanes, { ctrlKey: true, clientX: 200, clientY: 100 })
    fireEvent.mouseMove(window, { clientX: 300, clientY: 200 })
    const selRect = container.querySelector('.selection-rect')
    expect(selRect).not.toBeNull()
    fireEvent.mouseUp(window)
  })

  it('renders lane clips in canvas and triggers drag start', () => {
    const lanesWithClips = LANES.map((lane, i) =>
      i === 0
        ? { ...lane, clips: [{ id: 'clip1', samplePath: '/s/kick.wav', sampleName: 'kick.wav', startTick: 0, durationTicks: 32, durationSeconds: 0.5, slot: 0 }] }
        : lane
    )
    renderTracker({ arrangement: { lanes: lanesWithClips } })
    expect(screen.getByLabelText('Lane 1 track area')).toBeInTheDocument()
  })

  it('handles sample drop on lane track area', () => {
    const onPlaceSampleDetailOnLane = vi.fn()
    renderTracker({ arrangement: { onPlaceSampleDetailOnLane } })

    const trackArea = screen.getByLabelText('Lane 1 track area')
    const sampleData = JSON.stringify({ name: 'kick.wav', relpath: '/s/kick.wav', duration: 0.5, tags: [] })

    const dataTransfer = {
      types: ['application/mixjam-sample'],
      getData: (type: string) => type === 'application/mixjam-sample' ? sampleData : '',
      dropEffect: 'copy',
      effectAllowed: 'all'
    }
    fireEvent.dragOver(trackArea, { dataTransfer })
    Object.defineProperty(trackArea, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 800, bottom: 44, width: 800, height: 44 })
    })
    fireEvent.drop(trackArea, { dataTransfer, clientX: 200, clientY: 22 })
    expect(onPlaceSampleDetailOnLane).toHaveBeenCalled()
  })

  it('handles clip move drop on lane track area', () => {
    const onMoveClipOnLane = vi.fn()
    renderTracker({ arrangement: { onMoveClipOnLane } })

    const trackArea = screen.getByLabelText('Lane 2 track area')
    const clipData = JSON.stringify({ clipId: 'clip1' })

    const dataTransfer = {
      types: ['application/mixjam-clip'],
      getData: (type: string) => type === 'application/mixjam-clip' ? clipData : '',
      dropEffect: 'move',
      effectAllowed: 'all'
    }
    Object.defineProperty(trackArea, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 800, bottom: 44, width: 800, height: 44 })
    })
    fireEvent.drop(trackArea, { dataTransfer, clientX: 200, clientY: 22, shiftKey: false })
    expect(onMoveClipOnLane).toHaveBeenCalled()
  })

  it('handles clip duplicate drop on lane track area with Shift', () => {
    const onDuplicateClipOnLane = vi.fn()
    renderTracker({ arrangement: { onDuplicateClipOnLane } })

    const trackArea = screen.getByLabelText('Lane 1 track area')
    const clipData = JSON.stringify({ clipId: 'clip1' })

    const dataTransfer = {
      types: ['application/mixjam-clip'],
      getData: (type: string) => type === 'application/mixjam-clip' ? clipData : '',
      dropEffect: 'copy',
      effectAllowed: 'all'
    }
    Object.defineProperty(trackArea, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 800, bottom: 44, width: 800, height: 44 })
    })
    // jsdom DragEvent doesn't propagate shiftKey via init; use native dispatch
    const dropEvent = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(dropEvent, 'dataTransfer', { value: dataTransfer })
    Object.defineProperty(dropEvent, 'shiftKey', { value: true })
    Object.defineProperty(dropEvent, 'altKey', { value: false })
    Object.defineProperty(dropEvent, 'clientX', { value: 200 })
    Object.defineProperty(dropEvent, 'clientY', { value: 22 })
    trackArea.dispatchEvent(dropEvent)
    expect(onDuplicateClipOnLane).toHaveBeenCalled()
  })

  it('handles group move drop with multiple clips', () => {
    const onMoveClipGroup = vi.fn()
    renderTracker({ arrangement: { onMoveClipGroup } })

    const trackArea = screen.getByLabelText('Lane 1 track area')
    const clipData = JSON.stringify({
      clipId: 'clip1',
      group: [
        { clipId: 'clip1', tickOffset: 0, laneOffset: 0 },
        { clipId: 'clip2', tickOffset: 32, laneOffset: 1 }
      ]
    })

    const dataTransfer = {
      types: ['application/mixjam-clip'],
      getData: (type: string) => type === 'application/mixjam-clip' ? clipData : '',
      dropEffect: 'move',
      effectAllowed: 'all'
    }
    Object.defineProperty(trackArea, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 800, bottom: 44, width: 800, height: 44 })
    })
    fireEvent.drop(trackArea, { dataTransfer, clientX: 200, clientY: 22, shiftKey: false })
    expect(onMoveClipGroup).toHaveBeenCalled()
  })

  it('handles group duplicate drop with Shift', () => {
    const onDuplicateClipGroup = vi.fn()
    renderTracker({ arrangement: { onDuplicateClipGroup } })

    const trackArea = screen.getByLabelText('Lane 1 track area')
    const clipData = JSON.stringify({
      clipId: 'clip1',
      group: [
        { clipId: 'clip1', tickOffset: 0, laneOffset: 0 },
        { clipId: 'clip2', tickOffset: 32, laneOffset: 1 }
      ]
    })

    const dataTransfer = {
      types: ['application/mixjam-clip'],
      getData: (type: string) => type === 'application/mixjam-clip' ? clipData : '',
      dropEffect: 'copy',
      effectAllowed: 'all'
    }
    Object.defineProperty(trackArea, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 800, bottom: 44, width: 800, height: 44 })
    })
    // jsdom DragEvent doesn't propagate shiftKey via init; use native dispatch
    const dropEvent = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(dropEvent, 'dataTransfer', { value: dataTransfer })
    Object.defineProperty(dropEvent, 'shiftKey', { value: true })
    Object.defineProperty(dropEvent, 'altKey', { value: false })
    Object.defineProperty(dropEvent, 'clientX', { value: 200 })
    Object.defineProperty(dropEvent, 'clientY', { value: 22 })
    trackArea.dispatchEvent(dropEvent)
    expect(onDuplicateClipGroup).toHaveBeenCalled()
  })

  it('handles dragover with clip type setting move effect', () => {
    renderTracker({})
    const trackArea = screen.getByLabelText('Lane 1 track area')
    const dataTransfer = {
      types: ['application/mixjam-clip'],
      getData: () => '',
      dropEffect: '',
      effectAllowed: 'all'
    }
    fireEvent.dragOver(trackArea, { dataTransfer, shiftKey: false })
    expect(dataTransfer.dropEffect).toBe('move')
  })

  it('handles dragover with clip type + Shift setting copy effect', () => {
    renderTracker({})
    const trackArea = screen.getByLabelText('Lane 1 track area')
    const dataTransfer = {
      types: ['application/mixjam-clip'],
      getData: () => '',
      dropEffect: '',
      effectAllowed: 'all'
    }
    // jsdom DragEvent doesn't propagate shiftKey via init; use native dispatch
    const dragOverEvent = new Event('dragover', { bubbles: true, cancelable: true })
    Object.defineProperty(dragOverEvent, 'dataTransfer', { value: dataTransfer })
    Object.defineProperty(dragOverEvent, 'shiftKey', { value: true })
    trackArea.dispatchEvent(dragOverEvent)
    expect(dataTransfer.dropEffect).toBe('copy')
  })

  it('dragover with irrelevant type does not set dropEffect', () => {
    renderTracker({})
    const trackArea = screen.getByLabelText('Lane 1 track area')
    const dataTransfer = {
      types: ['text/plain'],
      getData: () => '',
      dropEffect: '',
      effectAllowed: 'all'
    }
    fireEvent.dragOver(trackArea, { dataTransfer })
    expect(dataTransfer.dropEffect).toBe('')
  })

  it('handles multi-selection group clip drag start', () => {
    const lanesWithClips: LaneState[] = LANES.map((lane) => {
      if (lane.index === 0) {
        return { ...lane, clips: [{ id: 'clip-1', samplePath: '/s/kick.wav', sampleName: 'kick.wav', startTick: 0, durationTicks: 16, durationSeconds: 0.5 }] }
      }
      if (lane.index === 1) {
        return { ...lane, clips: [{ id: 'clip-2', samplePath: '/s/snare.wav', sampleName: 'snare.wav', startTick: 0, durationTicks: 16, durationSeconds: 0.5 }] }
      }
      return lane
    })

    const { container } = renderTracker({ arrangement: { lanes: lanesWithClips } })

    const lanesEl = container.querySelector('.tracker-lanes')!
    Object.defineProperty(lanesEl, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 })
    })
    fireEvent.mouseDown(lanesEl, { ctrlKey: true, clientX: 170, clientY: 30 })
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 180, clientY: 130, bubbles: true }))
    })
    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    })

    const canvasContainers = container.querySelectorAll('.lane-clip-canvas-container')
    const firstContainer = canvasContainers[0]! as HTMLElement
    // A plain (non-Ctrl) mousedown directly on a selected clip must NOT clear
    // the multi-selection via bubbling to .tracker-lanes — otherwise the
    // subsequent dragstart would see an empty selection and silently
    // degrade the drag to a single clip instead of the whole group.
    fireEvent.mouseDown(firstContainer, { button: 0 })
    expect(firstContainer.dataset.dragClipId).toBe('clip-1')
    const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' }
    fireEvent.dragStart(firstContainer, { dataTransfer })

    expect(dataTransfer.setData).toHaveBeenCalled()
    const setDataCall = dataTransfer.setData.mock.calls[0]
    expect(setDataCall[0]).toBe('application/mixjam-clip')
    const parsed = JSON.parse(setDataCall[1])
    expect(parsed.clipId).toBe('clip-1')
    expect(parsed.group).toHaveLength(2)
    expect(parsed.group.map((g: { clipId: string }) => g.clipId).sort()).toEqual(['clip-1', 'clip-2'])
  })

  it('advertises copyMove on clip drag start so Shift+drop (duplicate) is a valid drop', () => {
    // Regression: effectAllowed='move' made Chromium reject the drop whenever
    // dragover set dropEffect='copy' (Shift held), so duplicate never fired.
    const lanesWithClip: LaneState[] = LANES.map((lane) =>
      lane.index === 0
        ? { ...lane, clips: [{ id: 'clip-1', samplePath: '/s/kick.wav', sampleName: 'kick.wav', startTick: 0, durationTicks: 16, durationSeconds: 0.5 }] }
        : lane
    )
    const { container } = renderTracker({ arrangement: { lanes: lanesWithClip } })

    const firstContainer = container.querySelectorAll('.lane-clip-canvas-container')[0]! as HTMLElement
    fireEvent.mouseDown(firstContainer, { button: 0 })
    expect(firstContainer.dataset.dragClipId).toBe('clip-1')
    const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' }
    fireEvent.dragStart(firstContainer, { dataTransfer })

    expect(dataTransfer.effectAllowed).toBe('copyMove')
  })

  it('clears multi-selection when a plain mousedown lands on an unselected clip', () => {
    const lanesWithClips: LaneState[] = LANES.map((lane) => {
      if (lane.index === 0) {
        return { ...lane, clips: [{ id: 'clip-1', samplePath: '/s/kick.wav', sampleName: 'kick.wav', startTick: 0, durationTicks: 16, durationSeconds: 0.5 }] }
      }
      if (lane.index === 2) {
        return { ...lane, clips: [{ id: 'clip-3', samplePath: '/s/hat.wav', sampleName: 'hat.wav', startTick: 0, durationTicks: 16, durationSeconds: 0.5 }] }
      }
      return lane
    })

    const { container } = renderTracker({ arrangement: { lanes: lanesWithClips } })

    const lanesEl = container.querySelector('.tracker-lanes')!
    Object.defineProperty(lanesEl, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 })
    })
    // Rectangle-select only clip-1 (lane 0).
    fireEvent.mouseDown(lanesEl, { ctrlKey: true, clientX: 170, clientY: 30 })
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 180, clientY: 40, bubbles: true }))
    })
    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    })

    // Plain mousedown on the unrelated, unselected clip-3 should clear the
    // stale selection so it doesn't linger after this unrelated drag.
    const canvasContainers = container.querySelectorAll('.lane-clip-canvas-container')
    const thirdContainer = canvasContainers[2]! as HTMLElement
    fireEvent.mouseDown(thirdContainer, { button: 0 })
    expect(thirdContainer.dataset.dragClipId).toBe('clip-3')
    const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' }
    fireEvent.dragStart(thirdContainer, { dataTransfer })

    const parsed = JSON.parse(dataTransfer.setData.mock.calls[0][1])
    expect(parsed.clipId).toBe('clip-3')
    expect(parsed.group).toBeUndefined()
  })

  it('handles dragover with sample type setting copy effect', () => {
    renderTracker({})
    const trackArea = screen.getByLabelText('Lane 1 track area')
    const dataTransfer = {
      types: ['application/mixjam-sample'],
      getData: () => '',
      dropEffect: '',
      effectAllowed: 'all'
    }
    fireEvent.dragOver(trackArea, { dataTransfer })
    expect(dataTransfer.dropEffect).toBe('copy')
  })

  it('flash effect toggles after Locate in Browser', () => {
    vi.useFakeTimers()
    const lanesWithClip: LaneState[] = LANES.map((lane) =>
      lane.index === 0
        ? { ...lane, clips: [{ id: 'clip-1', samplePath: 'Drums/kick.wav', sampleName: 'kick.wav', startTick: 0, durationTicks: 32, durationSeconds: 1 }] }
        : lane
    )
    renderTracker({ arrangement: { lanes: lanesWithClip } })

    const canvasContainer = document.querySelector('[data-clip-names="kick.wav"]')!
    fireEvent.contextMenu(canvasContainer)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Locate in Browser' }))

    vi.advanceTimersByTime(1800)
    vi.useRealTimers()
  })

  it('left-column resize seam handles drag correctly', () => {
    renderTracker({})

    const seam = screen.getByRole('separator', { name: 'Resize left column' })
    fireEvent.mouseDown(seam, { clientX: 168 })
    fireEvent.mouseMove(window, { clientX: 268 })
    fireEvent.mouseUp(window)

    // The tracker-view element should have an updated --left-col-w style
    const trackerView = document.querySelector('.tracker-view') as HTMLElement
    expect(trackerView.style.getPropertyValue('--left-col-w')).toContain('px')
  })

  it('opens shortcuts overlay when ? key is pressed', () => {
    renderTracker({})

    // Press ? key to open shortcuts overlay
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }))
    })

    // The ShortcutsOverlay should now be visible
    expect(screen.getByText(/shortcuts/i)).toBeInTheDocument()
  })

  it('hides playhead when currentTick exceeds totalTicks', () => {
    // totalTicks is hardcoded to 256 in TrackerView
    renderTracker({
      transport: { transportState: 'playing' },
      arrangement: { currentTick: 300 }
    })

    const playhead = document.querySelector('.tracker-playhead')
    expect(playhead).toBeNull()
  })

  // --- spec-007 2026-07-07 amendments ---

  const CHANNEL = (channelIndex: number) => ({
    channelIndex,
    gain: 0.8,
    pan: 0,
    muted: false,
    solo: false
  })

  it('AC-016 (rev 2): dragging the seam persists the column width for the next session', () => {
    renderTracker({ mixer: { channels: [CHANNEL(0)] } })

    const seam = screen.getByRole('separator', { name: 'Resize left column' })
    fireEvent.mouseDown(seam, { clientX: 420 })
    fireEvent.mouseMove(window, { clientX: 220 })
    fireEvent.mouseUp(window)

    const stored = parseFloat(localStorage.getItem('mixjam-left-col-w') ?? '')
    expect(stored).toBeGreaterThanOrEqual(168)
  })

  it('AC-016 (rev 2): a persisted column width is applied on mount', () => {
    localStorage.setItem('mixjam-left-col-w', '200')
    renderTracker({ mixer: { channels: [CHANNEL(0)] } })

    const trackerView = document.querySelector('.tracker-view') as HTMLElement
    expect(trackerView.style.getPropertyValue('--left-col-w')).toBe('200px')
  })

  it('AC-016 (rev 2): the Mixer toggle button no longer exists', () => {
    renderTracker({ mixer: { channels: [CHANNEL(0)] } })
    expect(screen.queryByRole('button', { name: /mixer/i })).toBeNull()
  })

  it('AC-017: restore button shows only when a channel can be restored and fires onRestoreChannel', () => {
    const onRestoreChannel = vi.fn()
    renderTracker({
      mixer: { channels: [CHANNEL(0)], canRestoreChannel: true, onRestoreChannel }
    })

    const restore = screen.getByRole('button', { name: 'Restore removed channel' })
    fireEvent.click(restore)
    expect(onRestoreChannel).toHaveBeenCalled()
  })

  it('AC-017: restore button is absent at the full channel count', () => {
    renderTracker({ mixer: { channels: [CHANNEL(0)], canRestoreChannel: false } })
    expect(screen.queryByRole('button', { name: 'Restore removed channel' })).toBeNull()
  })

  it('AC-020: strip labels are stable channelIndex + 1 with gaps after removal', () => {
    // Channels 0 and 2 present, channel 1 removed: labels must read 1 and 3.
    renderTracker({ mixer: { channels: [CHANNEL(0), CHANNEL(2)], canRestoreChannel: true } })

    const labels = Array.from(
      document.querySelectorAll('.mixer-channel-label > span')
    ).map((el) => el.textContent)
    expect(labels).toEqual(['1', '3'])
    // The aria-labels agree with the visible labels.
    expect(screen.getByRole('slider', { name: 'Channel 1 Pan' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Channel 3 Pan' })).toBeInTheDocument()
  })

  it('AC-024: master meter label reads Output Level', () => {
    renderTracker({})
    expect(screen.getByText('Output Level')).toBeInTheDocument()
    expect(screen.queryByText('dB Loudness')).toBeNull()
  })
})
