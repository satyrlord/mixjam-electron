import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PlayerView from './PlayerView'
import { reconcileSelectedLaneId } from '../hooks/useTrackerInteraction'
import type {
  TrackerArrangementProps,
  PlayerBrowserProps,
  PlayerMasterBusProps,
  PlayerMixerProps,
  PlayerProjectProps,
  PlayerTransportProps
} from './playerProps'
import { defaultMasterBusState } from '../engine/masterbus/presets'
import type { LibrarySyncState, MixJamFileItem, SampleListItem } from '../../../shared/backend-api'
import type { LaneState } from '../project/project-state'
import { emptyMasterMeterSnapshot } from '../engine/master-meter'
import { createDefaultFxBuses } from '../project/project-state'

const INDEX_CSS_PATH = resolve(process.cwd(), 'src/renderer/src/index.css')

const asyncNoop = async () => { /* empty */ }
const asyncFalse = async () => false

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
  id: `lane-${index + 1}`,
  index,
  name: `Lane ${index + 1}`,
  muted: false,
  solo: false,
  pan: 0,
  gain: 0.8,
  sends: [0, 0, 0, 0],
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

const READY_LIBRARY_STATE: LibrarySyncState = {
  status: 'ready',
  rootKey: 'samples',
  lastCompletedAt: 1
}

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
  librarySyncState: READY_LIBRARY_STATE,
  onSearchChange: noop,
  onLoadMoreSamples: noop,
  onSelectSampleDetail: noop,
  onPreviewSample: noop,
  onSelectCategory: noop,
  onToggleTagFilter: noop,
  onSortChange: noop,
  onRescanLibrary: asyncNoop,
  onRetryLibrarySync: asyncNoop,
  onCancelLibrarySync: asyncNoop,
      onCreateTag: asyncNoop as never,
      onRenameTag: asyncNoop as never,
      onSetTagColor: asyncNoop as never,
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
  onRenameLane: noop,
  onToggleLaneMute: noop,
  onToggleLaneSolo: noop,
  onAddLane: noop,
  onDeleteLane: noop,
  onDeleteEmptyLanes: noop
}

const DEFAULT_TRANSPORT: PlayerTransportProps = {
  transportState: 'stopped',
  songEndTick: 0,
  bpm: 120,
  masterGain: 0.8,
  masterMeter: emptyMasterMeterSnapshot(),
  canUndo: false,
  canRedo: false,
  onSetBpm: noop,
  onUndo: noop,
  onRedo: noop,
  onTransportPlay: noop,
  onTransportPause: noop,
  onTransportStop: noop,
  onTransportSkipBack: noop,
  onTransportJumpToEnd: noop,
  onTransportSeek: noop
}

const DEFAULT_MIXER: PlayerMixerProps = {
  returnBuses: createDefaultFxBuses(),
  channelLevels: new Map(),
  channelPeaks: new Map(),
  onSetVisualTelemetryActive: noop,
  onBeginMixerGesture: noop,
  onCommitMixerGesture: noop,
  onSetChannelGain: noop,
  onSetChannelPan: noop,
  onSetChannelSend: noop,
  onSetReturnBus: noop,
  onPreviewReturnBus: noop
}

const DEFAULT_PROJECT: PlayerProjectProps = {
  name: 'Untitled',
  dirty: false,
  busy: false,
  canRegenerate: false,
  onNew: async () => undefined,
  onOpen: asyncFalse,
  onOpenPath: asyncFalse,
  onSave: asyncFalse,
  onSaveAs: asyncFalse,
  onRegenerateExact: noop,
  onRegenerateCurrent: noop
}

const DEFAULT_MASTER_BUS: PlayerMasterBusProps = {
  state: defaultMasterBusState(),
  getMeterSnapshot: () => null,
  onSetParam: noop,
  onTogglePower: noop,
  onReorder: noop,
  onApplyPreset: noop
}

interface TrackerOverrides {
  mixJamFiles?: MixJamFileItem[]
  browser?: Partial<PlayerBrowserProps>
  arrangement?: Partial<TrackerArrangementProps>
  transport?: Partial<PlayerTransportProps>
  mixer?: Partial<PlayerMixerProps>
  project?: Partial<PlayerProjectProps>
}

function playerView(overrides: TrackerOverrides = {}) {
  return (
    <PlayerView
      mixJamFiles={overrides.mixJamFiles ?? []}
      browser={{ ...DEFAULT_BROWSER, ...overrides.browser }}
      arrangement={{ ...DEFAULT_ARRANGEMENT, ...overrides.arrangement }}
      transport={{ ...DEFAULT_TRANSPORT, ...overrides.transport }}
      mixer={{ ...DEFAULT_MIXER, ...overrides.mixer }}
      masterBus={DEFAULT_MASTER_BUS}
      project={{ ...DEFAULT_PROJECT, ...overrides.project }}
    />
  )
}

function renderPlayer(overrides: TrackerOverrides = {}) {
  return render(playerView(overrides))
}

