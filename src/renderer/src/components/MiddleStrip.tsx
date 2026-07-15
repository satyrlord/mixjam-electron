import type { AnalysisProgress, ScanProgress } from '../../../shared/backend-api'
import type { RefObject } from 'react'
import ScanProgressBar from './ScanProgressBar'
import AnalysisProgressBar from './AnalysisProgressBar'
import SongProgressBar from './SongProgressBar'
import type { RuntimeTransportState } from '../hooks/useTransportRuntime'
import { Tooltip } from './ui/Tooltip'

// Transport and edit glyphs as inline SVGs: emoji codepoints render through a
// color emoji font on Windows and ignore the theme's currentColor.
const TRANSPORT_ICON_PATHS: Record<'skip-back' | 'jump-end' | 'play' | 'pause' | 'stop' | 'undo', string> = {
  'skip-back': 'M3 2.5h2v11H3zM13.5 2.5v11L6 8z',
  'jump-end': 'M11 2.5h2v11h-2zM2.5 2.5v11L10 8z',
  play: 'M4.5 2.5v11L13 8z',
  pause: 'M4 2.5h3v11H4zM9 2.5h3v11H9z',
  stop: 'M3.5 3.5h9v9h-9z',
  undo: 'M7.5 1.5 2 6l5.5 4.5V7.75h1.75a2.87 2.87 0 0 1 0 5.75H6.5v2h2.75a4.88 4.88 0 0 0 0-9.75H7.5V1.5z'
}

function TransportIcon({ shape, mirrored = false }: {
  shape: keyof typeof TRANSPORT_ICON_PATHS
  mirrored?: boolean
}) {
  return (
    <svg className="transport-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d={TRANSPORT_ICON_PATHS[shape]}
        {...(mirrored ? { transform: 'scale(-1 1) translate(-16 0)' } : {})}
      />
    </svg>
  )
}

interface MiddleStripProps {
  trackerScrollportRef: RefObject<HTMLDivElement>
  trackerScrollportId: string
  projectName: string
  projectDirty: boolean
  projectBusy: boolean
  onOpenProject: () => void
  onSaveProject: () => void
  onSaveProjectAs: () => void
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
  scanProgress: ScanProgress
  analysisProgress: AnalysisProgress
  onStartScan: (uniformBatchConfirmed?: boolean) => void
  onCancelScan: () => void
  onOpenShortcuts: () => void
}

