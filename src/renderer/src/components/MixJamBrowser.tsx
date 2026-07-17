import { useLayoutEffect, useState } from 'react'
import type { MixJamFileItem } from '../../../shared/backend-api'
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRoot,
  ContextMenuTrigger
} from './ui/ContextMenu'
import { Tooltip } from './ui/Tooltip'

// Keep the existing storage key so a collapsed preference set before the
// component rename is preserved.
const STORAGE_KEY = 'mixjam:recents-rail-collapsed'

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch (error) {
    if (error instanceof DOMException) return false
    throw error
  }
}

async function copyProjectPath(projectPath: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(projectPath)
  } catch (error) {
    console.error('Failed to copy MixJam project path:', error)
  }
}

interface MixJamBrowserProps {
  mixJamFiles: MixJamFileItem[]
  busy?: boolean
  onOpenProject: (projectRelpath: string) => void
  onCollapsedChange?: (collapsed: boolean) => void
}

export default function MixJamBrowser({
  mixJamFiles,
  busy = false,
  onOpenProject,
  onCollapsedChange
}: MixJamBrowserProps) {
  const [collapsed, setCollapsed] = useState(loadCollapsed)

  useLayoutEffect(() => {
    onCollapsedChange?.(collapsed)
  }, [collapsed, onCollapsedChange])

  const toggle = () => {
    const next = !collapsed
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
        <Tooltip content={collapsed ? 'Expand' : 'Collapse'}><button
          type="button"
          className="mixjam-browser-toggle"
          onClick={toggle}
          aria-label={collapsed ? 'Expand MixJam Browser' : 'Collapse MixJam Browser'}
          aria-expanded={!collapsed}
        >
          {collapsed ? '\u25B6' : '\u25C0'}
        </button></Tooltip>
      </div>
      {!collapsed && (
        mixJamFiles.length === 0 ? (
          <p className="mixjam-browser-empty">
            No MixJam projects yet. Save this project or open an existing `.mixjam` file.
          </p>
        ) : (
          <ol className="mixjam-browser-list">
            {mixJamFiles.map((project) => (
              <li key={project.path} className="mixjam-browser-item">
                <ContextMenuRoot>
                  <ContextMenuTrigger asChild>
                    <button
                      type="button"
                      className="mixjam-browser-open"
                      disabled={busy}
                      onClick={() => onOpenProject(project.path)}
                    >
                      <span className="mixjam-browser-name">{project.displayName}</span>
                      <span className="mixjam-browser-path">{project.path}</span>
                    </button>
                  </ContextMenuTrigger>
                  <ContextMenuContent aria-label={`Project actions for ${project.displayName}`}>
                    <ContextMenuItem
                      disabled={busy}
                      onSelect={() => onOpenProject(project.path)}
                    >
                      Open
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => void copyProjectPath(project.path)}>
                      Copy Path
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenuRoot>
              </li>
            ))}
          </ol>
        )
      )}
    </aside>
  )
}
