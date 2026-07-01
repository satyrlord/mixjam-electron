import { useEffect, type ReactNode } from 'react'
import TrackerView from '../../src/renderer/src/components/TrackerView'
import type {
  CategoryItem,
  LibraryItem,
  RecentProjectItem,
  SampleListItem,
  TagItem
} from '../../src/shared/ipc'
import type { LaneState } from '../../src/renderer/src/lib/playerShell'
import { selectTheme, type ThemeKey } from '../../src/renderer/src/theme/themes'

// .tracker-view is `display: grid; grid-template-rows: minmax(0, 1fr) 44px
// minmax(0, 1fr)` and relies on `flex: 1` from the real app's full-height
// `.app` shell to give those fractional rows actual space. A bare preview
// root has no forced height, so both 1fr rows (lanes AND the sample browser)
// collapse toward their minmax(0, ...) floor — the browser region (row 3)
// visually disappears even though its samples prop is populated. Reproduce
// the app's real viewport height so the grid rows get real space.
function AppWindowHost({ children }: { children: ReactNode }) {
  return <div style={{ width: 1280, height: 800, display: 'flex', flexDirection: 'column' }}>{children}</div>
}

// Overrides the shared ThemeBootstrap provider's default theme for this one
// story — proves the 8 generated theme token blocks (see
// generate-theme-tokens.mjs) actually apply across a full composed page, not
// just individual chrome bars. Must be a plain (post-layout) effect — see the
// comment on the equivalent Themed wrapper in previews/Header.tsx for why
// useLayoutEffect here would still lose to the parent ThemeBootstrap provider.
function Themed({ themeKey, children }: { themeKey: ThemeKey; children: ReactNode }) {
  useEffect(() => {
    selectTheme(themeKey)
  }, [themeKey])
  return <>{children}</>
}

const noop = () => undefined
const asyncNoop = async () => undefined

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
const SCANNING_PROGRESS = { status: 'scanning' as const, phase: 1 as const, found: 240, processed: 96, total: 240 }

const baseProps = {
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

export function Populated() {
  return (
    <AppWindowHost>
      <TrackerView {...baseProps} lanes={makeLanes()} />
    </AppWindowHost>
  )
}

export function Scanning() {
  return (
    <AppWindowHost>
      <TrackerView
        {...baseProps}
        lanes={makeLanes()}
        scanProgress={SCANNING_PROGRESS}
      />
    </AppWindowHost>
  )
}

export function EmptyLibrary() {
  return (
    <AppWindowHost>
      <TrackerView
        {...baseProps}
        samples={[]}
        totalCount={0}
        lanes={makeLanes()}
        selectedSamplePath={null}
        transportState="stopped"
        currentTick={0}
      />
    </AppWindowHost>
  )
}

// ── One full-window populated TrackerView per theme ──────────────────────
// Replicates the old design project's per-theme full-window mockups, but
// driven by the real component + the real theme token data (public/themes/
// *.json via generate-theme-tokens.mjs) so a whole-page composition can be
// judged in every theme — what looks right in Emerald may not in Club PA's
// black/white or Neon Rave's saturated palette. Each must be its own named
// export (the converter discovers stories by named export; a dynamic loop
// wouldn't be picked up).
function themedTracker(themeKey: ThemeKey) {
  return (
    <AppWindowHost>
      <Themed themeKey={themeKey}>
        <TrackerView {...baseProps} lanes={makeLanes()} />
      </Themed>
    </AppWindowHost>
  )
}

export function ThemeEmerald() {
  return themedTracker('emerald')
}

export function ThemeFlatStudio() {
  return themedTracker('studio')
}

export function ThemeNeonRave() {
  return themedTracker('rave')
}

export function ThemeWarmAnalog() {
  return themedTracker('analog')
}

export function ThemeIDE() {
  return themedTracker('ide')
}

export function ThemeRustIndustrial() {
  return themedTracker('rust')
}

export function ThemeScreenMaximal() {
  return themedTracker('screen')
}

export function ThemeClubPA() {
  return themedTracker('pa')
}
