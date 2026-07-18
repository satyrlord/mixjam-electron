import { useLayoutEffect } from 'react'
import type { MixJamFileItem } from '../../../shared/backend-api'
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRoot,
  ContextMenuTrigger
} from './ui/ContextMenu'
import { Tooltip } from './ui/Tooltip'

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
  collapsed: boolean
  onOpenProject: (projectRelpath: string) => void
  onCollapsedChange?: (collapsed: boolean) => void
}

export default function MixJamBrowser({
  mixJamFiles,
  busy = false,
  collapsed,
  onOpenProject,
  onCollapsedChange
}: MixJamBrowserProps) {
  useLayoutEffect(() => {
    onCollapsedChange?.(collapsed)
  }, [collapsed, onCollapsedChange])

  const toggle = () => {
    onCollapsedChange?.(!collapsed)
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
