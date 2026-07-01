import { type ReactNode } from 'react'
import { AppShell } from '../app-shell'
import TrackerView from '../../src/renderer/src/components/TrackerView'
import type {
  CategoryItem,
  LibraryItem,
  RecentProjectItem,
  SampleListItem,
  TagItem
} from '../../src/shared/ipc'
import type { LaneState } from '../../src/renderer/src/lib/playerShell'

// The full application window: Header (with its live theme selector) +
// TrackerView + Footer, wired like App.tsx. The `Default` story starts in
// Emerald and lets you switch every theme from the header dropdown; the
// per-theme stories below open directly on a given theme (initialTheme) so a
// reviewer can jump straight to one. AppShell owns the theme in state, so it
// does NOT need the shared ThemeBootstrap wrapper's help — but that wrapper
// still runs (it's the cfg.provider) and harmlessly sets the default first.

const noop = () => undefined
const asyncNoop = async () => undefined

// Gives the flex-column .app frame a concrete window size so TrackerView's
// grid rows (minmax(0,1fr)) get real height — same reason as the TrackerView
// previews' AppWindowHost.
function WindowHost({ children }: { children: ReactNode }) {
  return <div style={{ width: 1280, height: 800, display: 'flex', flexDirection: 'column' }}>{children}</div>
}

const RECENT_PROJECTS: RecentProjectItem[] = [
  { path: 'C:/Users/dj/MixJam/club-night.mixjam', displayName: 'club-night', lastOpened: '2026-06-28T22:14:00.000Z' },
  { path: 'C:/Users/dj/MixJam/warehouse-set.mixjam', displayName: 'warehouse-set', lastOpened: '2026-06-25T19:02:00.000Z' }
]

const CATEGORIES: CategoryItem[] = [
  { id: 1, name: 'Bass', parentId: null },
  { id: 2, name: 'Drums', parentId: null },
  { id: 3, name: 'FX', parentId: null },
  { id: 4, name: 'Synth', parentId: null },
  { id: 5, name: 'Vocal', parentId: null },
  { id: 6, name: 'Loop', parentId: null },
  { id: 7, name: 'Percussion', parentId: null },
  { id: 8, name: 'Atmosphere', parentId: null }
]

const TAGS: TagItem[] = [
  { id: 1, name: 'Punchy', color: '#E4572E' },
  { id: 2, name: 'Warm', color: '#2D8C6F' },
  { id: 3, name: 'Vintage', color: null }
]

const LIBRARIES: LibraryItem[] = [
  { id: 1, name: 'My Deep House Kit', createdAt: Date.now() - 86_400_000, ruleJson: '{}' }
]

const SAMPLES: SampleListItem[] = [
  { id: 'C:/Samples/Drums/Kicks/kick_808.wav', name: 'kick_808.wav', filepath: 'C:/Samples/Drums/Kicks/kick_808.wav', category: 'Drums', durationSeconds: 0.8, tags: ['Punchy'], categoryId: 2, tagIds: [1] },
  { id: 'C:/Samples/Bass/sub_growl.wav', name: 'sub_growl.wav', filepath: 'C:/Samples/Bass/sub_growl.wav', category: 'Bass', durationSeconds: 2.4, tags: ['Warm'], categoryId: 1, tagIds: [2] },
  { id: 'C:/Samples/FX/riser_white_noise.wav', name: 'riser_white_noise.wav', filepath: 'C:/Samples/FX/riser_white_noise.wav', category: 'FX', durationSeconds: 4.1, tags: [], categoryId: 3, tagIds: [] },
  { id: 'C:/Samples/Synth/pluck_arp.wav', name: 'pluck_arp.wav', filepath: 'C:/Samples/Synth/pluck_arp.wav', category: 'Synth', durationSeconds: 1.2, tags: ['Vintage'], categoryId: 4, tagIds: [3] }
]

