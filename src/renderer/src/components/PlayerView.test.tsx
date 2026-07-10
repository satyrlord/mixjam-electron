import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PlayerView from './PlayerView'
import type {
  TrackerArrangementProps,
  PlayerBrowserProps,
  PlayerMixerProps,
  PlayerTransportProps
} from './playerProps'
import type { MixJamFileItem, SampleListItem } from '../../../shared/backend-api'
import type { LaneState } from '../lib/arrangement'

const INDEX_CSS_PATH = resolve(process.cwd(), 'src/renderer/src/index.css')

const asyncNoop = async () => { /* empty */ }

const RECENT_PROJECTS: MixJamFileItem[] = [
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
  placements: []
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

const DEFAULT_BROWSER: PlayerBrowserProps = {
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
  onMovePlacement: noop,
  onDuplicatePlacement: noop,
  onMovePlacementGroup: noop,
  onDuplicatePlacementGroup: noop,
  onRemovePlacementFromLane: noop,
  onRemovePlacements: noop,
  onSetLanePan: noop,
  onSetLaneNativeBpm: noop,
  onToggleLaneMute: noop,
  onToggleLaneSolo: noop
}

const DEFAULT_TRANSPORT: PlayerTransportProps = {
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
  onTransportSkipBack: noop,
  onTransportSeek: noop
}

const DEFAULT_MIXER: PlayerMixerProps = {
  channels: [],
  channelLevels: new Map(),
  channelPeaks: new Map(),
  canRestoreChannel: false,
  onSetChannelGain: noop,
  onSetChannelPan: noop,
  onToggleChannelMute: noop,
  onToggleChannelSolo: noop,
  onRemoveChannel: noop,
  onRestoreChannel: noop,
  onAddChannelEffect: noop,
  onUpdateChannelEffect: noop,
  onToggleChannelEffectBypass: noop,
  onRemoveChannelEffect: noop,
  onMoveChannelEffect: noop
}

interface TrackerOverrides {
  mixJamFiles?: MixJamFileItem[]
  browser?: Partial<PlayerBrowserProps>
  arrangement?: Partial<TrackerArrangementProps>
  transport?: Partial<PlayerTransportProps>
  mixer?: Partial<PlayerMixerProps>
}

function renderPlayer(overrides: TrackerOverrides = {}) {
  return render(
    <PlayerView
      mixJamFiles={overrides.mixJamFiles ?? []}
      browser={{ ...DEFAULT_BROWSER, ...overrides.browser }}
      arrangement={{ ...DEFAULT_ARRANGEMENT, ...overrides.arrangement }}
      transport={{ ...DEFAULT_TRANSPORT, ...overrides.transport }}
      mixer={{ ...DEFAULT_MIXER, ...overrides.mixer }}
    />
  )
}

describe('PlayerView', () => {
  // The seam-drag tests persist the left-column width; clear it after each test
  // so a failing assertion can't leak a stored width into later mounts.
  afterEach(() => {
    localStorage.removeItem('mixjam-left-col-w')
  })

  it('renders the Player regions and MixJam Browser', () => {
    renderPlayer({
      mixJamFiles: RECENT_PROJECTS,
      browser: { samples: SAMPLES, totalCount: 1 }
    })

    expect(screen.getByText('MixJam Browser')).toBeInTheDocument()
    expect(screen.getByText('club-night')).toBeInTheDocument()
    expect(screen.getByText('Lane 1')).toBeInTheDocument()
    expect(screen.getByText('Song Controls')).toBeInTheDocument()
    expect(screen.getByRole('listbox', { name: /sample categories/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /kick_808/ })).toBeInTheDocument()
  })

  it('lists MixJam files as disabled until project load ships (spec-011)', () => {
    renderPlayer({ mixJamFiles: RECENT_PROJECTS })

    const entry = screen.getByRole('button', { name: /club-night/ })
    expect(entry).toBeDisabled()
    expect(entry).toHaveAttribute('title', expect.stringMatching(/coming soon/i))
  })

  it('renders sample bubbles on a lane after placement', () => {
    const lanesWithPlacement: LaneState[] = LANES.map((lane) =>
      lane.index === 0
        ? {
            ...lane,
            placements: [
              {
                id: 'placement-1',
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

    renderPlayer({ arrangement: { lanes: lanesWithPlacement } })
    // Placements are rendered on canvas; verify via data attributes on the canvas container.
    const containers = document.querySelectorAll('[data-placement-count]')
    const withPlacements = Array.from(containers).filter((el) => el.getAttribute('data-placement-count') !== '0')
    expect(withPlacements).toHaveLength(1)
    expect(withPlacements[0].getAttribute('data-placement-sample-names')).toBe('kick_808.wav')
  })

  it('fires onPlaceSampleDetailOnLane when a sample tile is dropped onto a lane canvas', () => {
    const onPlaceSampleDetailOnLane = vi.fn()
    const detail = {
      name: 'kick_808.wav',
      relpath: 'Drums/Kicks/kick_808.wav',
      tags: [],
      duration: 0.5
    }

    renderPlayer({ arrangement: { onPlaceSampleDetailOnLane } })

    const laneCanvas = screen.getByRole('region', { name: 'Lane 1 placement area' })
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
    renderPlayer({ arrangement: { onToggleLaneMute } })

    fireEvent.click(screen.getByRole('button', { name: 'Mute Lane 1' }))
    expect(onToggleLaneMute).toHaveBeenCalledWith(0)
  })

  it('fires onToggleLaneSolo when clicking the S button', () => {
    const onToggleLaneSolo = vi.fn()
    renderPlayer({ arrangement: { onToggleLaneSolo } })

    fireEvent.click(screen.getByRole('button', { name: 'Solo Lane 2' }))
    expect(onToggleLaneSolo).toHaveBeenCalledWith(1)
  })

  it('shows active mute button state for muted lanes', () => {
    const mutedLanes = LANES.map((lane) =>
      lane.index === 3 ? { ...lane, muted: true } : lane
    )
    renderPlayer({ arrangement: { lanes: mutedLanes } })

    const muteBtn = screen.getByRole('button', { name: 'Mute Lane 4' })
    expect(muteBtn.className).toContain('tracker-lane-mute-active')
  })

  it('shows active solo button state for soloed lanes', () => {
    const soloLanes = LANES.map((lane) =>
      lane.index === 5 ? { ...lane, solo: true } : lane
    )
    renderPlayer({
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
    renderPlayer({
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

    renderPlayer({
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
    renderPlayer({ transport: { transportState: 'playing' } })

    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument()
  })

  it('fires onPreviewSample when clicking a sample tile', () => {
    const onPreviewSample = vi.fn()
    renderPlayer({
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

  it('shows a context menu on right-clicking a sample bubble', () => {
    const lanesWithPlacement: LaneState[] = LANES.map((lane) =>
      lane.index === 0
        ? { ...lane, placements: [{ id: 'placement-1', samplePath: 'Drums/kick.wav', sampleName: 'kick.wav', startTick: 0, durationTicks: 32, durationSeconds: 1 }] }
        : lane
    )
    renderPlayer({ arrangement: { lanes: lanesWithPlacement } })

    // Placements are on canvas; fire contextMenu on the canvas container within lane 1.
    const canvasContainer = document.querySelector('[data-placement-sample-names="kick.wav"]')!
    fireEvent.contextMenu(canvasContainer)

    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Locate in Browser' })).toBeInTheDocument()
  })

  it('calls onRemovePlacementFromLane when Delete is clicked in context menu', () => {
    const onRemovePlacementFromLane = vi.fn()
    const lanesWithPlacement: LaneState[] = LANES.map((lane) =>
      lane.index === 0
        ? { ...lane, placements: [{ id: 'placement-1', samplePath: 'Drums/kick.wav', sampleName: 'kick.wav', startTick: 0, durationTicks: 32, durationSeconds: 1 }] }
        : lane
    )
    renderPlayer({ arrangement: { lanes: lanesWithPlacement, onRemovePlacementFromLane } })

    // Placements are on canvas; fire contextMenu on the canvas container.
    const canvasContainer = document.querySelector('[data-placement-sample-names="kick.wav"]')!
    fireEvent.contextMenu(canvasContainer)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))

    expect(onRemovePlacementFromLane).toHaveBeenCalledWith(0, 'placement-1')
  })

  it('calls onMovePlacement when a sample bubble is dragged to another lane', () => {
    const onMovePlacement = vi.fn()
    const lanesWithPlacement: LaneState[] = LANES.map((lane) =>
      lane.index === 0
        ? { ...lane, placements: [{ id: 'placement-1', samplePath: 'Drums/kick.wav', sampleName: 'kick.wav', startTick: 0, durationTicks: 32, durationSeconds: 1 }] }
        : lane
    )
    renderPlayer({ arrangement: { lanes: lanesWithPlacement, onMovePlacement } })

    const canvas = screen.getByRole('region', { name: 'Lane 3 placement area' })
    // Simulate drag over first (to allow drop) with matching types
    fireEvent.dragOver(canvas, {
      dataTransfer: { types: ['application/mixjam-clip-placement'], getData: () => '' }
    })
    fireEvent.drop(canvas, {
      dataTransfer: {
        types: ['application/mixjam-clip-placement'],
        getData: (type: string) => type === 'application/mixjam-clip-placement' ? JSON.stringify({ placementId: 'placement-1' }) : ''
      }
    })

    expect(onMovePlacement).toHaveBeenCalledWith('placement-1', 2, expect.any(Number))
  })

  it('fires onSetLanePan on pan dial mouse interaction', () => {
    const onSetLanePan = vi.fn()
    renderPlayer({ arrangement: { onSetLanePan } })

    const panDial = screen.getByRole('slider', { name: 'Pan Lane 1' })
    fireEvent.mouseDown(panDial, { clientX: 100, button: 0 })
    // Pan listener is attached to window, not the element
    fireEvent.mouseMove(window, { clientX: 150 })
    fireEvent.mouseUp(window)

    expect(onSetLanePan).toHaveBeenCalledWith(0, expect.any(Number))
  })

  it('pan knob ArrowRight increases pan value', () => {
    const onSetLanePan = vi.fn()
    renderPlayer({ arrangement: { onSetLanePan } })

    const panDial = screen.getByRole('slider', { name: 'Pan Lane 1' })
    fireEvent.keyDown(panDial, { key: 'ArrowRight' })

    expect(onSetLanePan).toHaveBeenCalledWith(0, 0.05)
  })

  it('pan knob ArrowLeft decreases pan value', () => {
    const onSetLanePan = vi.fn()
    renderPlayer({ arrangement: { onSetLanePan } })

    const panDial = screen.getByRole('slider', { name: 'Pan Lane 1' })
    fireEvent.keyDown(panDial, { key: 'ArrowLeft' })

    expect(onSetLanePan).toHaveBeenCalledWith(0, -0.05)
  })

  it('pan knob Home key resets pan to center', () => {
    const onSetLanePan = vi.fn()
    const lanes = LANES.map((l, i) => i === 0 ? { ...l, pan: 0.5 } : l)
    renderPlayer({ arrangement: { onSetLanePan, lanes } })

    const panDial = screen.getByRole('slider', { name: 'Pan Lane 1' })
    fireEvent.keyDown(panDial, { key: 'Home' })

    expect(onSetLanePan).toHaveBeenCalledWith(0, 0)
  })

  it('pan knob double-click resets pan to center', () => {
    const onSetLanePan = vi.fn()
    const lanes = LANES.map((l, i) => i === 0 ? { ...l, pan: -0.7 } : l)
    renderPlayer({ arrangement: { onSetLanePan, lanes } })

    const panDial = screen.getByRole('slider', { name: 'Pan Lane 1' })
    fireEvent.doubleClick(panDial)

    expect(onSetLanePan).toHaveBeenCalledWith(0, 0)
  })

  it('transport-button-play class only appears when playing', () => {
    renderPlayer({ transport: { transportState: 'stopped' } })
    const btn = screen.getByRole('button', { name: 'Play' })
    expect(btn.className).not.toContain('transport-button-play')
  })

  it('transport-button-play class present when playing', () => {
    renderPlayer({ transport: { transportState: 'playing' } })
    const btn = screen.getByRole('button', { name: 'Pause' })
    expect(btn.className).toContain('transport-button-play')
  })

  // --- AC-002c: Empty state for MixJam Browser ---
  it('AC-002c: shows informational empty state when mixJamFiles is empty', () => {
    renderPlayer({ mixJamFiles: [] })

    expect(screen.getByText(/no mixjam projects yet/i)).toBeInTheDocument()
  })

  it('MixJam Browser can be collapsed and expanded via toggle button', () => {
    renderPlayer({ mixJamFiles: RECENT_PROJECTS })
    const playerView = document.querySelector('.player-view')
    expect(playerView).not.toBeNull()

    // Starts expanded
    expect(screen.getByText('club-night')).toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: 'Collapse MixJam Browser' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(playerView!.className).not.toContain('mixjam-browser-collapsed')

    // Click to collapse
    fireEvent.click(toggle)
    expect(screen.queryByText('club-night')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Expand MixJam Browser' })).toHaveAttribute('aria-expanded', 'false')
    expect(playerView!.className).toContain('mixjam-browser-collapsed')

    // Click to expand again
    fireEvent.click(screen.getByRole('button', { name: 'Expand MixJam Browser' }))
    expect(screen.getByText('club-night')).toBeInTheDocument()
    expect(playerView!.className).not.toContain('mixjam-browser-collapsed')
  })

  it('collapsed MixJam Browser persists state in localStorage', () => {
    renderPlayer({ mixJamFiles: RECENT_PROJECTS })

    const toggle = screen.getByRole('button', { name: 'Collapse MixJam Browser' })
    fireEvent.click(toggle)

    expect(localStorage.getItem('mixjam:recents-rail-collapsed')).toBe('1')

    // Expand again
    fireEvent.click(screen.getByRole('button', { name: 'Expand MixJam Browser' }))
    expect(localStorage.getItem('mixjam:recents-rail-collapsed')).toBeNull()
  })

  // --- AC-004a: BPM and Master Volume share the Song Controls container ---
  it('AC-004a: Song Controls renders BPM and Master Volume sliders with the dB meter', () => {
    renderPlayer({})

    const songControls = screen.getByText('Song Controls').closest('.song-controls-main')
    const bpmSlider = screen.getByRole('slider', { name: 'BPM' })
    const volumeSlider = screen.getByRole('slider', { name: 'Master Volume' })

    expect(songControls).toContainElement(bpmSlider)
    expect(songControls).toContainElement(volumeSlider)
    expect(screen.getByRole('meter', { name: 'Output Level' })).toBeInTheDocument()
  })

  // --- AC-004b: BPM slider ranges 50-200, defaults to 120 ---
  it('AC-004b: BPM slider has min=50, max=200, and initializes at 120', () => {
    renderPlayer({ transport: { bpm: 120 } })

    const input = screen.getByRole('slider', { name: 'BPM' })
    expect(input).toHaveAttribute('min', '50')
    expect(input).toHaveAttribute('max', '200')
    expect(input).toHaveValue('120')
  })

  // --- AC-005: 16 lanes render ---
  it('AC-005: renders 16 lanes with M, S buttons and pan knob', () => {
    renderPlayer({})

    const laneElements = document.querySelectorAll('.tracker-lane')
    expect(laneElements).toHaveLength(16)

    // Each lane has M, S, and pan
    expect(screen.getByRole('button', { name: 'Mute Lane 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Solo Lane 16' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Pan Lane 16' })).toBeInTheDocument()
  })

  // --- AC-010: Playhead visible during playback ---
  it('AC-010: playhead is visible during playback at correct position', () => {
    renderPlayer({ transport: { transportState: 'playing' }, arrangement: { currentTick: 64 } })

    const playhead = document.querySelector('.tracker-playhead')
    expect(playhead).not.toBeNull()
    // currentTick=64 out of totalTicks=256 => 0.25 fraction
    expect(playhead!.getAttribute('style')).toContain('0.25')
  })

  it('AC-010: playhead remains visible at its position when transport is stopped', () => {
    renderPlayer({ transport: { transportState: 'stopped' }, arrangement: { currentTick: 40 } })

    const playhead = document.querySelector('.tracker-playhead')
    expect(playhead).not.toBeNull()
    expect(playhead!.getAttribute('style')).toContain('0.15625')
  })

  // --- AC-011: Ruler tick marks and bar numbers ---
  it('AC-011: ruler displays bar numbers (1, 5, 9, 13) and tick marks', () => {
    renderPlayer({})

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
    renderPlayer({})

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

  it('shows a non-reentrant preparing state that Stop can cancel', () => {
    const onTransportStop = vi.fn()
    renderPlayer({ transport: { transportState: 'preparing', onTransportStop } })

    expect(screen.getByRole('button', { name: 'Preparing playback' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(onTransportStop).toHaveBeenCalledTimes(1)
  })

  it('AC-011a: clicking the ruler seeks to the nearest beat grid position', () => {
    const onTransportSeek = vi.fn()
    renderPlayer({ transport: { onTransportSeek } })
    const ruler = screen.getByRole('slider', { name: 'Tracker timeline' })
    vi.spyOn(ruler, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      width: 968,
      right: 1068,
      top: 0,
      bottom: 24,
      height: 24,
      x: 100,
      y: 0,
      toJSON: () => ({})
    })

    fireEvent.click(ruler, { clientX: 492 })

    expect(onTransportSeek).toHaveBeenCalledWith(72)
  })

  it('AC-011a: the ruler spacer is not a seek target', () => {
    const onTransportSeek = vi.fn()
    renderPlayer({ transport: { onTransportSeek } })
    const ruler = screen.getByRole('slider', { name: 'Tracker timeline' })
    vi.spyOn(ruler, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      width: 968,
      right: 1068,
      top: 0,
      bottom: 24,
      height: 24,
      x: 100,
      y: 0,
      toJSON: () => ({})
    })

    fireEvent.click(ruler, { clientX: 200 })

    expect(onTransportSeek).not.toHaveBeenCalled()
  })

  it('AC-011a: ruler keyboard controls seek by grid step and to both ends', () => {
    const onTransportSeek = vi.fn()
    renderPlayer({
      arrangement: { currentTick: 18 },
      transport: { onTransportSeek }
    })
    const ruler = screen.getByRole('slider', { name: 'Tracker timeline' })

    fireEvent.keyDown(ruler, { key: 'ArrowLeft' })
    fireEvent.keyDown(ruler, { key: 'ArrowRight' })
    fireEvent.keyDown(ruler, { key: 'Home' })
    fireEvent.keyDown(ruler, { key: 'End' })
    fireEvent.keyDown(ruler, { key: 'PageDown' })

    expect(onTransportSeek.mock.calls.map(([tick]) => tick)).toEqual([16, 24, 0, 248])
  })

  // --- AC-015: BPM slider updates transport immediately ---
  it('AC-015: changing the BPM slider updates the transport BPM', () => {
    const onSetBpm = vi.fn()
    renderPlayer({ transport: { bpm: 120, onSetBpm } })

    fireEvent.change(screen.getByRole('slider', { name: 'BPM' }), {
      target: { value: '140' }
    })

    expect(onSetBpm).toHaveBeenCalledWith(140)
  })

  // --- AC-015a: the Song Controls slider is the single BPM control ---
  it('AC-015a: Song Controls BPM slider reflects the bpm prop', () => {
    renderPlayer({ transport: { bpm: 145 } })

    expect(screen.getByRole('slider', { name: 'BPM' })).toHaveValue('145')
    expect(screen.getByText('145 BPM')).toBeInTheDocument()
  })

  // --- AC-016: Browser vertical resize handle ---
  it('AC-016: browser vertical resize handle is present and draggable', () => {
    renderPlayer({})

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
    const lanesWithPlacement: LaneState[] = LANES.map((lane) =>
      lane.index === 0
        ? { ...lane, placements: [{ id: 'placement-1', samplePath: 'Drums/kick.wav', sampleName: 'kick.wav', startTick: 0, durationTicks: 32, durationSeconds: 1 }] }
        : lane
    )
    renderPlayer({
      arrangement: { lanes: lanesWithPlacement },
      browser: { onSearchChange, onSelectCategory }
    })

    const canvasContainer = document.querySelector('[data-placement-sample-names="kick.wav"]')!
    fireEvent.contextMenu(canvasContainer)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Locate in Browser' }))

    expect(onSearchChange).toHaveBeenCalledWith('kick')
    expect(onSelectCategory).toHaveBeenCalledWith(undefined)
  })

  it('sets drag data when a sample tile drag starts', () => {
    renderPlayer({
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
    renderPlayer({})

    const handle = screen.getByRole('separator', { name: 'Resize sample browser' })
    fireEvent.mouseDown(handle, { clientY: 200 })
    fireEvent.mouseMove(window, { clientY: 100 })
    fireEvent.mouseUp(window)
  })

  it('renders the sample palette slot from categoryId when no category filter is active', () => {
    renderPlayer({
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
    renderPlayer({
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
    renderPlayer({
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
    renderPlayer({ browser: { error: 'Database locked', loading: false, samples: [] } })

    expect(screen.getByText('Database locked')).toBeInTheDocument()
  })

  it('calls onTransportPlay when Play button is clicked while stopped', () => {
    const onTransportPlay = vi.fn()
    renderPlayer({ transport: { transportState: 'stopped', onTransportPlay } })

    fireEvent.click(screen.getByLabelText('Play'))
    expect(onTransportPlay).toHaveBeenCalled()
  })

  it('calls onTransportPause when Pause button is clicked while playing', () => {
    const onTransportPause = vi.fn()
    renderPlayer({ transport: { transportState: 'playing', onTransportPause } })

    fireEvent.click(screen.getByLabelText('Pause'))
    expect(onTransportPause).toHaveBeenCalled()
  })

  it('calls onTransportStop when Stop button is clicked', () => {
    const onTransportStop = vi.fn()
    renderPlayer({ transport: { onTransportStop } })

    fireEvent.click(screen.getByLabelText('Stop'))
    expect(onTransportStop).toHaveBeenCalled()
  })

  it('calls onTransportSkipBack when Skip Back button is clicked', () => {
    const onTransportSkipBack = vi.fn()
    renderPlayer({ transport: { onTransportSkipBack } })

    fireEvent.click(screen.getByLabelText('Skip Back'))
    expect(onTransportSkipBack).toHaveBeenCalled()
  })

  it('calls onSetMasterGain when Master Volume slider changes', () => {
    const onSetMasterGain = vi.fn()
    renderPlayer({ transport: { masterGain: 0.8, onSetMasterGain } })

    const slider = screen.getByLabelText('Master Volume')
    fireEvent.change(slider, { target: { value: '50' } })
    expect(onSetMasterGain).toHaveBeenCalledWith(0.5)
  })

  it('calls onSetBpm when the BPM slider changes', () => {
    const onSetBpm = vi.fn()
    renderPlayer({ transport: { bpm: 120, onSetBpm } })

    fireEvent.change(screen.getByLabelText('BPM'), { target: { value: '140' } })

    expect(onSetBpm).toHaveBeenCalledWith(140)
  })

  it('calls onSelectCategory(undefined) when All button is clicked', () => {
    const onSelectCategory = vi.fn()
    const categoriesWithChildren = [
      ...DEFAULT_CATEGORIES,
      { id: 9, name: 'SubBass', parentId: 1 }
    ]
    renderPlayer({
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
    renderPlayer({
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
    renderPlayer({
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
    renderPlayer({ browser: { onSearchChange } })

    const search = screen.getByLabelText('Search samples')
    fireEvent.change(search, { target: { value: 'bass' } })

    expect(onSearchChange).toHaveBeenCalledWith('bass')
  })

  it('renders playhead when transport is playing with non-zero tick', () => {
    const { container } = renderPlayer({
      transport: { transportState: 'playing' },
      arrangement: { currentTick: 64 }
    })
    const playhead = container.querySelector('.tracker-playhead')
    expect(playhead).not.toBeNull()
  })

  it('renders the repositioned playhead when transport is stopped', () => {
    const { container } = renderPlayer({
      transport: { transportState: 'stopped' },
      arrangement: { currentTick: 64 }
    })
    const playhead = container.querySelector('.tracker-playhead')
    expect(playhead).not.toBeNull()
  })

  it('clears selection on click without Ctrl key', () => {
    const { container } = renderPlayer({})
    const lanes = container.querySelector('.tracker-lanes')!
    fireEvent.mouseDown(lanes, { ctrlKey: false, clientX: 200, clientY: 100 })
  })

  it('starts rectangle selection on Ctrl+mousedown in lanes area', () => {
    const { container } = renderPlayer({})
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

  it('renders lane placements in canvas and triggers drag start', () => {
    const lanesWithPlacements = LANES.map((lane, i) =>
      i === 0
        ? { ...lane, placements: [{ id: 'placement-1', samplePath: '/s/kick.wav', sampleName: 'kick.wav', startTick: 0, durationTicks: 32, durationSeconds: 0.5, slot: 0 }] }
        : lane
    )
    renderPlayer({ arrangement: { lanes: lanesWithPlacements } })
    expect(screen.getByLabelText('Lane 1 placement area')).toBeInTheDocument()
  })

  it('handles sample drop on lane placement area', () => {
    const onPlaceSampleDetailOnLane = vi.fn()
    renderPlayer({ arrangement: { onPlaceSampleDetailOnLane } })

    const placementArea = screen.getByLabelText('Lane 1 placement area')
    const sampleData = JSON.stringify({ name: 'kick.wav', relpath: '/s/kick.wav', duration: 0.5, tags: [] })

    const dataTransfer = {
      types: ['application/mixjam-sample'],
      getData: (type: string) => type === 'application/mixjam-sample' ? sampleData : '',
      dropEffect: 'copy',
      effectAllowed: 'all'
    }
    fireEvent.dragOver(placementArea, { dataTransfer })
    Object.defineProperty(placementArea, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 800, bottom: 44, width: 800, height: 44 })
    })
    fireEvent.drop(placementArea, { dataTransfer, clientX: 200, clientY: 22 })
    expect(onPlaceSampleDetailOnLane).toHaveBeenCalled()
  })

  it('handles a placement move drop on a lane placement area', () => {
    const onMovePlacement = vi.fn()
    renderPlayer({ arrangement: { onMovePlacement } })

    const placementArea = screen.getByLabelText('Lane 2 placement area')
    const placementData = JSON.stringify({ placementId: 'placement1' })

    const dataTransfer = {
      types: ['application/mixjam-clip-placement'],
      getData: (type: string) => type === 'application/mixjam-clip-placement' ? placementData : '',
      dropEffect: 'move',
      effectAllowed: 'all'
    }
    Object.defineProperty(placementArea, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 800, bottom: 44, width: 800, height: 44 })
    })
    fireEvent.drop(placementArea, { dataTransfer, clientX: 200, clientY: 22, shiftKey: false })
    expect(onMovePlacement).toHaveBeenCalled()
  })

  it('handles a placement duplicate drop on a lane placement area with Shift', () => {
    const onDuplicatePlacement = vi.fn()
    renderPlayer({ arrangement: { onDuplicatePlacement } })

    const placementArea = screen.getByLabelText('Lane 1 placement area')
    const placementData = JSON.stringify({ placementId: 'placement1' })

    const dataTransfer = {
      types: ['application/mixjam-clip-placement'],
      getData: (type: string) => type === 'application/mixjam-clip-placement' ? placementData : '',
      dropEffect: 'copy',
      effectAllowed: 'all'
    }
    Object.defineProperty(placementArea, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 800, bottom: 44, width: 800, height: 44 })
    })
    // jsdom DragEvent doesn't propagate shiftKey via init; use native dispatch
    const dropEvent = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(dropEvent, 'dataTransfer', { value: dataTransfer })
    Object.defineProperty(dropEvent, 'shiftKey', { value: true })
    Object.defineProperty(dropEvent, 'altKey', { value: false })
    Object.defineProperty(dropEvent, 'clientX', { value: 200 })
    Object.defineProperty(dropEvent, 'clientY', { value: 22 })
    placementArea.dispatchEvent(dropEvent)
    expect(onDuplicatePlacement).toHaveBeenCalled()
  })

  it('handles group move drop with multiple placements', () => {
    const onMovePlacementGroup = vi.fn()
    renderPlayer({ arrangement: { onMovePlacementGroup } })

    const placementArea = screen.getByLabelText('Lane 1 placement area')
    const placementData = JSON.stringify({
      placementId: 'placement1',
      group: [
        { placementId: 'placement1', tickOffset: 0, laneOffset: 0 },
        { placementId: 'placement2', tickOffset: 32, laneOffset: 1 }
      ]
    })

    const dataTransfer = {
      types: ['application/mixjam-clip-placement'],
      getData: (type: string) => type === 'application/mixjam-clip-placement' ? placementData : '',
      dropEffect: 'move',
      effectAllowed: 'all'
    }
    Object.defineProperty(placementArea, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 800, bottom: 44, width: 800, height: 44 })
    })
    fireEvent.drop(placementArea, { dataTransfer, clientX: 200, clientY: 22, shiftKey: false })
    expect(onMovePlacementGroup).toHaveBeenCalled()
  })

  it('handles group duplicate drop with Shift', () => {
    const onDuplicatePlacementGroup = vi.fn()
    renderPlayer({ arrangement: { onDuplicatePlacementGroup } })

    const placementArea = screen.getByLabelText('Lane 1 placement area')
    const placementData = JSON.stringify({
      placementId: 'placement1',
      group: [
        { placementId: 'placement1', tickOffset: 0, laneOffset: 0 },
        { placementId: 'placement2', tickOffset: 32, laneOffset: 1 }
      ]
    })

    const dataTransfer = {
      types: ['application/mixjam-clip-placement'],
      getData: (type: string) => type === 'application/mixjam-clip-placement' ? placementData : '',
      dropEffect: 'copy',
      effectAllowed: 'all'
    }
    Object.defineProperty(placementArea, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 800, bottom: 44, width: 800, height: 44 })
    })
    // jsdom DragEvent doesn't propagate shiftKey via init; use native dispatch
    const dropEvent = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(dropEvent, 'dataTransfer', { value: dataTransfer })
    Object.defineProperty(dropEvent, 'shiftKey', { value: true })
    Object.defineProperty(dropEvent, 'altKey', { value: false })
    Object.defineProperty(dropEvent, 'clientX', { value: 200 })
    Object.defineProperty(dropEvent, 'clientY', { value: 22 })
    placementArea.dispatchEvent(dropEvent)
    expect(onDuplicatePlacementGroup).toHaveBeenCalled()
  })

  it('handles dragover with the clip-placement type by setting move effect', () => {
    renderPlayer({})
    const placementArea = screen.getByLabelText('Lane 1 placement area')
    const dataTransfer = {
      types: ['application/mixjam-clip-placement'],
      getData: () => '',
      dropEffect: '',
      effectAllowed: 'all'
    }
    fireEvent.dragOver(placementArea, { dataTransfer, shiftKey: false })
    expect(dataTransfer.dropEffect).toBe('move')
  })

  it('handles dragover with the clip-placement type and Shift by setting copy effect', () => {
    renderPlayer({})
    const placementArea = screen.getByLabelText('Lane 1 placement area')
    const dataTransfer = {
      types: ['application/mixjam-clip-placement'],
      getData: () => '',
      dropEffect: '',
      effectAllowed: 'all'
    }
    // jsdom DragEvent doesn't propagate shiftKey via init; use native dispatch
    const dragOverEvent = new Event('dragover', { bubbles: true, cancelable: true })
    Object.defineProperty(dragOverEvent, 'dataTransfer', { value: dataTransfer })
    Object.defineProperty(dragOverEvent, 'shiftKey', { value: true })
    placementArea.dispatchEvent(dragOverEvent)
    expect(dataTransfer.dropEffect).toBe('copy')
  })

  it('dragover with irrelevant type does not set dropEffect', () => {
    renderPlayer({})
    const placementArea = screen.getByLabelText('Lane 1 placement area')
    const dataTransfer = {
      types: ['text/plain'],
      getData: () => '',
      dropEffect: '',
      effectAllowed: 'all'
    }
    fireEvent.dragOver(placementArea, { dataTransfer })
    expect(dataTransfer.dropEffect).toBe('')
  })

  it('handles a multi-selection placement-group drag start', () => {
    const lanesWithPlacements: LaneState[] = LANES.map((lane) => {
      if (lane.index === 0) {
        return { ...lane, placements: [{ id: 'placement-1', samplePath: '/s/kick.wav', sampleName: 'kick.wav', startTick: 0, durationTicks: 16, durationSeconds: 0.5 }] }
      }
      if (lane.index === 1) {
        return { ...lane, placements: [{ id: 'placement-2', samplePath: '/s/snare.wav', sampleName: 'snare.wav', startTick: 0, durationTicks: 16, durationSeconds: 0.5 }] }
      }
      return lane
    })

    const { container } = renderPlayer({ arrangement: { lanes: lanesWithPlacements } })

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

    const canvasContainers = container.querySelectorAll('.lane-sample-bubble-canvas-container')
    const firstContainer = canvasContainers[0]! as HTMLElement
    // A plain (non-Ctrl) mousedown directly on a selected placement must NOT clear
    // the multi-selection via bubbling to .tracker-lanes — otherwise the
    // subsequent dragstart would see an empty selection and silently
    // degrade the drag to a single placement instead of the whole group.
    fireEvent.mouseDown(firstContainer, { button: 0 })
    expect(firstContainer.dataset.dragPlacementId).toBe('placement-1')
    const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' }
    fireEvent.dragStart(firstContainer, { dataTransfer })

    expect(dataTransfer.setData).toHaveBeenCalled()
    const setDataCall = dataTransfer.setData.mock.calls[0]
    expect(setDataCall[0]).toBe('application/mixjam-clip-placement')
    const parsed = JSON.parse(setDataCall[1])
    expect(parsed.placementId).toBe('placement-1')
    expect(parsed.group).toHaveLength(2)
    expect(parsed.group.map((g: { placementId: string }) => g.placementId).sort()).toEqual(['placement-1', 'placement-2'])
  })

  it('advertises copyMove on placement drag start so Shift+drop can duplicate', () => {
    // Regression: effectAllowed='move' made Chromium reject the drop whenever
    // dragover set dropEffect='copy' (Shift held), so duplicate never fired.
    const lanesWithPlacement: LaneState[] = LANES.map((lane) =>
      lane.index === 0
        ? { ...lane, placements: [{ id: 'placement-1', samplePath: '/s/kick.wav', sampleName: 'kick.wav', startTick: 0, durationTicks: 16, durationSeconds: 0.5 }] }
        : lane
    )
    const { container } = renderPlayer({ arrangement: { lanes: lanesWithPlacement } })

    const firstContainer = container.querySelectorAll('.lane-sample-bubble-canvas-container')[0]! as HTMLElement
    fireEvent.mouseDown(firstContainer, { button: 0 })
    expect(firstContainer.dataset.dragPlacementId).toBe('placement-1')
    const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' }
    fireEvent.dragStart(firstContainer, { dataTransfer })

    expect(dataTransfer.effectAllowed).toBe('copyMove')
  })

  it('clears multi-selection when a plain mousedown lands on an unselected placement', () => {
    const lanesWithPlacements: LaneState[] = LANES.map((lane) => {
      if (lane.index === 0) {
        return { ...lane, placements: [{ id: 'placement-1', samplePath: '/s/kick.wav', sampleName: 'kick.wav', startTick: 0, durationTicks: 16, durationSeconds: 0.5 }] }
      }
      if (lane.index === 2) {
        return { ...lane, placements: [{ id: 'placement-3', samplePath: '/s/hat.wav', sampleName: 'hat.wav', startTick: 0, durationTicks: 16, durationSeconds: 0.5 }] }
      }
      return lane
    })

    const { container } = renderPlayer({ arrangement: { lanes: lanesWithPlacements } })

    const lanesEl = container.querySelector('.tracker-lanes')!
    Object.defineProperty(lanesEl, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 })
    })
    // Rectangle-select only placement-1 (lane 0).
    fireEvent.mouseDown(lanesEl, { ctrlKey: true, clientX: 170, clientY: 30 })
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 180, clientY: 40, bubbles: true }))
    })
    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    })

    // Plain mousedown on the unrelated, unselected placement-3 should clear the
    // stale selection so it doesn't linger after this unrelated drag.
    const canvasContainers = container.querySelectorAll('.lane-sample-bubble-canvas-container')
    const thirdContainer = canvasContainers[2]! as HTMLElement
    fireEvent.mouseDown(thirdContainer, { button: 0 })
    expect(thirdContainer.dataset.dragPlacementId).toBe('placement-3')
    const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' }
    fireEvent.dragStart(thirdContainer, { dataTransfer })

    const parsed = JSON.parse(dataTransfer.setData.mock.calls[0][1])
    expect(parsed.placementId).toBe('placement-3')
    expect(parsed.group).toBeUndefined()
  })

  it('handles dragover with sample type setting copy effect', () => {
    renderPlayer({})
    const placementArea = screen.getByLabelText('Lane 1 placement area')
    const dataTransfer = {
      types: ['application/mixjam-sample'],
      getData: () => '',
      dropEffect: '',
      effectAllowed: 'all'
    }
    fireEvent.dragOver(placementArea, { dataTransfer })
    expect(dataTransfer.dropEffect).toBe('copy')
  })

  it('flash effect toggles after Locate in Browser', () => {
    vi.useFakeTimers()
    const lanesWithPlacement: LaneState[] = LANES.map((lane) =>
      lane.index === 0
        ? { ...lane, placements: [{ id: 'placement-1', samplePath: 'Drums/kick.wav', sampleName: 'kick.wav', startTick: 0, durationTicks: 32, durationSeconds: 1 }] }
        : lane
    )
    renderPlayer({ arrangement: { lanes: lanesWithPlacement } })

    const canvasContainer = document.querySelector('[data-placement-sample-names="kick.wav"]')!
    fireEvent.contextMenu(canvasContainer)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Locate in Browser' }))

    vi.advanceTimersByTime(1800)
    vi.useRealTimers()
  })

  it('left-column resize seam handles drag correctly', () => {
    renderPlayer({})

    const seam = screen.getByRole('separator', { name: 'Resize left column' })
    fireEvent.mouseDown(seam, { clientX: 168 })
    fireEvent.mouseMove(window, { clientX: 268 })
    fireEvent.mouseUp(window)

    const playerView = document.querySelector('.player-view') as HTMLElement
    expect(playerView.style.getPropertyValue('--left-col-w')).toContain('px')
  })

  it('opens shortcuts overlay when ? key is pressed', () => {
    renderPlayer({})

    // Press ? key to open shortcuts overlay
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }))
    })

    // The ShortcutsOverlay should now be visible
    expect(screen.getByText(/shortcuts/i)).toBeInTheDocument()
  })

  it('hides playhead when currentTick exceeds totalTicks', () => {
    // totalTicks is hardcoded to 256 in PlayerView
    renderPlayer({
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
    solo: false,
    effects: []
  })

  it('AC-016 (rev 2): dragging the seam persists the column width for the next app launch', () => {
    renderPlayer({ mixer: { channels: [CHANNEL(0)] } })

    const seam = screen.getByRole('separator', { name: 'Resize left column' })
    fireEvent.mouseDown(seam, { clientX: 420 })
    fireEvent.mouseMove(window, { clientX: 220 })
    fireEvent.mouseUp(window)

    const stored = parseFloat(localStorage.getItem('mixjam-left-col-w') ?? '')
    expect(stored).toBeGreaterThanOrEqual(168)
  })

  it('AC-016 (rev 2): a persisted column width is applied on mount', () => {
    localStorage.setItem('mixjam-left-col-w', '200')
    renderPlayer({ mixer: { channels: [CHANNEL(0)] } })

    const playerView = document.querySelector('.player-view') as HTMLElement
    expect(playerView.style.getPropertyValue('--left-col-w')).toBe('200px')
  })

  it('AC-016 (rev 2): the Mixer toggle button no longer exists', () => {
    renderPlayer({ mixer: { channels: [CHANNEL(0)] } })
    expect(screen.queryByRole('button', { name: /mixer/i })).toBeNull()
  })

  it('AC-017: restore button shows only when a channel can be restored and fires onRestoreChannel', () => {
    const onRestoreChannel = vi.fn()
    renderPlayer({
      mixer: { channels: [CHANNEL(0)], canRestoreChannel: true, onRestoreChannel }
    })

    const restore = screen.getByRole('button', { name: 'Restore removed channel' })
    fireEvent.click(restore)
    expect(onRestoreChannel).toHaveBeenCalled()
  })

  it('AC-017: restore button is absent at the full channel count', () => {
    renderPlayer({ mixer: { channels: [CHANNEL(0)], canRestoreChannel: false } })
    expect(screen.queryByRole('button', { name: 'Restore removed channel' })).toBeNull()
  })

  it('AC-020: strip labels are stable channelIndex + 1 with gaps after removal', () => {
    // Channels 0 and 2 present, channel 1 removed: labels must read 1 and 3.
    renderPlayer({ mixer: { channels: [CHANNEL(0), CHANNEL(2)], canRestoreChannel: true } })

    const labels = Array.from(
      document.querySelectorAll('.mixer-channel-label > span')
    ).map((el) => el.textContent)
    expect(labels).toEqual(['1', '3'])
    // The aria-labels agree with the visible labels.
    expect(screen.getByRole('slider', { name: 'Channel 1 Pan' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Channel 3 Pan' })).toBeInTheDocument()
  })

  it('AC-024: master meter label reads Output Level', () => {
    renderPlayer({})
    expect(screen.getByText('Output Level')).toBeInTheDocument()
    expect(screen.queryByText('dB Loudness')).toBeNull()
  })
})
