import FolderCard from './FolderCard'
import type { FolderView } from '../hooks/useFolderSetup'
import type { LibrarySyncState, MixJamFileItem, MixJamGeneratorReadiness } from '../../../shared/backend-api'
import { THEME_OPTIONS, resolveTheme } from '../theme/themes'
import LibrarySyncStatus from './LibrarySyncStatus'
import { Tooltip } from './ui/Tooltip'
import appIconUrl from '../../../../public/app-icon-128.png'

const HOME_RECENT_LIMIT = 4

interface HomeScreenProps {
  userFolder: FolderView
  sampleFolder: FolderView
  librarySyncState: LibrarySyncState
  canStart: boolean
  mixJamFiles: MixJamFileItem[]
  projectBusy: boolean
  activeTheme: string
  onThemeChange: (themeKey: string) => void
  onPickUser: () => void
  onPickSample: () => void
  onRestoreUser: () => void
  onRestoreSample: () => void
  onRetryLibrarySync: () => void
  onCancelLibrarySync: () => void
  onStart: () => Promise<void>
  onLoad: () => Promise<boolean>
  onOpenProject: (projectRelpath: string) => Promise<boolean>
  onOpenGenerator?: () => void
  generatorReadiness?: MixJamGeneratorReadiness | null
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
  'MixJam keeps your sample library synced in the background.',
  'Drag samples onto lanes, click tiles to preview, press Space to play.'
]

export default function HomeScreen({
  userFolder,
  sampleFolder,
  librarySyncState,
  canStart,
  mixJamFiles,
  projectBusy,
  activeTheme,
  onThemeChange,
  onPickUser,
  onPickSample,
  onRestoreUser,
  onRestoreSample,
  onRetryLibrarySync,
  onCancelLibrarySync,
  onStart,
  onLoad,
  onOpenProject,
  onOpenGenerator,
  generatorReadiness
}: HomeScreenProps) {
  const sampleDisabled = userFolder.status !== 'set'
  const homeRecent = mixJamFiles.slice(0, HOME_RECENT_LIMIT)
  const generatorReady = generatorReadiness?.status === 'ready'
  const generatorNeedsPreparation = generatorReadiness?.status === 'needs-preparation'
  const userFolderUnavailable = userFolder.status !== 'set'
  const sampleFolderUnavailable = sampleFolder.status !== 'set'
  const generatorLabel = sampleFolderUnavailable
    ? sampleFolder.status === 'needs-permission' ? 'Restore Sample Folder' : 'Pick Sample Folder'
    : generatorReady
      ? 'Generate MixJam'
      : generatorNeedsPreparation
        ? 'Prepare library'
        : 'Preparing library…'
  const generatorAction = sampleFolderUnavailable
    ? sampleFolder.status === 'needs-permission' ? onRestoreSample : onPickSample
    : generatorReady ? onOpenGenerator : onRetryLibrarySync
  let generatorMessage: string | null
  if (userFolderUnavailable) {
    generatorMessage = userFolder.status === 'needs-permission'
      ? 'Restore access to the User Folder before generating.'
      : 'Select an accessible User Folder before generating.'
  } else if (sampleFolderUnavailable) {
    generatorMessage = sampleFolder.status === 'needs-permission'
      ? 'Restore access to the Sample Folder before generating.'
      : 'Select an accessible Sample Folder before generating.'
  } else if (!generatorReadiness) {
    generatorMessage = 'Checking library readiness…'
  } else {
    generatorMessage = generatorReadiness.status === 'ready' ? null : generatorReadiness.message
  }

  return (
    <div className="home-screen">
      <div className="home-content">
        <section className="home-hero" aria-label="About MixJam">
          <div className="home-brand">
            <img
              className="home-logo"
              src={appIconUrl}
              alt="MixJam logo"
              width={72}
              height={72}
            />
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
            <div className="home-themes-head">
              <span className="home-themes-label" id="home-themes-label">Home theme</span>
            </div>
            <div className="home-theme-swatches" role="group" aria-labelledby="home-themes-label">
              {THEME_OPTIONS.map((option) => {
                const theme = resolveTheme(option.key)
                const isActive = activeTheme === option.key
                return (
                  <Tooltip key={option.key} content={option.name}>
                    <button
                      type="button"
                      className={`home-theme-swatch${isActive ? ' home-theme-swatch-active' : ''}`}
                      style={{
                        background: `linear-gradient(135deg, ${theme.colors.accent} 0 50%, ${theme.colors['bg-base']} 50% 100%)`
                      }}
                      aria-label={`Switch to ${option.name} theme`}
                      aria-pressed={isActive}
                      onClick={() => onThemeChange(option.key)}
                    />
                  </Tooltip>
                )
              })}
            </div>
          </div>
        </section>

        <section className="home-setup" aria-label="App setup">
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
          >
            {librarySyncState.status !== 'unavailable' && (
              <LibrarySyncStatus
                state={librarySyncState}
                onRetry={onRetryLibrarySync}
                onCancel={onCancelLibrarySync}
              />
            )}
          </FolderCard>

          <div className="home-launch">
            <button className="btn-primary" onClick={() => void onStart()} disabled={!canStart || projectBusy}>
              Start New MixJam
            </button>
            {!canStart && <p className="home-launch-hint">Select both folders above to start.</p>}
          </div>

          <button
            type="button"
            className="link-secondary"
            disabled={!canStart || projectBusy}
            onClick={() => void onLoad()}
          >
            {projectBusy ? 'Opening…' : 'Load MixJam'}
          </button>

          {sampleFolder.ref && (
            <section className="home-generator-card" aria-labelledby="home-generator-title">
              <div>
                <h2 id="home-generator-title">Generate a MixJam</h2>
              </div>
              <button
                type="button"
                className="btn-primary"
                disabled={userFolderUnavailable || projectBusy || (!sampleFolderUnavailable &&
                  (!canStart || (!generatorReady && !generatorNeedsPreparation)))}
                onClick={generatorAction}
              >
                {generatorLabel}
              </button>
              {generatorMessage && (
                <p className="home-launch-hint">{generatorMessage}</p>
              )}
            </section>
          )}

        </section>

        {homeRecent.length > 0 && (
          <section className="home-recent" aria-labelledby="home-recent-title">
            <h2 className="home-recent-title" id="home-recent-title">Recent Projects</h2>
            <ul className="home-recent-list">
              {homeRecent.map((project) => (
                <li key={project.path}>
                  <button
                    type="button"
                    className="home-recent-item"
                    disabled={!canStart || projectBusy}
                    onClick={() => void onOpenProject(project.path)}
                  >
                    <span className="home-recent-name">{project.displayName}</span>
                    <span className="home-recent-path">{project.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