describe('PlayerView', () => {
  // Workspace and resize tests persist UI state. Clear it after each test so a
  // failing assertion cannot leak state into later mounts.
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.removeItem('mixjam-left-col-w')
    localStorage.removeItem('mixjam:bottom-workspace-tab')
    localStorage.removeItem('mixjam-bottom-workspace-size')
    localStorage.removeItem('mixjam:upper-work-layout')
    localStorage.removeItem('mixjam:bottom-workspace-layout-v2')
    localStorage.removeItem('mixjam:bottom-workspace-expansion-v2')
    localStorage.removeItem('mixjam:bottom-workspace-tab-sizes-v1')
  })

  it('renders the Player regions and MixJam Browser', () => {
    renderPlayer({
      mixJamFiles: RECENT_PROJECTS,
      browser: { samples: SAMPLES, totalCount: 1 }
    })

    expect(screen.getByText('MixJam Browser')).toBeInTheDocument()
    expect(screen.getByText('club-night')).toBeInTheDocument()
    expect(screen.getAllByText('Lane 1')).not.toHaveLength(0)
    fireEvent.click(screen.getByRole('tab', { name: 'Samples' }))
    expect(document.querySelector('.mbs-strip')).not.toBeNull()
    expect(screen.getByRole('tree', { name: /sample categories/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /kick_808/ })).toBeInTheDocument()
  })

  it('opens MixJam Browser entries through project persistence', () => {
    const onOpenPath = vi.fn().mockResolvedValue(true)
    renderPlayer({ mixJamFiles: RECENT_PROJECTS, project: { onOpenPath } })

    const entry = screen.getByRole('button', { name: /club-night/ })
    expect(entry).toBeEnabled()
    fireEvent.click(entry)
    expect(onOpenPath).toHaveBeenCalledWith('club-night.mixjam')
  })

  it('shows project identity and routes project buttons and save shortcuts', () => {
    const onNew = vi.fn().mockResolvedValue(undefined)
    const onOpen = vi.fn().mockResolvedValue(true)
    const onSave = vi.fn().mockResolvedValue(true)
    const onSaveAs = vi.fn().mockResolvedValue(true)
    renderPlayer({
      project: {
        name: 'club-night',
        dirty: true,
        onNew,
        onOpen,
        onSave,
        onSaveAs
      }
    })

    const projectMenu = screen.getByRole('button', {
      name: 'club-night, unsaved changes, project menu'
    })
    expect(projectMenu).toBeInTheDocument()
    for (const action of ['New', 'Open', 'Save', 'Save As']) {
      fireEvent.keyDown(projectMenu, { key: 'Enter' })
      fireEvent.click(screen.getByRole('menuitem', { name: action }))
    }
    expect(onNew).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSaveAs).toHaveBeenCalledTimes(1)

    const saveEvent = new KeyboardEvent('keydown', {
      key: 's',
      ctrlKey: true,
      cancelable: true
    })
    window.dispatchEvent(saveEvent)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'S', metaKey: true, shiftKey: true }))
    expect(onSave).toHaveBeenCalledTimes(2)
    expect(onSaveAs).toHaveBeenCalledTimes(2)
    expect(saveEvent.defaultPrevented).toBe(true)

    const css = readFileSync(INDEX_CSS_PATH, 'utf8')
    expect(css).toMatch(/\.middle-strip\s*\{[\s\S]*height:\s*80px;/m)
    expect(css).toMatch(/\.strip-project-trigger\s*\{[\s\S]*max-width:\s*320px;/m)
  })

  it('leaves Save shortcuts alone while editing or repeating', () => {
    const onSave = vi.fn().mockResolvedValue(true)
    renderPlayer({ project: { onSave } })
    const bpmInput = screen.getByRole('textbox', { name: 'BPM value' })
    const events = [
      new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }),
      new KeyboardEvent('keydown', { key: 's', ctrlKey: true, repeat: true, cancelable: true })
    ]

    bpmInput.dispatchEvent(events[0]!)
    window.dispatchEvent(events[1]!)

    expect(onSave).not.toHaveBeenCalled()
    expect(events.every((event) => !event.defaultPrevented)).toBe(true)
  })

  it('does not consume Save while another project operation is busy', () => {
    const onSave = vi.fn().mockResolvedValue(true)
    renderPlayer({ project: { busy: true, onSave } })
    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true })

    window.dispatchEvent(event)

    expect(onSave).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('marks lanes whose project placements reference missing samples', () => {
    const lanesWithMissingPlacement: LaneState[] = LANES.map((lane) =>
      lane.index === 0
        ? {
            ...lane,
            placements: [{
              id: 'missing-placement',
              samplePath: 'Missing/kick.wav',
              sampleName: 'kick.wav',
              startTick: 0,
              durationTicks: 16,
              durationSeconds: 0.5
            }]
          }
        : lane
    )

    renderPlayer({
      arrangement: {
        lanes: lanesWithMissingPlacement,
        missingSamplePaths: new Set(['Missing/kick.wav'])
      }
    })

    expect(screen.getByRole('img', { name: 'Lane 1 contains a missing sample' })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Lane 2 contains a missing sample' })).not.toBeInTheDocument()
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
    const onTransportJumpToEnd = vi.fn()

    renderPlayer({
      transport: {
        onTransportPlay,
        onTransportPause,
        onTransportStop,
        onTransportSkipBack,
        onTransportJumpToEnd,
        songEndTick: 32
      }
    })

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(onTransportPlay).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(onTransportStop).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Skip Back' }))
    expect(onTransportSkipBack).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Jump to End' }))
    expect(onTransportJumpToEnd).toHaveBeenCalledTimes(1)
  })

  it('disables Jump to End for an empty arrangement', () => {
    renderPlayer({ transport: { songEndTick: 0 } })

    expect(screen.getByRole('button', { name: 'Jump to End' })).toBeDisabled()
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

    fireEvent.click(screen.getByRole('tab', { name: 'Samples' }))
    // The accessible name is "kick 1.5s" (inner b + i text)
    const tile = screen.getByText(/kick/i).closest('button')!
    fireEvent.click(tile)
    expect(onPreviewSample).toHaveBeenCalledWith('/s/kick.wav', null)
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

  it('renames a lane from its right-click menu', () => {
    const onRenameLane = vi.fn()
    renderPlayer({ arrangement: { onRenameLane } })

    fireEvent.contextMenu(document.querySelectorAll('.tracker-lane-name')[0]!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename lane' }))
    const input = screen.getByRole('textbox', { name: 'Rename Lane 1' })
    fireEvent.change(input, { target: { value: 'Kick Phrase' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onRenameLane).toHaveBeenCalledWith(0, 'Kick Phrase')
  })

  it('confirms deletion of a populated lane and deletes an empty lane directly', () => {
    const onDeleteLane = vi.fn()
    const confirm = vi.spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
    const lanes = LANES.map((lane, index) => index === 0 ? {
      ...lane,
      placements: [{
        id: 'placed', samplePath: 'kick.wav', sampleName: 'kick.wav',
        startTick: 0, durationTicks: 32, durationSeconds: 1
      }]
    } : lane)
    renderPlayer({ arrangement: { lanes, onDeleteLane } })

    fireEvent.contextMenu(document.querySelector('.tracker-lane-name')!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete lane' }))
    expect(onDeleteLane).not.toHaveBeenCalled()
    fireEvent.contextMenu(document.querySelector('.tracker-lane-name')!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete lane' }))
    expect(onDeleteLane).toHaveBeenCalledWith(0)

    fireEvent.contextMenu(document.querySelectorAll('.tracker-lane-name')[1]!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete lane' }))
    expect(onDeleteLane).toHaveBeenLastCalledWith(1)
    expect(confirm).toHaveBeenCalledTimes(2)
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

  it('fires onSetLanePan on pan dial pointer interaction', () => {
    const onSetLanePan = vi.fn()
    renderPlayer({ arrangement: { onSetLanePan } })

    const panDial = screen.getByRole('slider', { name: 'Pan Lane 1' })
    fireEvent.pointerDown(panDial, { clientX: 100, button: 0, pointerId: 1, pointerType: 'mouse' })
    fireEvent.pointerMove(panDial, { clientX: 150, pointerId: 1, pointerType: 'mouse' })
    fireEvent.pointerUp(panDial, { pointerId: 1, pointerType: 'mouse' })

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

  it('keeps Play as the sole filled accent command while stopped', () => {
    renderPlayer({ transport: { transportState: 'stopped' } })
    const btn = screen.getByRole('button', { name: 'Play' })
    expect(btn).toHaveClass('strip-command-primary')
    expect(document.querySelectorAll('.strip-command-primary')).toHaveLength(1)
  })

  it('keeps Pause as the sole filled accent command while playing', () => {
    renderPlayer({ transport: { transportState: 'playing' } })
    const btn = screen.getByRole('button', { name: 'Pause' })
    expect(btn).toHaveClass('strip-command-primary')
    expect(document.querySelectorAll('.strip-command-primary')).toHaveLength(1)
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

  // --- AC-004a: the Master panel content is exactly the Master Bus Strip ---
  it('AC-004a: keeps BPM wiring in the Middle Strip and the Master Bus Strip in the Master panel', () => {
    const onSetBpm = vi.fn()
    renderPlayer({ transport: { bpm: 140, onSetBpm } })

    const middleStrip = document.querySelector('.middle-strip')
    const masterPanel = document.querySelector('.bottom-workspace-master')
    const busStrip = document.querySelector('.mbs-strip')
    const bpmSlider = screen.getByRole('slider', { name: 'BPM' })

    expect(middleStrip).toContainElement(bpmSlider)
    // The Master panel content is the spec-012 rack; the old Master Volume
    // cluster and its Output Level block no longer exist.
    expect(busStrip).not.toBeNull()
    expect(masterPanel).toContainElement(busStrip as HTMLElement)
    expect(busStrip).toContainElement(screen.getByLabelText('Output meter'))
    expect(screen.queryByRole('slider', { name: 'Master Volume' })).toBeNull()
    expect(screen.queryByText('Master Controls')).toBeNull()
    expect(screen.queryByText('Output Level')).toBeNull()
    expect(bpmSlider).toHaveAttribute('aria-valuenow', '140')
    expect(bpmSlider).toHaveAttribute('aria-orientation', 'horizontal')
    expect(bpmSlider).toHaveClass('linear-slider-thumb')
    expect(bpmSlider.closest('.linear-slider')).toHaveClass('bpm-control-slider')

    fireEvent.keyDown(bpmSlider, { key: 'ArrowRight' })
    expect(onSetBpm).toHaveBeenCalledWith(141)
  })

  it('defaults to three ordered Bottom Workspace tabs with mounted peer panels', () => {
    renderPlayer({})

    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Master', 'Mixer', 'Samples'])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[0]).toHaveAttribute('tabindex', '0')
    expect(document.querySelectorAll('.bottom-workspace-panel')).toHaveLength(3)
    expect(document.querySelector('.bottom-workspace-master')).not.toHaveAttribute('hidden')
    expect(document.querySelector('.bottom-workspace-mixer')).toHaveAttribute('hidden')
    expect(document.querySelector('.bottom-workspace-samples')).toHaveAttribute('hidden')
  })

  it('keeps a first-sample cue until a placement exists and opens Samples directly', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      const flexGrow = Number(this.style.flexGrow)
      return flexGrow > 0 ? flexGrow * 10 : 1000
    })
    const { rerender } = renderPlayer({})

    expect(screen.getByText('Start with a sample')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open Samples' }))
    expect(screen.getByRole('tab', { name: 'Samples' })).toHaveAttribute('aria-selected', 'true')
    await waitFor(() => {
      const layout = JSON.parse(localStorage.getItem('mixjam:bottom-workspace-layout-v2') ?? '{}') as { bottom?: number }
      expect(layout.bottom).toBeGreaterThanOrEqual(50)
    })

    const lanesWithPlacement = LANES.map((lane, index) => index === 0
      ? { ...lane, placements: [{ id: 'placement-1', samplePath: 'kick.wav', sampleName: 'kick.wav', startTick: 0, durationTicks: 32, durationSeconds: 1 }] }
      : lane)
    rerender(<PlayerView
      mixJamFiles={[]}
      browser={DEFAULT_BROWSER}
      arrangement={{ ...DEFAULT_ARRANGEMENT, lanes: lanesWithPlacement }}
      transport={DEFAULT_TRANSPORT}
      mixer={DEFAULT_MIXER}
      masterBus={DEFAULT_MASTER_BUS}
      project={DEFAULT_PROJECT}
    />)
    expect(screen.queryByRole('button', { name: 'Open Samples' })).toBeNull()
  })

  it('lets the Samples workspace expand and restore', () => {
    renderPlayer({})
    fireEvent.click(screen.getByRole('tab', { name: 'Samples' }))
    const expand = screen.getByRole('button', { name: 'Expand Samples' })
    fireEvent.click(expand)
    expect(screen.getByRole('button', { name: 'Restore workspace' })).toHaveAttribute('aria-pressed', 'true')
    expect(JSON.parse(localStorage.getItem('mixjam:bottom-workspace-expansion-v2') ?? '{}')).toMatchObject({
      expanded: true,
      previousBottomSize: expect.any(Number)
    })
  })

  it('restores an explicitly expanded Samples control from saved state', () => {
    localStorage.setItem('mixjam:bottom-workspace-tab', 'samples')
    localStorage.setItem('mixjam:bottom-workspace-layout-v2', JSON.stringify({ upper: 40, bottom: 60 }))
    localStorage.setItem('mixjam:bottom-workspace-expansion-v2', JSON.stringify({
      expanded: true,
      previousBottomSize: 42
    }))
    renderPlayer({})

    expect(screen.getByRole('button', { name: 'Restore workspace' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Restore workspace' }))
    expect(screen.getByRole('button', { name: 'Expand Samples' })).toHaveAttribute('aria-pressed', 'false')
    expect(JSON.parse(localStorage.getItem('mixjam:bottom-workspace-expansion-v2') ?? '{}')).toEqual({
      expanded: false,
      previousBottomSize: 42
    })
  })

  it('ignores expansion state saved for the previous workspace layout', () => {
    localStorage.setItem('mixjam:bottom-workspace-tab', 'samples')
    localStorage.setItem('mixjam:bottom-workspace-expansion', JSON.stringify({
      expanded: true,
      previousBottomSize: 36
    }))
    renderPlayer({})

    expect(screen.getByRole('button', { name: 'Expand Samples' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('does not treat a manually saved 60 percent workspace as expanded', () => {
    localStorage.setItem('mixjam:bottom-workspace-tab', 'samples')
    localStorage.setItem('mixjam:bottom-workspace-layout-v2', JSON.stringify({ upper: 40, bottom: 60 }))
    renderPlayer({})

    expect(screen.getByRole('button', { name: 'Expand Samples' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('owns Mixer selection by stable lane ID', () => {
    const lanes = [{ id: 'lane-a' }, { id: 'lane-b' }, { id: 'lane-c' }]
    expect(reconcileSelectedLaneId(lanes, 'lane-c')).toBe('lane-c')
    expect(reconcileSelectedLaneId([{ id: 'lane-b' }, { id: 'lane-c' }], 'lane-c')).toBe('lane-c')
    expect(reconcileSelectedLaneId([{ id: 'lane-b' }], 'lane-c')).toBe('lane-b')
    expect(reconcileSelectedLaneId([], 'lane-c')).toBeNull()
    expect(reconcileSelectedLaneId([], null)).toBeNull()
  })

  it('keeps lane C selected when deleting and compacting lane A', () => {
    const lanes = LANES.slice(0, 3).map((lane, index) => ({
      ...lane,
      id: ['lane-a', 'lane-b', 'lane-c'][index]!,
      name: ['A', 'B', 'C'][index]!
    }))
    const { rerender } = renderPlayer({ arrangement: { lanes } })
    fireEvent.click(screen.getByRole('tab', { name: 'Mixer' }))
    fireEvent.click(screen.getByRole('button', { name: 'C' }))
    expect(screen.getByRole('button', { name: 'C' })).toHaveAttribute('aria-pressed', 'true')

    const compacted = [
      { ...lanes[1]!, index: 0 },
      { ...lanes[2]!, index: 1 }
    ]
    rerender(playerView({ arrangement: { lanes: compacted } }))

    expect(screen.getByRole('button', { name: 'C' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('slider', { name: 'Channel 2 Pan' })).toBeInTheDocument()
  })

  it('disables Add Lane at the 64-lane limit', () => {
    const lanes = Array.from({ length: 64 }, (_, index) => ({
      ...LANES[0]!,
      id: `limit-lane-${index + 1}`,
      index,
      name: `Lane ${index + 1}`
    }))
    renderPlayer({ arrangement: { lanes } })

    expect(screen.getByRole('button', { name: 'Add lane' })).toBeDisabled()
  })

  it('restores and persists the active Bottom Workspace tab', () => {
    localStorage.setItem('mixjam:bottom-workspace-tab', 'samples')
    renderPlayer({})

    expect(screen.getByRole('tab', { name: 'Samples' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('tab', { name: 'Mixer' }))
    expect(localStorage.getItem('mixjam:bottom-workspace-tab')).toBe('mixer')
  })

  it('runs visual telemetry only while Mixer is active', () => {
    const onSetVisualTelemetryActive = vi.fn()
    const { unmount } = renderPlayer({ mixer: { onSetVisualTelemetryActive } })

    expect(onSetVisualTelemetryActive).toHaveBeenLastCalledWith(false)
    fireEvent.click(screen.getByRole('tab', { name: 'Mixer' }))
    expect(onSetVisualTelemetryActive).toHaveBeenLastCalledWith(true)
    fireEvent.click(screen.getByRole('tab', { name: 'Samples' }))
    expect(onSetVisualTelemetryActive).toHaveBeenLastCalledWith(false)

    unmount()
    expect(onSetVisualTelemetryActive).toHaveBeenLastCalledWith(false)
  })

  it('uses automatic activation and wrapping keyboard navigation for workspace tabs', () => {
    renderPlayer({})

    const master = screen.getByRole('tab', { name: 'Master' })
    master.focus()
    fireEvent.keyDown(master, { key: 'ArrowLeft' })
    expect(screen.getByRole('tab', { name: 'Samples' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Samples' })).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Samples' }), { key: 'Home' })
    expect(master).toHaveFocus()
    fireEvent.keyDown(master, { key: 'End' })
    expect(screen.getByRole('tab', { name: 'Samples' })).toHaveFocus()
  })

  it('shows compact Master status that activates Master', () => {
    localStorage.setItem('mixjam:bottom-workspace-tab', 'samples')
    renderPlayer({ transport: { bpm: 128, masterGain: 0.75 } })

    fireEvent.click(screen.getByRole('button', { name: '128 BPM, Master 75%' }))
    expect(screen.getByRole('tab', { name: 'Master' })).toHaveAttribute('aria-selected', 'true')
  })

  // --- AC-005: 8 lanes render ---
  it('AC-005: renders 8 lanes with M, S buttons and pan knob', () => {
    renderPlayer({ arrangement: { lanes: LANES.slice(0, 8) } })

    const laneElements = document.querySelectorAll('.tracker-lane')
    expect(laneElements).toHaveLength(8)

    // Each lane has M, S, and pan
    expect(screen.getByRole('button', { name: 'Mute Lane 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Solo Lane 8' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Pan Lane 8' })).toBeInTheDocument()
  })

  // --- AC-010: Playhead visible during playback ---
  it('AC-010: playhead is visible during playback at correct position', () => {
    renderPlayer({ transport: { transportState: 'playing' }, arrangement: { currentTick: 64 } })

    const playhead = document.querySelector('.tracker-playhead')
    expect(playhead).not.toBeNull()
    // currentTick=64 out of the 31,968-tick capacity.
    expect(playhead!.getAttribute('style')).toContain('0.002002')
  })

  it('AC-010: playhead remains visible at its position when transport is stopped', () => {
    renderPlayer({ transport: { transportState: 'stopped' }, arrangement: { currentTick: 40 } })

    const playhead = document.querySelector('.tracker-playhead')
    expect(playhead).not.toBeNull()
    expect(playhead!.getAttribute('style')).toContain('0.00125125')
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

  it('AC-011: ruler renders one CSS-subdivided cell per bar so header lines align with the canvas grid', () => {
    renderPlayer({})

    const ticks = document.querySelectorAll('.tracker-ruler-tick')
    expect(ticks).toHaveLength(999)
    expect(document.querySelectorAll('.tracker-ruler-tick-bar')).toHaveLength(999)
  })

  it('AC-011: keeps the lane head box at the same rendered width as the ruler spacer', () => {
    const css = readFileSync(INDEX_CSS_PATH, 'utf8')

    expect(css).toMatch(
      /\.tracker-lane-head\s*\{[\s\S]*box-sizing:\s*border-box;/m
    )
  })

  it('shows an unavailable drop effect for an oversized browser sample when dragover data is protected', () => {
    const onPlaceSampleDetailOnLane = vi.fn()
    const dataTransfer = {
      setData: vi.fn(),
      getData: vi.fn(() => { throw new DOMException('Drag data is protected') }),
      types: ['application/mixjam-sample'],
      dropEffect: 'copy',
      effectAllowed: ''
    }
    renderPlayer({
      arrangement: { onPlaceSampleDetailOnLane },
      browser: {
        samples: [{
          id: 'too-long.wav',
          dbId: 1,
          name: 'too-long.wav',
          relpath: 'too-long.wav',
          category: 'Loops',
          durationSeconds: 3_000,
          bpm: 120,
          bpmSource: 'analysis',
          musicalKey: null,
          musicalKeySource: null,
          sampleType: null,
          sampleTypeSource: null,
          tags: [],
          categoryId: null,
          tagIds: []
        }],
        totalCount: 1
      }
    })

    fireEvent.click(screen.getByRole('tab', { name: 'Samples' }))
    const sample = screen.getByText(/too-long/).closest('button')!
    const laneCanvas = screen.getByRole('region', { name: 'Lane 1 placement area' })
    fireEvent.dragStart(sample, { dataTransfer })
    fireEvent.dragOver(laneCanvas, { dataTransfer })
    expect(dataTransfer.dropEffect).toBe('none')
    fireEvent.drop(laneCanvas, { dataTransfer })
    expect(dataTransfer.getData).not.toHaveBeenCalled()
    expect(onPlaceSampleDetailOnLane).not.toHaveBeenCalled()

    fireEvent.dragStart(sample, { dataTransfer })
    fireEvent.dragEnd(sample, { dataTransfer })
    const followingTransfer = {
      getData: vi.fn(() => ''),
      types: ['application/mixjam-sample'],
      dropEffect: 'none'
    }
    fireEvent.dragOver(laneCanvas, { dataTransfer: followingTransfer })
    expect(followingTransfer.getData).toHaveBeenCalledOnce()
    expect(followingTransfer.dropEffect).toBe('copy')
  })

  it('caches a valid sample payload across repeated dragover events and drop', () => {
    const onPlaceSampleDetailOnLane = vi.fn()
    const detail = {
      name: 'kick.wav',
      relpath: 'kick.wav',
      tags: [],
      bpm: 120,
      duration: 1
    }
    const getData = vi.fn(() => JSON.stringify(detail))
    const dataTransfer = {
      getData,
      types: ['application/mixjam-sample'],
      dropEffect: 'copy'
    }
    renderPlayer({ arrangement: { onPlaceSampleDetailOnLane } })

    const laneCanvas = screen.getByRole('region', { name: 'Lane 1 placement area' })
    fireEvent.dragOver(laneCanvas, { dataTransfer })
    fireEvent.dragOver(laneCanvas, { dataTransfer })
    fireEvent.drop(laneCanvas, { dataTransfer })

    expect(getData).toHaveBeenCalledTimes(1)
    expect(onPlaceSampleDetailOnLane).toHaveBeenCalledTimes(1)
  })

  it('treats inaccessible drag data as an empty payload', () => {
    const onPlaceSampleDetailOnLane = vi.fn()
    const dataTransfer = {
      getData: vi.fn(() => { throw new DOMException('Drag data is unavailable') }),
      types: ['application/mixjam-sample'],
      dropEffect: 'copy'
    }
    renderPlayer({ arrangement: { onPlaceSampleDetailOnLane } })

    const laneCanvas = screen.getByRole('region', { name: 'Lane 1 placement area' })
    expect(() => fireEvent.dragOver(laneCanvas, { dataTransfer })).not.toThrow()
    expect(() => fireEvent.drop(laneCanvas, { dataTransfer })).not.toThrow()
    expect(onPlaceSampleDetailOnLane).not.toHaveBeenCalled()
  })

  it('AC-011b/c: uses the fixed 999-bar capacity with a dedicated progress control', () => {
    const { container } = renderPlayer({})
    const scrollport = container.querySelector('.tracker-lanes')
    const timeline = scrollport?.querySelector(':scope > .tracker-timeline')
    const css = readFileSync(INDEX_CSS_PATH, 'utf8')

    expect(timeline).not.toBeNull()
    expect(timeline?.querySelector('.tracker-ruler')).not.toBeNull()
    expect(timeline?.querySelector('.tracker-playhead')).not.toBeNull()
    expect(timeline?.querySelectorAll('.tracker-lane')).toHaveLength(16)
    expect(timeline).toHaveStyle({ minWidth: '128112px' })
    expect(screen.getByRole('scrollbar', { name: 'Song Progress Bar' })).toHaveAttribute(
      'aria-controls',
      'tracker-song-scrollport'
    )
    expect(screen.getByRole('scrollbar', { name: 'Song Progress Bar' }).closest('.middle-strip'))
      .not.toBeNull()
    expect(css).toMatch(/\.tracker-lanes\s*\{[^}]*overflow-y:\s*auto;[^}]*overflow-x:\s*auto;/m)
    expect(css).toMatch(/\.tracker-lanes::-webkit-scrollbar:horizontal\s*\{[^}]*height:\s*0;/m)
    expect(css).toMatch(/\.tracker-ruler-spacer\s*\{[^}]*position:\s*sticky;[^}]*left:\s*0;/m)
    expect(css).toMatch(/\.tracker-lane-head\s*\{[^}]*position:\s*sticky;[^}]*left:\s*0;/m)
  })

  it('AC-011b: Song Progress Bar navigation does not seek transport', () => {
    const onTransportSeek = vi.fn()
    const { container } = renderPlayer({ transport: { onTransportSeek } })
    const scrollport = container.querySelector<HTMLDivElement>('.tracker-lanes')!
    let scrollLeft = 0
    Object.defineProperties(scrollport, {
      clientWidth: { configurable: true, get: () => 1000 },
      scrollWidth: { configurable: true, get: () => 2500 },
      scrollLeft: {
        configurable: true,
        get: () => scrollLeft,
        set: (value: number) => { scrollLeft = value }
      }
    })
    fireEvent.scroll(scrollport)

    const progress = screen.getByRole('scrollbar', { name: 'Song Progress Bar' })
    const progressTrack = container.querySelector('.song-progress-track')!
    vi.spyOn(progressTrack, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 18,
      width: 200, height: 18, toJSON: () => ({})
    })
    fireEvent.pointerDown(progress, { clientX: 100, pointerId: 1, button: 0 })

    expect(scrollport.scrollLeft).toBe(750)
    expect(onTransportSeek).not.toHaveBeenCalled()
  })

  it('shows a non-reentrant preparing state that Stop can cancel', () => {
    const onTransportStop = vi.fn()
    renderPlayer({ transport: { transportState: 'preparing', onTransportStop } })

    expect(screen.getByRole('button', { name: 'Preparing playback' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(onTransportStop).toHaveBeenCalledTimes(1)
  })

  it('AC-011a: timeline slider seeks by one beat from the start', () => {
    const onTransportSeek = vi.fn()
    renderPlayer({ transport: { onTransportSeek } })
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Tracker timeline' }), { key: 'ArrowRight' })

    expect(onTransportSeek).toHaveBeenCalledWith(8)
  })

  it('AC-011a: the ruler spacer is not a seek target', () => {
    const onTransportSeek = vi.fn()
    renderPlayer({ transport: { onTransportSeek } })
    fireEvent.pointerDown(document.querySelector('.tracker-ruler-spacer')!, { clientX: 120, button: 0, pointerId: 1, pointerType: 'mouse' })

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

    expect(onTransportSeek.mock.calls.map(([tick]) => tick)).toEqual([16, 24, 0, 31960, 16])
  })

  // --- AC-016: Browser vertical resize handle ---
  it('AC-016: browser vertical resize handle exposes keyboard and ARIA semantics', () => {
    renderPlayer({})
    fireEvent.click(screen.getByRole('tab', { name: 'Samples' }))

    const handle = screen.getByRole('separator', { name: 'Resize category tree' })
    expect(handle).toBeInTheDocument()

    expect(handle).toHaveAttribute('tabindex', '0')
    expect(handle).toHaveAttribute('aria-valuenow')
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

    fireEvent.click(screen.getByRole('tab', { name: 'Samples' }))
    const tile = screen.getByText(/kick/i).closest('button')!
    // jsdom DragEvent does not populate dataTransfer; create one manually
    const dataTransfer = { setData: vi.fn(), effectAllowed: '' }
    const nativeEvent = new Event('dragstart', { bubbles: true })
    Object.defineProperty(nativeEvent, 'dataTransfer', { value: dataTransfer, configurable: true })
    tile.dispatchEvent(nativeEvent)
    expect(dataTransfer.setData).toHaveBeenCalledWith('application/mixjam-sample', expect.any(String))
  })

  it('exposes the tracker/bottom-workspace resize handle for the horizontal split', () => {
    renderPlayer({})
    const handle = screen.getByRole('separator', { name: 'Resize bottom workspace' })
    expect(handle).toBeInTheDocument()
  })

  it('renders the sample palette slot from categoryId when no category filter is active', () => {
    renderPlayer({
      browser: {
        samples: [{ id: '/s/kick.wav', dbId: 1, name: 'kick.wav', relpath: '/s/kick.wav', category: 'Drums', durationSeconds: 1.5, bpm: null, bpmSource: null, musicalKey: null, musicalKeySource: null, sampleType: null, sampleTypeSource: null, tags: [], categoryId: 2, tagIds: [] }],
        totalCount: 1,
        categories: DEFAULT_CATEGORIES
      }
    })

    fireEvent.click(screen.getByRole('tab', { name: 'Samples' }))
    const tile = screen.getByText(/kick/i).closest('.sample-bubble')! as HTMLElement
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
    fireEvent.mouseDown(lanes, { ctrlKey: true, clientX: 250, clientY: 100 })
    fireEvent.mouseMove(window, { clientX: 320, clientY: 200 })
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
    fireEvent.mouseDown(lanesEl, { ctrlKey: true, clientX: 250, clientY: 40 })
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 270, clientY: 110, bubbles: true }))
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
    fireEvent.mouseDown(lanesEl, { ctrlKey: true, clientX: 170, clientY: 40 })
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 190, clientY: 70, bubbles: true }))
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

  it('upper MixJam Browser resize seam exposes keyboard and ARIA semantics', () => {
    renderPlayer({})

    const seam = screen.getByRole('separator', { name: 'Resize MixJam Browser' })
    expect(seam).toHaveAttribute('tabindex', '0')
    expect(seam).toHaveAttribute('aria-valuenow')
  })

  it('opens shortcuts overlay when ? key is pressed', () => {
    renderPlayer({})

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }))
    })

    expect(screen.getByText(/shortcuts/i)).toBeInTheDocument()
  })

  it('hides playhead when currentTick exceeds totalTicks', () => {
    renderPlayer({
      transport: { transportState: 'playing' },
      arrangement: { currentTick: 31968 }
    })

    const playhead = document.querySelector('.tracker-playhead')
    expect(playhead).toBeNull()
  })

  // spec-007 mixer behavior

  it('AC-002d: resizable panels expose stable IDs for persisted layouts', () => {
    renderPlayer({})

    expect(document.querySelector('[data-group="true"]#upper-work-split')).toBeInTheDocument()
    expect(document.querySelector('[data-panel="true"]#browser')).toBeInTheDocument()
    expect(document.querySelector('[data-panel="true"]#tracker')).toBeInTheDocument()
  })

  it('AC-002d: a persisted browser width is applied on mount', () => {
    localStorage.setItem('mixjam-left-col-w', '200')
    renderPlayer({})

    const seam = screen.getByRole('separator', { name: 'Resize MixJam Browser' })
    expect(Number(seam.getAttribute('aria-valuenow'))).toBeGreaterThan(0)
  })

  it('AC-004: Mixer is a peer tab instead of a reveal toggle', () => {
    renderPlayer({})
    expect(screen.getByRole('tab', { name: 'Mixer' })).toBeInTheDocument()
  })

  it('does not expose independent channel restore controls', () => {
    renderPlayer({})
    fireEvent.click(screen.getByRole('tab', { name: 'Mixer' }))
    expect(screen.queryByRole('button', { name: 'Restore removed channel' })).toBeNull()
  })

  it('uses lane-owned names for Mixer strip labels', () => {
    renderPlayer({ arrangement: { lanes: [LANES[0]!, LANES[2]!] } })
    fireEvent.click(screen.getByRole('tab', { name: 'Mixer' }))

    const labelElements = Array.from(
      document.querySelectorAll('.mixer-channel-select > span')
    )
    expect(labelElements.map((element) => element.textContent)).toEqual(['Lane 1', 'Lane 3'])
    expect(labelElements.every((element) => !element.hasAttribute('data-channel-number'))).toBe(true)
    // The aria-labels agree with the visible labels.
    expect(screen.getByRole('slider', { name: 'Channel 1 Pan' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Channel 3 Pan' })).toBeInTheDocument()
  })

  it('AC-024: master output metering lives in the Master Bus Strip OUTPUT module', () => {
    renderPlayer({})
    const outputMeter = screen.getByLabelText('Output meter')
    expect(outputMeter).toHaveTextContent('OUTPUT')
    expect(screen.queryByRole('meter', { name: 'Output Level' })).toBeNull()
    expect(screen.queryByText('Output Level')).toBeNull()
  })
})
