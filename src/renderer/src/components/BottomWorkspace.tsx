import type { ReactNode } from 'react'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from './ui/Tabs'
import {
  BOTTOM_WORKSPACE_TABS,
  type BottomWorkspaceTab
} from '../app-state/player-workspace-preferences'

export type { BottomWorkspaceTab } from '../app-state/player-workspace-preferences'

const TAB_LABELS: Record<BottomWorkspaceTab, string> = {
  song: 'Song',
  mixer: 'Mixer',
  samples: 'Samples'
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
