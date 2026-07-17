import type { RefObject } from 'react'
import type { LibrarySyncState } from '../../../shared/backend-api'
import type { RuntimeTransportState } from '../hooks/useTransportRuntime'
import SongProgressBar from './SongProgressBar'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from './ui/DropdownMenu'
import { Tooltip } from './ui/Tooltip'

// Inline SVGs avoid Windows color-emoji rendering and keep every command on
// the current theme's foreground color.
const COMMAND_ICON_PATHS = {
  'skip-back': 'M3 2.5h2v11H3zM13.5 2.5v11L6 8z',
  'jump-end': 'M11 2.5h2v11h-2zM2.5 2.5v11L10 8z',
  play: 'M4.5 2.5v11L13 8z',
  pause: 'M4 2.5h3v11H4zM9 2.5h3v11H9z',
  stop: 'M3.5 3.5h9v9h-9z',
  undo: 'M7.5 1.5 2 6l5.5 4.5V7.75h1.75a2.87 2.87 0 0 1 0 5.75H6.5v2h2.75a4.88 4.88 0 0 0 0-9.75H7.5V1.5z',
  search: 'M7 2a5 5 0 1 0 3.12 8.9l3 3 1.4-1.42-3-3A5 5 0 0 0 7 2zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6z',
  more: 'M3 6.5A1.5 1.5 0 1 1 3 9a1.5 1.5 0 0 1 0-2.5zm5 0A1.5 1.5 0 1 1 8 9a1.5 1.5 0 0 1 0-2.5zm5 0A1.5 1.5 0 1 1 13 9a1.5 1.5 0 0 1 0-2.5z',
  chevron: 'M3.5 5.5 8 10l4.5-4.5 1.25 1.25L8 12.5 2.25 6.75z',
  close: 'm3.25 4.65 1.4-1.4L8 6.6l3.35-3.35 1.4 1.4L9.4 8l3.35 3.35-1.4 1.4L8 9.4l-3.35 3.35-1.4-1.4L6.6 8z',
  retry: 'M13.5 5.5V2.75h-1.75v1.1A6 6 0 1 0 14 8h-2a4 4 0 1 1-1.48-3.1H8V6.5h5.5z'
} as const

type CommandIconShape = keyof typeof COMMAND_ICON_PATHS

function CommandIcon({
  shape,
  mirrored = false
}: {
  shape: CommandIconShape
  mirrored?: boolean
}) {
  return (
    <svg className="strip-command-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d={COMMAND_ICON_PATHS[shape]}
        {...(mirrored ? { transform: 'scale(-1 1) translate(-16 0)' } : {})}
      />
    </svg>
  )
}

function progressPercent(processed: number, total: number): number | undefined {
  if (total <= 0) return undefined
  return Math.min(100, Math.max(0, Math.round((processed / total) * 100)))
}

interface LibraryActivityProps {
  state: LibrarySyncState
  onCancel: () => void
  onRetry: () => void
}

function LibraryActivity({ state, onCancel, onRetry }: LibraryActivityProps) {
  let label: string
  let detail: string
  let percentage: number | undefined
  let active = false
  let retryable = false
  let error = false

  switch (state.status) {
    case 'checking':
      label = 'Checking library'
      detail = 'Checking the Sample Folder for changes'
      active = true
      break
    case 'syncing':
      percentage = progressPercent(state.processed, state.total)
      label = state.phase === 1 ? 'Finding changes' : 'Updating library'
      detail = percentage === undefined
        ? label
        : `${label}, ${percentage}% complete`
      active = true
      break
    case 'analyzing':
      percentage = progressPercent(state.analyzed, state.total)
      label = 'Analyzing samples'
      detail = percentage === undefined
        ? label
        : `${label}, ${percentage}% complete`
      active = true
      break
    case 'cancelled':
      label = 'Library sync cancelled'
      detail = 'Library sync was cancelled'
      retryable = !state.hasUsableIndex
      break
    case 'error':
      label = 'Library sync failed'
      detail = `Library sync failed: ${state.message}`
      retryable = !state.hasUsableIndex
      error = true
      break
    default:
      return null
  }

  return (
    <div
      className={`strip-activity${active ? ' strip-activity-active' : ''}${error ? ' strip-activity-error' : ''}`}
      role="status"
      aria-live="polite"
      aria-label={detail}
    >
      <span className="strip-activity-indicator" aria-hidden="true" />
      <span className="strip-activity-copy">
        <span className="strip-activity-label">{label}</span>
        {percentage !== undefined && (
          <progress max={100} value={percentage} aria-hidden="true" />
        )}
      </span>
      {active && (
        <button
          type="button"
          className="strip-activity-action"
          aria-label="Cancel library sync"
          onClick={onCancel}
        >
          <CommandIcon shape="close" />
        </button>
      )}
      {retryable && (
        <button
          type="button"
          className="strip-activity-action"
          aria-label="Retry library sync"
          onClick={onRetry}
        >
          <CommandIcon shape="retry" />
        </button>
      )}
    </div>
  )
}

