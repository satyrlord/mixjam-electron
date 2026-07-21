import { type ReactNode, useState } from 'react'
import FolderCard from './FolderCard'
import type { FolderView } from '../hooks/useFolderSetup'
import type { LibrarySyncState, MixJamFileItem, MixJamGeneratorReadiness } from '../../../shared/backend-api'
import LibrarySyncStatus from './LibrarySyncStatus'
import { Tooltip } from './ui/Tooltip'
import { getLibrarySyncPresentation } from '../lib/library-sync-presentation'
import appIconUrl from '../../../../public/app-icon-128.png'

const HOME_RECENT_LIMIT = 4
const RECENT_DATE_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

interface HomeScreenProps {
  userFolder: FolderView
  sampleFolder: FolderView
  librarySyncState: LibrarySyncState
  canStart: boolean
  mixJamFiles: MixJamFileItem[]
  projectBusy: boolean
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

function projectLocation(path: string): string {
  const separator = path.lastIndexOf('/')
  return separator > 0 ? path.slice(0, separator) : 'User Folder'
}

function formatLastOpened(lastOpened: string | null): string | null {
  if (!lastOpened) return null
  const date = new Date(lastOpened)
  if (Number.isNaN(date.getTime())) return null
  return RECENT_DATE_FORMAT.format(date)
}

interface LibrarySetupSectionProps {
  userFolder: FolderView
  sampleFolder: FolderView
  librarySyncState: LibrarySyncState
  folderControls: ReactNode
  onRetryLibrarySync: () => void
  onCancelLibrarySync: () => void
}

interface HomeWorkflowSections {
  librarySection: ReactNode
  projectActionsSection: ReactNode
  generatorSection: ReactNode | null
}

type HomeSetupViewProps = HomeWorkflowSections

interface HomeProjectViewProps extends HomeWorkflowSections {
  homeRecent: MixJamFileItem[]
  projectBusy: boolean
  onOpenProject: (projectRelpath: string) => Promise<boolean>
}

function LibrarySetupSection({
  userFolder,
  sampleFolder,
  folderControls,
  librarySyncState,
  onRetryLibrarySync,
  onCancelLibrarySync
}: LibrarySetupSectionProps) {
  const [foldersExpanded, setFoldersExpanded] = useState(false)
  const librarySyncPresentation = getLibrarySyncPresentation(librarySyncState)
  const libraryReady = userFolder.status === 'set' && sampleFolder.status === 'set' &&
    librarySyncState.status === 'ready'
  const showFolderControls = !libraryReady || foldersExpanded

  return (
    <section className="home-workflow-section home-library-setup" aria-labelledby="home-library-title">
      <h2 className="home-workflow-title" id="home-library-title">Library Setup</h2>
      {libraryReady && (
        <div className="home-library-summary">
          <span className="home-library-indicator" aria-hidden="true" />
          <span className="home-library-summary-copy">
            <strong>Library ready</strong>
          </span>
          <span className="home-library-folders">
            <span>User <strong>{userFolder.ref?.name}</strong></span>
            <span>Samples <strong>{sampleFolder.ref?.name}</strong></span>
          </span>
          <button
            type="button"
            className="home-library-change"
            aria-expanded={foldersExpanded}
            aria-controls={foldersExpanded ? 'home-folder-controls' : undefined}
            onClick={() => setFoldersExpanded((expanded) => !expanded)}
          >
            {foldersExpanded ? 'Done' : 'Change folders'}
          </button>
        </div>
      )}
      {showFolderControls && folderControls}
      {!libraryReady && librarySyncPresentation.hasStatus && (
        <div className="home-library-status">
          <LibrarySyncStatus
            state={librarySyncState}
            onRetry={onRetryLibrarySync}
            onCancel={onCancelLibrarySync}
          />
        </div>
      )}
    </section>
  )
}

function HomeHero({ showSteps }: { showSteps: boolean }): ReactNode {
  return (
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

      {showSteps && (
        <ol className="home-steps">
          {QUICK_START_STEPS.map((step, i) => (
            <li key={i} className="home-step">
              <span className="home-step-num" aria-hidden="true">{i + 1}</span>
              <span className="home-step-text">{step}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function HomeSetupView({ librarySection, projectActionsSection, generatorSection }: HomeSetupViewProps) {
  return (
    <div className="home-screen home-setup-priority">
      <div className="home-content">
        <HomeHero showSteps />
        <section className="home-setup" aria-label="MixJam workflows">
          {librarySection}
          {projectActionsSection}
          {generatorSection}
        </section>
      </div>
    </div>
  )
}

function HomeProjectView({
  librarySection,
  projectActionsSection,
  generatorSection,
  homeRecent,
  projectBusy,
  onOpenProject
}: HomeProjectViewProps) {
  return (
    <div className="home-screen home-project-priority">
      <div className="home-content">
        <HomeHero showSteps={false} />
        <section className="home-setup" aria-label="MixJam workflows">
          {librarySection}
          {projectActionsSection}
          {generatorSection}
        </section>

        {homeRecent.length > 0 && (
          <section className="home-recent" aria-labelledby="home-recent-title">
            <h2 className="home-recent-title" id="home-recent-title">Recent Projects</h2>
            <ul className="home-recent-list">
              {homeRecent.map((project) => {
                const lastOpened = formatLastOpened(project.lastOpened)
                return (
                  <li key={project.path}>
                    <Tooltip content={project.path}>
                      <button
                        type="button"
                        className="home-recent-item"
                        aria-label={`Open ${project.displayName} from ${project.path}`}
                        disabled={projectBusy}
                        onClick={() => void onOpenProject(project.path)}
                      >
                        <span className="home-recent-copy">
                          <span className="home-recent-name">{project.displayName}</span>
                          <span className="home-recent-location">{projectLocation(project.path)}</span>
                        </span>
                        {lastOpened && (
                          <time className="home-recent-time" dateTime={project.lastOpened ?? undefined}>
                            Last opened {lastOpened}
                          </time>
                        )}
                      </button>
                    </Tooltip>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}

export default function HomeScreen({
  userFolder,
  sampleFolder,
  librarySyncState,
  canStart,
  mixJamFiles,
  projectBusy,
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
  const librarySyncPresentation = getLibrarySyncPresentation(librarySyncState)
  const libraryPreparationMessage = librarySyncPresentation.preparationMessage
  const userFolderUnavailable = userFolder.status !== 'set'
  const sampleFolderUnavailable = sampleFolder.status !== 'set'
  const generatorLabel = sampleFolderUnavailable
    ? sampleFolder.status === 'needs-permission' ? 'Restore Sample Folder' : 'Pick Sample Folder'
    : generatorReady
      ? 'Generate MixJam'
      : generatorNeedsPreparation
        ? 'Prepare library'
        : 'Generate MixJam'
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
  } else if (libraryPreparationMessage) {
    generatorMessage = libraryPreparationMessage
  } else if (!generatorReadiness) {
    generatorMessage = 'Checking library readiness…'
  } else {
    generatorMessage = generatorReadiness.status === 'ready' ? null : generatorReadiness.message
  }

  const folderControls = (
    <div className="home-folder-grid" id="home-folder-controls">
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
    </div>
  )

  const librarySection = (
    <LibrarySetupSection
      userFolder={userFolder}
      sampleFolder={sampleFolder}
      folderControls={folderControls}
      librarySyncState={librarySyncState}
      onRetryLibrarySync={onRetryLibrarySync}
      onCancelLibrarySync={onCancelLibrarySync}
    />
  )

  const projectActionsSection = (
    <section className="home-workflow-section home-project-actions" aria-labelledby="home-project-actions-title" data-can-start={String(canStart)} data-project-busy={String(projectBusy)}>
      <h2 className="home-workflow-title" id="home-project-actions-title">Create or Open</h2>
      <div className="home-project-action-row">
        <div className="home-launch">
          <button
            className="btn-primary"
            aria-describedby={!canStart ? 'home-start-hint' : undefined}
            onClick={() => void onStart()}
            disabled={!canStart || projectBusy}
          >
            Start New MixJam
          </button>
          {!canStart && (
            <p className="home-launch-hint" id="home-start-hint">Select both folders above to start.</p>
          )}
        </div>

        <button
          type="button"
          className="btn-secondary"
          disabled={!canStart || projectBusy}
          onClick={() => void onLoad()}
        >
          {projectBusy ? 'Opening…' : 'Load MixJam'}
        </button>
      </div>
    </section>
  )

  const generatorSection = sampleFolder.ref ? (
    <section className="home-workflow-section home-generator" aria-labelledby="home-generator-title">
      <div className="home-generator-copy">
        <h2 className="home-workflow-title" id="home-generator-title">Generate a MixJam</h2>
        <p className="home-workflow-copy">Build a draft from your analyzed samples.</p>
        {generatorMessage && (
          <p className="home-launch-hint" id="home-generator-status">{generatorMessage}</p>
        )}
      </div>
      <button
        type="button"
        className="btn-secondary"
        aria-describedby={generatorMessage ? 'home-generator-status' : undefined}
        disabled={userFolderUnavailable || projectBusy || libraryPreparationMessage !== null || (!sampleFolderUnavailable &&
          (!canStart || (!generatorReady && !generatorNeedsPreparation)))}
        onClick={generatorAction}
      >
        {generatorLabel}
      </button>
    </section>
  ) : null

  if (canStart) {
    return (
      <HomeProjectView
        librarySection={librarySection}
        projectActionsSection={projectActionsSection}
        generatorSection={generatorSection}
        homeRecent={homeRecent}
        projectBusy={projectBusy}
        onOpenProject={onOpenProject}
      />
    )
  }
  return (
    <HomeSetupView
      librarySection={librarySection}
      projectActionsSection={projectActionsSection}
      generatorSection={generatorSection}
    />
  )
}
