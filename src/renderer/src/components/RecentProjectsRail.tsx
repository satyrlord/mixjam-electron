import type { RecentProjectItem } from '../../../shared/ipc'
import { PROJECT_LOAD_COMING_SOON } from './HomeScreen'

interface RecentProjectsRailProps {
  recentProjects: RecentProjectItem[]
}

export default function RecentProjectsRail({ recentProjects }: RecentProjectsRailProps) {
  return (
    <aside className="tracker-zone recent-projects-rail">
      <h2 className="tracker-zone-title">Recent Projects</h2>
      {recentProjects.length === 0 ? (
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
      )}
    </aside>
  )
}