interface MiddleStripProps {
  trackerScrollportRef: RefObject<HTMLDivElement>
  trackerScrollportId: string
  projectName: string
  projectDirty: boolean
  projectBusy: boolean
  canRegenerate?: boolean
  onNewProject: () => void
  onOpenProject: () => void
  onSaveProject: () => void
  onSaveProjectAs: () => void
  onRegenerateExact?: () => void
  onRegenerateCurrent?: () => void
  transportState: RuntimeTransportState
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onTransportPlay: () => void
  onTransportPause: () => void
  onTransportStop: () => void
  onTransportSkipBack: () => void
  onTransportJumpToEnd: () => void
  jumpToEndDisabled: boolean
  searchQuery: string
  onSearchChange: (query: string) => void
  librarySyncState: LibrarySyncState
  onRescanLibrary: () => void
  onCancelLibrarySync: () => void
  onRetryLibrarySync: () => void
  onOpenShortcuts: () => void
}

export default function MiddleStrip({
  trackerScrollportRef,
  trackerScrollportId,
  projectName,
  projectDirty,
  projectBusy,
  canRegenerate = false,
  onNewProject,
  onOpenProject,
  onSaveProject,
  onSaveProjectAs,
  onRegenerateExact = () => {},
  onRegenerateCurrent = () => {},
  transportState,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onTransportPlay,
  onTransportPause,
  onTransportStop,
  onTransportSkipBack,
  onTransportJumpToEnd,
  jumpToEndDisabled,
  searchQuery,
  onSearchChange,
  librarySyncState,
  onRescanLibrary,
  onCancelLibrarySync,
  onRetryLibrarySync,
  onOpenShortcuts
}: MiddleStripProps) {
  const isPlaying = transportState === 'playing'
  const isPreparing = transportState === 'preparing'
  const libraryBusy = librarySyncState.status === 'checking' ||
    librarySyncState.status === 'syncing' ||
    librarySyncState.status === 'analyzing'

  return (
    <section className="middle-strip">
      <SongProgressBar
        scrollportRef={trackerScrollportRef}
        scrollportId={trackerScrollportId}
      />
      <div className="middle-strip-main">
        <div className="strip-project-zone">
          <DropdownMenuRoot>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="strip-project-trigger"
                aria-label={`${projectName}${projectDirty ? ', unsaved changes' : ''}, project menu`}
              >
                <span className="strip-project-name">{projectName}</span>
                {projectDirty && (
                  <span className="strip-project-dirty" aria-hidden="true" />
                )}
                <CommandIcon shape="chevron" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="strip-project-menu" align="start">
              <DropdownMenuItem disabled={projectBusy} onSelect={() => onNewProject()} aria-label="New">
                <span>New</span>
              </DropdownMenuItem>
              <DropdownMenuItem disabled={projectBusy} onSelect={() => onOpenProject()} aria-label="Open">
                <span>Open</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="strip-menu-separator" />
              <DropdownMenuItem disabled={projectBusy} onSelect={() => onSaveProject()} aria-label="Save">
                <span>Save</span>
                <span className="strip-menu-hint">Ctrl+S</span>
              </DropdownMenuItem>
              <DropdownMenuItem disabled={projectBusy} onSelect={() => onSaveProjectAs()} aria-label="Save As">
                <span>Save As</span>
                <span className="strip-menu-hint">Ctrl+Shift+S</span>
              </DropdownMenuItem>
              {canRegenerate && (
                <>
                  <DropdownMenuSeparator className="strip-menu-separator" />
                  <DropdownMenuItem disabled={projectBusy} onSelect={onRegenerateExact} aria-label="Regenerate exact">
                    <span>Regenerate exact</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={projectBusy} onSelect={onRegenerateCurrent} aria-label="Regenerate with current library">
                    <span>Regenerate with current library</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenuRoot>
        </div>

        <div className="strip-command-dock">
          <div className="strip-edit-group" aria-label="Edit history">
            <Tooltip content="Undo (Ctrl+Z)">
              <span className="mixjam-tooltip-anchor">
                <button
                  type="button"
                  className="strip-command-button"
                  aria-label="Undo"
                  disabled={!canUndo}
                  onClick={onUndo}
                >
                  <CommandIcon shape="undo" />
                </button>
              </span>
            </Tooltip>
            <Tooltip content="Redo (Ctrl+Y)">
              <span className="mixjam-tooltip-anchor">
                <button
                  type="button"
                  className="strip-command-button"
                  aria-label="Redo"
                  disabled={!canRedo}
                  onClick={onRedo}
                >
                  <CommandIcon shape="undo" mirrored />
                </button>
              </span>
            </Tooltip>
          </div>

          <div className="transport-ribbon" aria-label="Transport Ribbon">
            <Tooltip content="Skip back to start">
              <button
                type="button"
                className="strip-command-button"
                aria-label="Skip Back"
                onClick={onTransportSkipBack}
              >
                <CommandIcon shape="skip-back" />
              </button>
            </Tooltip>
            <Tooltip content="Jump to song end">
              <span className="mixjam-tooltip-anchor">
                <button
                  type="button"
                  className="strip-command-button"
                  aria-label="Jump to End"
                  onClick={onTransportJumpToEnd}
                  disabled={jumpToEndDisabled}
                >
                  <CommandIcon shape="jump-end" />
                </button>
              </span>
            </Tooltip>
            <Tooltip content={isPreparing ? 'Preparing audio; Stop cancels' : isPlaying ? 'Pause (Space)' : 'Play (Space)'}>
              <span className="mixjam-tooltip-anchor">
                <button
                  type="button"
                  className="strip-command-button strip-command-primary"
                  aria-label={isPreparing ? 'Preparing playback' : isPlaying ? 'Pause' : 'Play'}
                  onClick={isPlaying ? onTransportPause : onTransportPlay}
                  disabled={isPreparing}
                >
                  <CommandIcon shape={isPlaying ? 'pause' : 'play'} />
                </button>
              </span>
            </Tooltip>
            <Tooltip content="Stop">
              <button
                type="button"
                className="strip-command-button"
                aria-label="Stop"
                onClick={onTransportStop}
              >
                <CommandIcon shape="stop" />
              </button>
            </Tooltip>
          </div>
        </div>

        <div className="strip-utility-zone">
          <label className="strip-search-field">
            <CommandIcon shape="search" />
            <input
              type="search"
              placeholder="Search samples…"
              aria-label="Search samples"
              value={searchQuery}
              onChange={(event) => onSearchChange(event.currentTarget.value)}
            />
          </label>

          <LibraryActivity
            state={librarySyncState}
            onCancel={onCancelLibrarySync}
            onRetry={onRetryLibrarySync}
          />

          <DropdownMenuRoot>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="strip-more-trigger"
                aria-label="More actions"
              >
                <CommandIcon shape="more" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="strip-more-menu" align="end">
              <DropdownMenuItem onSelect={() => onOpenShortcuts()} aria-label="Keyboard Shortcuts">
                <span>Keyboard Shortcuts</span>
                <span className="strip-menu-hint">?</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="strip-menu-separator" />
              <DropdownMenuItem
                disabled={libraryBusy}
                onSelect={() => onRescanLibrary()}
                className="strip-rescan-menu-item"
                aria-label="Re-scan Sample Folder"
              >
                <span>
                  <strong>Re-scan Sample Folder</strong>
                  <small>Use if files changed while MixJam is already open.</small>
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuRoot>
        </div>
      </div>
    </section>
  )
}
