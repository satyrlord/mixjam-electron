import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
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
import { useUiGeometry, type UiGeometry } from '../ui-size'

const TAB_LABELS: Record<BottomWorkspaceTab, string> = {
  master: 'Master',
  mixer: 'Mixer',
  samples: 'Samples'
}

const EXPANDED_PERCENT = 60
const SAMPLES_CUE_MINIMUM_PERCENT = 50

export type BottomWorkspaceMinimumHeights = Record<BottomWorkspaceTab, number>

/** Content budgets share the same UI Size tokens as the controls they protect. */
export function bottomWorkspaceMinimumHeights(
  geometry: UiGeometry
): BottomWorkspaceMinimumHeights {
  return {
    // The Master Bus Strip rack renders 420px-tall modules plus its preset
    // chip header, rack shell, and panel padding (spec-012). Five medium
    // gaps cover the chrome around that stack; six double-counted one gap and
    // clipped the first Tracker lane at UI Size 50.
    master: geometry.tabRowHeight + 420 + geometry.size + (5 * geometry.spaceMd) + geometry.spaceLg,
    // The active tab already names the Mixer, so its content starts directly
    // with the channel and FX panels instead of repeating a title row.
    mixer: geometry.tabRowHeight + (3 * geometry.spaceMd) + geometry.size +
      (2 * geometry.mixerFxHeight) + geometry.spaceSm + 14,
    samples: geometry.tabRowHeight + (2 * geometry.size) + (4 * geometry.spaceMd)
  }
}

interface BottomWorkspaceController {
  browserPanelRef: ReturnType<typeof usePanelRef>
  bottomPanelRef: ReturnType<typeof usePanelRef>
  bottomTab: BottomWorkspaceTab
  expanded: boolean
  /** Floor for the resizable Panel constraint. Per-tab, because this is what
   *  prevents a drag from squeezing a tab below its content budget. */
  bottomPanelMinimumHeight: number
  /** Per-tab content budget, applied as a CSS min-height on the panel's
   *  contents and used by the imperative restore-size path. */
  bottomMinimumHeight: number
  bottomMinimumHeights: BottomWorkspaceMinimumHeights
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
  const bottomMinimumHeights = useMemo(
    () => bottomWorkspaceMinimumHeights(uiGeometry),
    [uiGeometry]
  )
  const [mixJamBrowserCollapsed, setMixJamBrowserCollapsed] = useState(workspaceDefaults.mixJamBrowserCollapsed)
  const [bottomTab, setBottomTabState] = useState<BottomWorkspaceTab>(workspaceDefaults.bottomTab)
  const [expanded, setExpanded] = useState(workspaceDefaults.bottomExpansion.expanded)
  const browserPanelRef = usePanelRef()
  const bottomPanelRef = usePanelRef()
  const bottomTabSizesRef = useRef({ ...workspaceDefaults.bottomTabSizes })
  const previousBottomSizeRef = useRef(workspaceDefaults.bottomExpansion.previousBottomSize)

  const resizeBottomTab = useCallback((tab: BottomWorkspaceTab, targetPercentage: number) => {
    const panel = bottomPanelRef.current
    if (!panel) return
    const current = panel.getSize()
    if (current.asPercentage <= 0) {
      panel.resize(`${bottomMinimumHeights[tab]}px`)
      return
    }
    const groupHeight = current.inPixels * 100 / current.asPercentage
    const targetPixels = groupHeight * targetPercentage / 100
    panel.resize(`${Math.max(bottomMinimumHeights[tab], targetPixels)}px`)
  }, [bottomMinimumHeights, bottomPanelRef])

