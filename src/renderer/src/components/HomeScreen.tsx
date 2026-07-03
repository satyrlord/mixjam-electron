import FolderCard from './FolderCard'
import BrandMark from './BrandMark'
import type { FolderView } from '../hooks/useFolderSession'
import type { RecentProjectItem } from '../../../shared/backend-api'
import { THEME_OPTIONS, resolveTheme } from '../theme/themes'

const HOME_RECENT_LIMIT = 4

// Project load requires .mixjam persistence (spec-011), which has not shipped.
// The affordances stay visible but disabled so the UI does not promise a load
// it cannot perform yet.
export const PROJECT_LOAD_COMING_SOON =
  'Coming soon — opening projects arrives with .mixjam save/load (spec-011)'

interface HomeScreenProps {
  userFolder: FolderView
  sampleFolder: FolderView
  canStart: boolean
  recentProjects: RecentProjectItem[]
  activeTheme: string
  onThemeChange: (themeKey: string) => void
  onPickUser: () => void
  onPickSample: () => void
  onRestoreUser: () => void
  onRestoreSample: () => void
  onStart: () => void
}

const userIcon = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M2.5 5.5a1 1 0 0 1 1-1h4l1.5 1.5h6a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-12a1 1 0 0 1-1-1z" />
    <path d="M10 9v4M8 11h4" strokeLinecap="round" />
  </svg>
)

const sampleIcon = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M2.5 5.5a1 1 0 0 1 1-1h4l1.5 1.5h6a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-12a1 1 0 0 1-1-1z" />
    <path d="M8 8.5v4.5M8 8.5l4-1v4.5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="7" cy="13" r="1" />
    <circle cx="11" cy="12" r="1" />
  </svg>
)

const QUICK_START_STEPS = [
  'Pick a User Folder for your projects and a Sample Folder to jam with.',
  'Start a new MixJam — the first run scans your library into the browser.',
  'Drag samples onto lanes, click tiles to preview, press Space to play.'
]

export default function HomeScreen({
  userFolder,
  sampleFolder,
  canStart,
  recentProjects,
  activeTheme,
  onThemeChange,
  onPickUser,
  onPickSample,
  onRestoreUser,
  onRestoreSample,
  onStart
}: HomeScreenProps) {
  const sampleDisabled = userFolder.status !== 'set'
  const homeRecent = recentProjects.slice(0, HOME_RECENT_LIMIT)

  return (
    <div className="home-screen">
      <div className="home-content">
        <section className="home-hero" aria-label="About MixJam">
          <div className="home-brand">
            <BrandMark size={72} />
            <div className="home-brand-text">
              <h1 className="home-wordmark">MixJam</h1>
              <p className="home-tagline">Sketch beats straight from your sample library.</p>
            </div>
          </div>

          <ol className="home-steps">
            {QUICK_START_STEPS.map((step, i) => (
              <li key={i} className="home-step">
                <span className="home-step-num" aria-hidden="true">{i + 1}</span>
                <span className="home-step-text">{step}</span>
              </li>
            ))}
          </ol>

          <div className="home-themes">
            <span className="home-themes-label" id="home-themes-label">Make it yours</span>
            <div className="home-theme-swatches" role="group" aria-labelledby="home-themes-label">
              {THEME_OPTIONS.map((option) => {
                const theme = resolveTheme(option.key)
                const isActive = activeTheme === option.key
                return (
                  <button
                    key={option.key}
                    type="button"
                    className={`home-theme-swatch${isActive ? ' home-theme-swatch-active' : ''}`}
                    style={{
                      background: `linear-gradient(135deg, ${theme.colors.accent} 0 50%, ${theme.colors['bg-base']} 50% 100%)`
                    }}
                    title={option.name}
                    aria-label={`Switch to ${option.name} theme`}
                    aria-pressed={isActive}
                    onClick={() => onThemeChange(option.key)}
                  />
                )
              })}
            </div>
          </div>
        </section>

        <section className="home-setup" aria-label="Session setup">
          <FolderCard
            label="User Folder"
            icon={userIcon}
            folderName={userFolder.ref?.name ?? null}
            status={userFolder.status}
            disabled={false}
            emptyPrompt="Choose where MixJam saves your projects and exports."
            onPick={onPickUser}
            onRestore={onRestoreUser}
          />
          <FolderCard
            label="Sample Folder"
            icon={sampleIcon}
            folderName={sampleFolder.ref?.name ?? null}
            status={sampleFolder.status}
            disabled={sampleDisabled}
            emptyPrompt="Choose the folder that holds your sample library."
            onPick={onPickSample}
            onRestore={onRestoreSample}
          />

          <div className="home-launch">
            <button className="btn-primary" onClick={onStart} disabled={!canStart}>
              Start New MixJam
            </button>
            {!canStart && <p className="home-launch-hint">Select both folders above to start.</p>}
          </div>

          <button className="link-secondary" disabled title={PROJECT_LOAD_COMING_SOON}>
            Load MixJam
          </button>

          {homeRecent.length > 0 && (
            <div className="home-recent">
              <h2 className="home-recent-title">Recent Projects</h2>
              <ul className="home-recent-list">
                {homeRecent.map((project) => (
                  <li key={project.path}>
                    <button
                      type="button"
                      className="home-recent-item"
                      disabled
                      title={PROJECT_LOAD_COMING_SOON}
                    >
                      <span className="home-recent-name">{project.displayName}</span>
                      <span className="home-recent-path">{project.path}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
