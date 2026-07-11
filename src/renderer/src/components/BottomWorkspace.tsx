import { useRef, type KeyboardEvent, type ReactNode } from 'react'

const BOTTOM_WORKSPACE_TABS = ['song', 'mixer', 'fx', 'samples'] as const
export type BottomWorkspaceTab = (typeof BOTTOM_WORKSPACE_TABS)[number]

const TAB_LABELS: Record<BottomWorkspaceTab, string> = {
  song: 'Song',
  mixer: 'Mixer',
  fx: 'FX',
  samples: 'Samples'
}

export function isBottomWorkspaceTab(value: string | null): value is BottomWorkspaceTab {
  return BOTTOM_WORKSPACE_TABS.some((tab) => tab === value)
}

interface BottomWorkspaceProps {
  activeTab: BottomWorkspaceTab
  bpm: number
  masterGain: number
  song: ReactNode
  mixer: ReactNode
  fx: ReactNode
  samples: ReactNode
  onTabChange: (tab: BottomWorkspaceTab) => void
}

export default function BottomWorkspace({
  activeTab,
  bpm,
  masterGain,
  song,
  mixer,
  fx,
  samples,
  onTabChange
}: BottomWorkspaceProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const panels: Record<BottomWorkspaceTab, ReactNode> = { song, mixer, fx, samples }

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: BottomWorkspaceTab) => {
    const currentIndex = BOTTOM_WORKSPACE_TABS.indexOf(tab)
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % BOTTOM_WORKSPACE_TABS.length
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + BOTTOM_WORKSPACE_TABS.length) % BOTTOM_WORKSPACE_TABS.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = BOTTOM_WORKSPACE_TABS.length - 1
    if (nextIndex === null) return

    event.preventDefault()
    const nextTab = BOTTOM_WORKSPACE_TABS[nextIndex]
    onTabChange(nextTab)
    tabRefs.current[nextIndex]?.focus()
  }

  const masterPercent = Math.round(masterGain * 100)

  return (
    <section className="bottom-workspace" aria-label="Bottom Workspace">
      <div className="bottom-workspace-tabs" role="tablist" aria-label="Bottom Workspace">
        {BOTTOM_WORKSPACE_TABS.map((tab, index) => (
          <button
            key={tab}
            ref={(element) => { tabRefs.current[index] = element }}
            id={`bottom-workspace-${tab}-tab`}
            className="bottom-workspace-tab"
            type="button"
            role="tab"
            tabIndex={activeTab === tab ? 0 : -1}
            aria-selected={activeTab === tab}
            aria-controls={`${tab === 'fx' ? 'effects' : tab}-panel`}
            onClick={() => onTabChange(tab)}
            onKeyDown={(event) => handleTabKeyDown(event, tab)}
          >
            {TAB_LABELS[tab]}
          </button>
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
      </div>
      {BOTTOM_WORKSPACE_TABS.map((tab) => (
        <div
          key={tab}
          id={`${tab === 'fx' ? 'effects' : tab}-panel`}
          className={`bottom-workspace-panel bottom-workspace-${tab}`}
          role="tabpanel"
          aria-labelledby={`bottom-workspace-${tab}-tab`}
          hidden={activeTab !== tab}
        >
          {panels[tab]}
        </div>
      ))}
    </section>
  )
}
