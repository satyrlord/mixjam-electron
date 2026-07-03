import { useEffect, useState } from 'react'
import type { RecentProjectItem } from '../../../shared/backend-api'
import { PROJECT_LOAD_COMING_SOON } from './HomeScreen'

const STORAGE_KEY = 'mixjam:recents-rail-collapsed'

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

interface RecentProjectsRailProps {
  recentProjects: RecentProjectItem[]
  onCollapsedChange?: (collapsed: boolean) => void
}

export default function RecentProjectsRail({
  recentProjects,
  onCollapsedChange
}: RecentProjectsRailProps) {
  const [collapsed, setCollapsed] = useState(loadCollapsed)

  useEffect(() => {
    onCollapsedChange?.(collapsed)
  }, [collapsed, onCollapsedChange])

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    try {
      if (next) localStorage.setItem(STORAGE_KEY, '1')
      else localStorage.removeItem(STORAGE_KEY)
    } catch { /* storage unavailable */ }
  }

  return (
    <aside className={`tracker-zone recent-projects-rail${collapsed ? ' recent-projects-rail-collapsed' : ''}`}>
      <div className="recent-projects-header">
        <h2 className="tracker-zone-title">Recent Projects</h2>
        <button
          type="button"
          className="recent-projects-toggle"
          onClick={toggle}
          aria-label={collapsed ? 'Expand recent projects' : 'Collapse recent projects'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '\u25B6' : '\u25C0'}
        </button>
      </div>
      {!collapsed && (
        recentProjects.length === 0 ? (
          <p className="recent-projects-empty">
            No MixJam projects yet. Project save/load is coming soon.
          </p>
        ) : (
          <ol className="recent-projects-list">
            {recentProjects.map((project) => (
              <li key={project.path} className="recent-projects-item">
                <button
                  type="button"
                  className="recent-projects-open"
                  disabled
                  title={PROJECT_LOAD_COMING_SOON}
                >
                  <span className="recent-projects-name">{project.displayName}</span>
                  <span className="recent-projects-path">{project.path}</span>
                </button>
              </li>
            ))}
          </ol>
        )
      )}
    </aside>
  )
}