  const setBottomTab = useCallback((tab: BottomWorkspaceTab) => {
    if (tab === bottomTab) return
    setBottomTabState(tab)
    playerWorkspacePreferences.saveBottomTab(tab)
  }, [bottomTab])
  useEffect(() => {
    // Restore this tab's remembered size, lifted to its own content budget.
    // The Panel's minSize is tab-independent, so this imperative resize is what
    // enforces the per-tab floor — and it runs on the next frame so it lands
    // after the tab's own commit rather than fighting it.
    const frame = requestAnimationFrame(() => {
      const targetPercentage = bottomTabSizesRef.current[bottomTab]
      resizeBottomTab(bottomTab, targetPercentage)
    })
    return () => cancelAnimationFrame(frame)
  }, [bottomTab, resizeBottomTab])
  const toggleExpanded = useCallback(() => {
    const panel = bottomPanelRef.current
    if (!panel) return
    if (expanded) {
      bottomTabSizesRef.current = {
        ...bottomTabSizesRef.current,
        samples: previousBottomSizeRef.current
      }
      playerWorkspacePreferences.saveBottomTabSizes(bottomTabSizesRef.current)
      playerWorkspacePreferences.saveBottomExpansion({ expanded: false, previousBottomSize: previousBottomSizeRef.current })
      resizeBottomTab('samples', previousBottomSizeRef.current)
      setExpanded(false)
      return
    }
    previousBottomSizeRef.current = panel.getSize().asPercentage
    bottomTabSizesRef.current = { ...bottomTabSizesRef.current, samples: EXPANDED_PERCENT }
    playerWorkspacePreferences.saveBottomTabSizes(bottomTabSizesRef.current)
    playerWorkspacePreferences.saveBottomExpansion({ expanded: true, previousBottomSize: previousBottomSizeRef.current })
    resizeBottomTab('samples', EXPANDED_PERCENT)
    setExpanded(true)
  }, [bottomPanelRef, expanded, resizeBottomTab])
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
    // Constraint and tab-restoration resizes report layout changes too. They
    // describe rendered geometry, not a new user preference for the active tab.
    if (bottomSize === undefined || !meta.isUserInteraction) return
    bottomTabSizesRef.current = { ...bottomTabSizesRef.current, [bottomTab]: bottomSize }
    playerWorkspacePreferences.saveBottomTabSizes(bottomTabSizesRef.current)
    if (bottomTab !== 'samples') return
    previousBottomSizeRef.current = bottomSize
    setExpanded(false)
    playerWorkspacePreferences.saveBottomExpansion({ expanded: false, previousBottomSize: bottomSize })
  }, [bottomTab])
  // The Panel constraint stays per-tab: it is what stops a drag from squeezing
  // a tab below its content budget, and enforcing that after the fact would
  // fight the user's pointer mid-gesture. What it must not do is churn — the
  // value is memoized per tab so React sees a stable string across unrelated
  // re-renders, and only a genuine tab change (or a UI Size change) makes the
  // panel group recompute the Tracker's layout.
  const bottomPanelMinimumHeight = bottomMinimumHeights[bottomTab]

  return {
    browserPanelRef, bottomPanelRef, bottomTab, expanded,
    bottomPanelMinimumHeight,
    bottomMinimumHeight: bottomMinimumHeights[bottomTab], bottomMinimumHeights,
    mixJamBrowserCollapsed,
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
  minimumHeight: number
  master: ReactNode
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
  minimumHeight,
  master,
  mixer,
  samples,
  expanded,
  onTabChange,
  onToggleExpanded
}: BottomWorkspaceProps) {
  const uiGeometry = useUiGeometry()
  const panels: Record<BottomWorkspaceTab, ReactNode> = { master, mixer, samples }
  const minimumContentHeight = Math.max(0, minimumHeight - uiGeometry.tabRowHeight)

  const masterPercent = Math.round(masterGain * 100)

  return (
    <TabsRoot
      className="bottom-workspace"
      role="region"
      aria-label="Bottom Workspace"
      value={activeTab}
      onValueChange={(value) => onTabChange(value as BottomWorkspaceTab)}
      style={{
        '--bottom-workspace-content-min-height': `${minimumContentHeight}px`
      } as CSSProperties}
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
          className="bottom-workspace-master-status"
          aria-label={`${bpm} BPM, Master ${masterPercent}%`}
          onClick={() => onTabChange('master')}
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
