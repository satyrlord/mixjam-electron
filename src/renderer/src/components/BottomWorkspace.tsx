import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from './ui/Tabs'
import {
  BOTTOM_WORKSPACE_TABS,
  type BottomWorkspaceTab
} from '../app-state/player-workspace-preferences'
import {
  loadPlayerWorkspacePreferences,
  playerWorkspacePreferences
} from '../app-state/player-workspace-preferences'
import { LEFT_COL_MIN_PX } from '../lib/arrangement'
import { usePanelRef, type PanelLayout } from './ui/ResizablePanels'
import { useUiGeometry } from '../ui-size'

const TAB_LABELS: Record<BottomWorkspaceTab, string> = {
  song: 'Song',
  mixer: 'Mixer',
  samples: 'Samples'
}

const EXPANDED_PERCENT = 60
const SAMPLES_CUE_MINIMUM_PERCENT = 50

interface BottomWorkspaceController {
  browserPanelRef: ReturnType<typeof usePanelRef>
  bottomPanelRef: ReturnType<typeof usePanelRef>
  bottomTab: BottomWorkspaceTab
  expanded: boolean
  mixerMinimumHeight: number
  mixJamBrowserCollapsed: boolean
  upperDefaultLayout: PanelLayout
  verticalDefaultLayout: PanelLayout
  setBottomTab: (tab: BottomWorkspaceTab) => void
  toggleExpanded: () => void
  openSamples: () => void
  onBrowserCollapsedChange: (collapsed: boolean) => void
  onVerticalLayoutChanged: (layout: PanelLayout, meta: { isUserInteraction: boolean }) => void
  onUpperLayoutChanged: (layout: PanelLayout) => void
}

/** Owns Bottom Workspace tab, size, expansion, and persisted layout behavior. */
export function useBottomWorkspace(): BottomWorkspaceController {
  const [workspaceDefaults] = useState(() => loadPlayerWorkspacePreferences(window.innerWidth, LEFT_COL_MIN_PX))
  const uiGeometry = useUiGeometry()
  const mixerMinimumHeight = uiGeometry.tabRowHeight + (4 * uiGeometry.spaceMd) + uiGeometry.size +
    (2 * uiGeometry.mixerFxHeight) + uiGeometry.spaceSm + 14
  const [mixJamBrowserCollapsed, setMixJamBrowserCollapsed] = useState(workspaceDefaults.mixJamBrowserCollapsed)
  const [bottomTab, setBottomTabState] = useState<BottomWorkspaceTab>(workspaceDefaults.bottomTab)
  const [expanded, setExpanded] = useState(workspaceDefaults.bottomExpansion.expanded)
  const browserPanelRef = usePanelRef()
  const bottomPanelRef = usePanelRef()
  const bottomTabSizesRef = useRef({ ...workspaceDefaults.bottomTabSizes })
  const previousBottomSizeRef = useRef(workspaceDefaults.bottomExpansion.previousBottomSize)

  const setBottomTab = useCallback((tab: BottomWorkspaceTab) => {
    if (tab === bottomTab) return
    const currentSize = bottomPanelRef.current?.getSize().asPercentage
    if (currentSize !== undefined) {
      bottomTabSizesRef.current = { ...bottomTabSizesRef.current, [bottomTab]: currentSize }
      playerWorkspacePreferences.saveBottomTabSizes(bottomTabSizesRef.current)
    }
    setBottomTabState(tab)
    playerWorkspacePreferences.saveBottomTab(tab)
  }, [bottomPanelRef, bottomTab])
  useEffect(() => {
    const panel = bottomPanelRef.current
    if (!panel) return
    const targetPercentage = bottomTabSizesRef.current[bottomTab]
    if (bottomTab !== 'mixer') { panel.resize(`${targetPercentage}%`); return }
    const current = panel.getSize()
    const groupHeight = current.inPixels * 100 / current.asPercentage
    panel.resize(`${Math.max(mixerMinimumHeight, groupHeight * targetPercentage / 100)}px`)
  }, [bottomPanelRef, bottomTab, mixerMinimumHeight])
  const toggleExpanded = useCallback(() => {
    const panel = bottomPanelRef.current
    if (!panel) return
    if (expanded) {
      playerWorkspacePreferences.saveBottomExpansion({ expanded: false, previousBottomSize: previousBottomSizeRef.current })
      panel.resize(`${previousBottomSizeRef.current}%`)
      setExpanded(false)
      return
    }
    previousBottomSizeRef.current = panel.getSize().asPercentage
    playerWorkspacePreferences.saveBottomExpansion({ expanded: true, previousBottomSize: previousBottomSizeRef.current })
    panel.resize(`${EXPANDED_PERCENT}%`)
    setExpanded(true)
  }, [bottomPanelRef, expanded])
  const openSamples = useCallback(() => {
    bottomTabSizesRef.current = {
      ...bottomTabSizesRef.current,
      samples: Math.max(bottomTabSizesRef.current.samples, SAMPLES_CUE_MINIMUM_PERCENT)
    }
    playerWorkspacePreferences.saveBottomTabSizes(bottomTabSizesRef.current)
    setBottomTab('samples')
  }, [setBottomTab])
  const onBrowserCollapsedChange = useCallback((collapsed: boolean) => {
    setMixJamBrowserCollapsed(collapsed)
    playerWorkspacePreferences.saveMixJamBrowserCollapsed(collapsed)
    if (collapsed) browserPanelRef.current?.collapse()
    else browserPanelRef.current?.expand()
  }, [browserPanelRef])
  const onVerticalLayoutChanged = useCallback((layout: PanelLayout, meta: { isUserInteraction: boolean }) => {
    playerWorkspacePreferences.saveVerticalLayout(layout)
    const bottomSize = layout.bottom
    if (bottomSize === undefined) return
    bottomTabSizesRef.current = { ...bottomTabSizesRef.current, [bottomTab]: bottomSize }
    playerWorkspacePreferences.saveBottomTabSizes(bottomTabSizesRef.current)
    if (!meta.isUserInteraction || bottomTab === 'mixer') return
    previousBottomSizeRef.current = bottomSize
    setExpanded(false)
    playerWorkspacePreferences.saveBottomExpansion({ expanded: false, previousBottomSize: bottomSize })
  }, [bottomTab])
  return {
    browserPanelRef, bottomPanelRef, bottomTab, expanded, mixerMinimumHeight, mixJamBrowserCollapsed,
    upperDefaultLayout: workspaceDefaults.upperLayout as PanelLayout,
    verticalDefaultLayout: workspaceDefaults.verticalLayout as PanelLayout,
    setBottomTab, toggleExpanded, openSamples, onBrowserCollapsedChange, onVerticalLayoutChanged,
    onUpperLayoutChanged: playerWorkspacePreferences.saveUpperLayout
  }
}