function makeLanes(): LaneState[] {
  const lanes: LaneState[] = Array.from({ length: 16 }, (_, index) => ({
    index,
    name: `Lane ${index + 1}`,
    muted: false,
    solo: false,
    pan: 0,
    clips: []
  }))
  lanes[0] = {
    ...lanes[0],
    name: 'Kicks',
    clips: [
      { id: 'clip-1', samplePath: SAMPLES[0].filepath, sampleName: 'kick_808.wav', startTick: 0, durationTicks: 32, durationSeconds: 0.8, color: '#E4572E' },
      { id: 'clip-2', samplePath: SAMPLES[0].filepath, sampleName: 'kick_808.wav', startTick: 64, durationTicks: 32, durationSeconds: 0.8, color: '#E4572E' }
    ]
  }
  lanes[1] = {
    ...lanes[1],
    name: 'Bassline',
    clips: [
      { id: 'clip-3', samplePath: SAMPLES[1].filepath, sampleName: 'sub_growl.wav', startTick: 0, durationTicks: 96, durationSeconds: 2.4, color: '#2D8C6F' }
    ]
  }
  lanes[2] = { ...lanes[2], name: 'FX', muted: true }
  lanes[3] = {
    ...lanes[3],
    name: 'Lead Synth',
    solo: true,
    clips: [
      { id: 'clip-4', samplePath: SAMPLES[3].filepath, sampleName: 'pluck_arp.wav', startTick: 32, durationTicks: 48, durationSeconds: 1.2, color: '#8E44AD' }
    ]
  }
  return lanes
}

const IDLE_PROGRESS = { status: 'idle' as const, phase: null, found: 0, processed: 0, total: 0 }

const trackerProps = {
  recentProjects: RECENT_PROJECTS,
  samples: SAMPLES,
  searchQuery: '',
  loading: false,
  error: null,
  selectedSamplePath: SAMPLES[0].filepath,
  laneShouldDim: (lane: LaneState) => lane.name === 'FX',
  transportState: 'playing' as const,
  currentTick: 48,
  bpm: 128,
  masterGain: 0.82,
  masterLevelDb: -6.5,
  totalCount: SAMPLES.length,
  onSetBpm: noop,
  onSetMasterGain: noop,
  onSelectSampleDetail: noop,
  onSearchChange: noop,
  onRescan: noop,
  onPlaceSampleDetailOnLane: noop,
  onMoveClipOnLane: noop,
  onDuplicateClipOnLane: noop,
  onMoveClipGroup: noop,
  onDuplicateClipGroup: noop,
  onRemoveClipFromLane: noop,
  onSetLanePan: noop,
  onPreviewSample: noop,
  onToggleLaneMute: noop,
  onToggleLaneSolo: noop,
  onTransportPlay: noop,
  onTransportPause: noop,
  onTransportStop: noop,
  onTransportSkipBack: noop,
  scanProgress: IDLE_PROGRESS,
  selectedCategoryId: 2,
  selectedTagIds: [1],
  sortBy: 'filename' as const,
  sortDir: 'asc' as const,
  tags: TAGS,
  categories: CATEGORIES,
  libraries: LIBRARIES,
  onDbSearchChange: noop,
  onSelectCategory: noop,
  onToggleTagFilter: noop,
  onSortChange: noop,
  onStartScan: asyncNoop,
  onCreateTag: asyncNoop as unknown as (name: string, color?: string) => Promise<TagItem>,
  onRenameTag: asyncNoop as unknown as (id: number, name: string) => Promise<void>,
  onDeleteTag: asyncNoop as unknown as (id: number) => Promise<void>,
  onCreateCategory: asyncNoop as unknown as (name: string, parentId?: number) => Promise<CategoryItem>,
  onDeleteCategory: asyncNoop as unknown as (id: number) => Promise<void>,
  onSaveLibrary: asyncNoop as unknown as (name: string) => Promise<LibraryItem>,
  onDeleteLibrary: asyncNoop as unknown as (id: number) => Promise<void>
}

const footerDetail = {
  name: 'kick_808.wav',
  filepath: 'C:/Samples/Drums/Kicks/kick_808.wav',
  tags: ['Punchy', 'Warm'],
  duration: 0.8
}

function windowFor(initialTheme: string) {
  return (
    <WindowHost>
      <AppShell timer="01:23.4" version="0.5.0" sampleDetail={footerDetail} initialTheme={initialTheme}>
        <TrackerView {...trackerProps} lanes={makeLanes()} />
      </AppShell>
    </WindowHost>
  )
}

// Interactive: starts in Emerald, switch any theme from the header dropdown.
export function Default() {
  return windowFor('emerald')
}

// Open directly on a given theme (the header selector still works from there).
export function ThemeFlatStudio() {
  return windowFor('studio')
}

export function ThemeNeonRave() {
  return windowFor('rave')
}

export function ThemeWarmAnalog() {
  return windowFor('analog')
}

export function ThemeIDE() {
  return windowFor('ide')
}

export function ThemeRustIndustrial() {
  return windowFor('rust')
}

export function ThemeScreenMaximal() {
  return windowFor('screen')
}

export function ThemeClubPA() {
  return windowFor('pa')
}