export default function MiddleStrip({
  trackerScrollportRef,
  trackerScrollportId,
  projectName,
  projectDirty,
  projectBusy,
  onOpenProject,
  onSaveProject,
  onSaveProjectAs,
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
  scanProgress,
  analysisProgress,
  onStartScan,
  onCancelScan,
  onOpenShortcuts
}: MiddleStripProps) {
  const isPlaying = transportState === 'playing'
  const isPreparing = transportState === 'preparing'
  const scanBusy = scanProgress.status === 'scanning'
  const analysisBusy = analysisProgress.status === 'analyzing'
  const libraryBusy = scanBusy || analysisBusy
  const startUniformScan = (): void => {
    const confirmed = window.confirm(
      'Uniform Re-scan replaces automatic BPM and key results using the whole batch. Continue only if every sample shares one tempo and key.'
    )
    if (confirmed) void onStartScan(true)
  }

  return (
    <section className="middle-strip">
      <SongProgressBar
        scrollportRef={trackerScrollportRef}
        scrollportId={trackerScrollportId}
      />
      <div className="middle-strip-main">
        <div className="strip-left">
          <span
            className="strip-proj"
            aria-label={`${projectName}${projectDirty ? ', unsaved changes' : ''}`}
          >
            {projectName}{projectDirty && <span className="strip-proj-dirty" aria-hidden="true"> *</span>}
          </span>
          <div className="strip-project-actions" aria-label="Project file actions">
            <button type="button" onClick={onOpenProject} disabled={projectBusy}>Open</button>
            <button type="button" onClick={onSaveProject} disabled={projectBusy}>Save</button>
            <button type="button" onClick={onSaveProjectAs} disabled={projectBusy}>Save As…</button>
          </div>
        </div>
        <div className="transport-ribbon" aria-label="Transport Ribbon">
          <Tooltip content="Skip back to start"><button type="button" className="transport-button" aria-label="Skip Back" onClick={onTransportSkipBack}>
            <TransportIcon shape="skip-back" />
          </button></Tooltip>
          <Tooltip content="Jump to song end"><span className="mixjam-tooltip-anchor"><button
            type="button"
            className="transport-button"
            aria-label="Jump to End"
            onClick={onTransportJumpToEnd}
            disabled={jumpToEndDisabled}
          >
            <TransportIcon shape="jump-end" />
          </button></span></Tooltip>
          <Tooltip content={isPreparing ? 'Preparing audio; Stop cancels' : isPlaying ? 'Pause (Space)' : 'Play (Space)'}><span className="mixjam-tooltip-anchor"><button
            type="button"
            className={`transport-button${isPlaying || isPreparing ? ' transport-button-play' : ''}`}
            aria-label={isPreparing ? 'Preparing playback' : isPlaying ? 'Pause' : 'Play'}
            onClick={isPlaying ? onTransportPause : onTransportPlay}
            disabled={isPreparing}
          >
            <TransportIcon shape={isPlaying ? 'pause' : 'play'} />
          </button></span></Tooltip>
          <Tooltip content="Stop"><button type="button" className="transport-button" aria-label="Stop" onClick={onTransportStop}>
            <TransportIcon shape="stop" />
          </button></Tooltip>
          <span className="strip-sep" />
          <Tooltip content="Undo (Ctrl+Z)"><span className="mixjam-tooltip-anchor"><button
            type="button"
            className="transport-button"
            aria-label="Undo"
            disabled={!canUndo}
            onClick={onUndo}
          >
            <TransportIcon shape="undo" />
          </button></span></Tooltip>
          <Tooltip content="Redo (Ctrl+Y)"><span className="mixjam-tooltip-anchor"><button
            type="button"
            className="transport-button"
            aria-label="Redo"
            disabled={!canRedo}
            onClick={onRedo}
          >
            <TransportIcon shape="undo" mirrored />
          </button></span></Tooltip>
        </div>
        <div className="strip-right">
          <ScanProgressBar progress={scanProgress} />
          <AnalysisProgressBar progress={analysisProgress} />
          <input
            type="search"
            className="strip-search"
            placeholder="Search samples…"
            aria-label="Search samples"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.currentTarget.value)}
          />
          <Tooltip content="Re-scan the Sample Folder into the library"><span className="mixjam-tooltip-anchor"><button
            type="button"
            className="strip-rescan"
            onClick={() => void onStartScan()}
            disabled={libraryBusy}
            aria-label={scanBusy ? 'Scanning...' : analysisBusy ? 'Analyzing samples...' : 'Re-scan'}
          >
            {scanBusy ? 'Scanning...' : analysisBusy ? 'Analyzing...' : 'Re-scan'}
          </button></span></Tooltip>
          <Tooltip content="Calibrate a library where every sample shares one tempo and key"><span className="mixjam-tooltip-anchor"><button
            type="button"
            className="strip-uniform-rescan"
            onClick={startUniformScan}
            disabled={libraryBusy}
            aria-label="Uniform Re-scan"
          >
            Uniform Re-scan
          </button></span></Tooltip>
          {scanBusy && (
            <Tooltip content="Cancel the current re-scan"><button
              type="button"
              className="strip-cancel-scan"
              onClick={() => void onCancelScan()}
              aria-label="Cancel scan"
            >
              Cancel
            </button></Tooltip>
          )}
          <Tooltip content="Keyboard shortcuts (?)"><button
            type="button"
            className="strip-help"
            aria-label="Keyboard shortcuts"
            onClick={onOpenShortcuts}
          >
            ?
          </button></Tooltip>
        </div>
      </div>
    </section>
  )
}