interface BottomWorkspaceProps {
  activeTab: BottomWorkspaceTab
  bpm: number
  masterGain: number
  song: ReactNode
  mixer: ReactNode
  samples: ReactNode
  expanded: boolean
  onTabChange: (tab: BottomWorkspaceTab) => void
  onToggleExpanded: () => void
}

export default function BottomWorkspace({
  activeTab,
  bpm,
  masterGain,
  song,
  mixer,
  samples,
  expanded,
  onTabChange,
  onToggleExpanded
}: BottomWorkspaceProps) {
  const panels: Record<BottomWorkspaceTab, ReactNode> = { song, mixer, samples }

  const masterPercent = Math.round(masterGain * 100)

  return (
    <TabsRoot
      className="bottom-workspace"
      role="region"
      aria-label="Bottom Workspace"
      value={activeTab}
      onValueChange={(value) => onTabChange(value as BottomWorkspaceTab)}
      orientation="horizontal"
      activationMode="automatic"
    >
      <TabsList className="bottom-workspace-tabs" aria-label="Bottom Workspace">
        {BOTTOM_WORKSPACE_TABS.map((tab) => (
          <TabsTrigger
            key={tab}
            className="bottom-workspace-tab"
            value={tab}
            onClick={() => onTabChange(tab)}
          >
            {TAB_LABELS[tab]}
          </TabsTrigger>
        ))}
        <button
          type="button"
          className="bottom-workspace-song-status"
          aria-label={`${bpm} BPM, Master ${masterPercent}%`}
          onClick={() => onTabChange('song')}
        >
          <span>{bpm} BPM</span>
          <span aria-hidden="true">·</span>
          <span>Master {masterPercent}%</span>
        </button>
        {activeTab === 'samples' && (
          <button
            type="button"
            className="bottom-workspace-expand"
            aria-pressed={expanded}
            onClick={onToggleExpanded}
          >
            {expanded ? 'Restore workspace' : 'Expand Samples'}
          </button>
        )}
      </TabsList>
      {BOTTOM_WORKSPACE_TABS.map((tab) => (
        <TabsContent
          key={tab}
          className={`bottom-workspace-panel bottom-workspace-${tab}`}
          data-panel-name={tab}
          value={tab}
          forceMount
          hidden={activeTab !== tab}
        >
          {panels[tab]}
        </TabsContent>
      ))}
    </TabsRoot>
  )
}
