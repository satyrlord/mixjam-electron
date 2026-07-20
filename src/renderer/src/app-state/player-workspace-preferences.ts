export const BOTTOM_WORKSPACE_TABS = ['master', 'mixer', 'samples'] as const
export type BottomWorkspaceTab = (typeof BOTTOM_WORKSPACE_TABS)[number]

interface WorkspacePanelLayout {
  [panelId: string]: number
}

interface BottomWorkspaceExpansionState {
  expanded: boolean
  previousBottomSize: number
}

type BottomWorkspaceTabSizes = Record<BottomWorkspaceTab, number>

interface PlayerWorkspacePreferences {
  upperLayout: WorkspacePanelLayout
  verticalLayout: WorkspacePanelLayout
  bottomTab: BottomWorkspaceTab
  bottomTabSizes: BottomWorkspaceTabSizes
  bottomExpansion: BottomWorkspaceExpansionState
  mixJamBrowserCollapsed: boolean
}

const STORAGE_KEYS = Object.freeze({
  legacyBrowserWidth: 'mixjam-left-col-w',
  upperLayout: 'mixjam:upper-work-layout',
  verticalLayout: 'mixjam:bottom-workspace-layout-v2',
  bottomExpansion: 'mixjam:bottom-workspace-expansion-v2',
  bottomTab: 'mixjam:bottom-workspace-tab',
  bottomTabSizes: 'mixjam:bottom-workspace-tab-sizes-v1',
  mixJamBrowserCollapsed: 'mixjam:recents-rail-collapsed'
})

const DEFAULT_BOTTOM_WORKSPACE_SIZE_PERCENT = 24

function isBottomWorkspaceTab(value: string | null): value is BottomWorkspaceTab {
  return BOTTOM_WORKSPACE_TABS.some((tab) => tab === value)
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // The current in-memory workspace remains usable when storage is unavailable.
  }
}

function loadPanelLayout(key: string, fallback: WorkspacePanelLayout): WorkspacePanelLayout {
  const stored = readStorage(key)
  if (!stored) return fallback
  try {
    const parsed = JSON.parse(stored) as unknown
    if (!parsed || typeof parsed !== 'object') return fallback
    const entries = Object.entries(parsed)
    if (entries.length !== Object.keys(fallback).length) return fallback
    if (entries.some(([name, value]) =>
      !(name in fallback) || typeof value !== 'number' || !Number.isFinite(value))) return fallback
    return Object.fromEntries(entries) as WorkspacePanelLayout
  } catch {
    return fallback
  }
}

function loadExpansion(fallbackSize: number): BottomWorkspaceExpansionState {
  const fallback = { expanded: false, previousBottomSize: fallbackSize }
  const stored = readStorage(STORAGE_KEYS.bottomExpansion)
  if (!stored) return fallback
  try {
    const parsed = JSON.parse(stored) as Partial<BottomWorkspaceExpansionState>
    if (typeof parsed.expanded !== 'boolean' ||
      typeof parsed.previousBottomSize !== 'number' ||
      !Number.isFinite(parsed.previousBottomSize) ||
      parsed.previousBottomSize <= 0 || parsed.previousBottomSize > 100) return fallback
    return { expanded: parsed.expanded, previousBottomSize: parsed.previousBottomSize }
  } catch {
    return fallback
  }
}

function loadBottomTabSizes(fallbackSize: number): BottomWorkspaceTabSizes {
  const fallback: BottomWorkspaceTabSizes = {
    master: fallbackSize,
    mixer: 60,
    samples: fallbackSize
  }
  const stored = readStorage(STORAGE_KEYS.bottomTabSizes)
  if (!stored) return fallback
  try {
    const parsed = JSON.parse(stored) as Partial<BottomWorkspaceTabSizes>
    if (BOTTOM_WORKSPACE_TABS.some((tab) =>
      typeof parsed[tab] !== 'number' ||
      !Number.isFinite(parsed[tab]) ||
      parsed[tab] <= 0 ||
      parsed[tab] > 100)) return fallback
    return parsed as BottomWorkspaceTabSizes
  } catch {
    return fallback
  }
}

export function loadPlayerWorkspacePreferences(
  viewportWidth: number,
  legacyBrowserMinimumPx: number
): PlayerWorkspacePreferences {
  const legacyWidth = Number(readStorage(STORAGE_KEYS.legacyBrowserWidth))
  const browserPercent = Number.isFinite(legacyWidth) && legacyWidth >= legacyBrowserMinimumPx
    ? Math.max(15, Math.min(45, legacyWidth / viewportWidth * 100))
    : 18
  const upperLayout = loadPanelLayout(STORAGE_KEYS.upperLayout, {
    browser: browserPercent,
    tracker: 100 - browserPercent
  })
  const verticalLayout = loadPanelLayout(STORAGE_KEYS.verticalLayout, {
    upper: 100 - DEFAULT_BOTTOM_WORKSPACE_SIZE_PERCENT,
    bottom: DEFAULT_BOTTOM_WORKSPACE_SIZE_PERCENT
  })
  const initialBottomSize = verticalLayout.bottom ?? DEFAULT_BOTTOM_WORKSPACE_SIZE_PERCENT
  const storedTab = readStorage(STORAGE_KEYS.bottomTab)
  const bottomTab = isBottomWorkspaceTab(storedTab) ? storedTab : 'master'
  const bottomTabSizes = loadBottomTabSizes(initialBottomSize)

  return {
    upperLayout,
    verticalLayout: {
      upper: 100 - bottomTabSizes[bottomTab],
      bottom: bottomTabSizes[bottomTab]
    },
    bottomTab,
    bottomTabSizes,
    bottomExpansion: loadExpansion(initialBottomSize),
    mixJamBrowserCollapsed: readStorage(STORAGE_KEYS.mixJamBrowserCollapsed) === '1'
  }
}

export const playerWorkspacePreferences = Object.freeze({
  saveUpperLayout(layout: WorkspacePanelLayout): void {
    writeStorage(STORAGE_KEYS.upperLayout, JSON.stringify(layout))
  },
  saveVerticalLayout(layout: WorkspacePanelLayout): void {
    writeStorage(STORAGE_KEYS.verticalLayout, JSON.stringify(layout))
  },
  saveBottomExpansion(state: BottomWorkspaceExpansionState): void {
    writeStorage(STORAGE_KEYS.bottomExpansion, JSON.stringify(state))
  },
  saveBottomTab(tab: BottomWorkspaceTab): void {
    writeStorage(STORAGE_KEYS.bottomTab, tab)
  },
  saveBottomTabSizes(sizes: BottomWorkspaceTabSizes): void {
    writeStorage(STORAGE_KEYS.bottomTabSizes, JSON.stringify(sizes))
  },
  saveMixJamBrowserCollapsed(collapsed: boolean): void {
    writeStorage(STORAGE_KEYS.mixJamBrowserCollapsed, collapsed ? '1' : null)
  }
})
