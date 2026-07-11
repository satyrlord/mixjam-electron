import { useEffect, useState } from 'react'
import type { MixJamFileItem } from '../../../shared/backend-api'
import { PROJECT_LOAD_COMING_SOON } from './HomeScreen'

// Retain the legacy value so an existing collapsed preference survives rename.
const STORAGE_KEY = 'mixjam:recents-rail-collapsed'

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch (error) {
    if (error instanceof DOMException) return false
    throw error
  }
}

interface MixJamBrowserProps {
  mixJamFiles: MixJamFileItem[]
  onCollapsedChange?: (collapsed: boolean) => void
}

export default function MixJamBrowser({
  mixJamFiles,
  onCollapsedChange
}: MixJamBrowserProps) {
  const [collapsed, setCollapsed] = useState(loadCollapsed)

  useEffect(() => {
    onCollapsedChange?.(collapsed)
  }, [collapsed, onCollapsedChange])

  const toggle = () => {
    const next = !collapsed
    // Keep the parent grid and the rail in the same React update so the
    // collapsed rail never occupies the old expanded grid column for a frame.
    onCollapsedChange?.(next)
    setCollapsed(next)
    try {
      if (next) localStorage.setItem(STORAGE_KEY, '1')
      else localStorage.removeItem(STORAGE_KEY)
    } catch (error) {
      if (!(error instanceof DOMException)) throw error
    }
  }

  return (
    <aside className={`tracker-zone mixjam-browser${collapsed ? ' mixjam-browser-collapsed' : ''}`}>
      <div className="mixjam-browser-header">
        <h2 className="tracker-zone-title">MixJam Browser</h2>
        <button
          type="button"
          className="mixjam-browser-toggle"
          onClick={toggle}
          aria-label={collapsed ? 'Expand MixJam Browser' : 'Collapse MixJam Browser'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '\u25B6' : '\u25C0'}
        </button>
      </div>
      {!collapsed && (
        mixJamFiles.length === 0 ? (
          <p className="mixjam-browser-empty">
            No MixJam projects yet. Project save/load is coming soon.
          </p>
        ) : (
          <ol className="mixjam-browser-list">
            {mixJamFiles.map((project) => (
              <li key={project.path} className="mixjam-browser-item">
                <button
                  type="button"
                  className="mixjam-browser-open"
                  disabled
                  title={PROJECT_LOAD_COMING_SOON}
                >
                  <span className="mixjam-browser-name">{project.displayName}</span>
                  <span className="mixjam-browser-path">{project.path}</span>
                </button>
              </li>
            ))}
          </ol>
        )
      )}
    </aside>
  )
}
