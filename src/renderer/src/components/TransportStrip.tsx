import type { ScanProgress } from '../../../shared/backend-api'
import { useBpmEditor } from '../hooks/useBpmEditor'
import ScanProgressBar from './ScanProgressBar'

// Transport and edit glyphs as inline SVGs: emoji codepoints render through a
// color emoji font on Windows and ignore the theme's currentColor.
const TRANSPORT_ICON_PATHS: Record<'skip-back' | 'play' | 'pause' | 'stop' | 'undo', string> = {
  'skip-back': 'M3 2.5h2v11H3zM13.5 2.5v11L6 8z',
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

interface TransportStripProps {
  transportState: 'stopped' | 'playing' | 'paused'
  bpm: number
  onSetBpm: (bpm: number) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onTransportPlay: () => void
  onTransportPause: () => void
  onTransportStop: () => void
  onTransportSkipBack: () => void
  searchQuery: string
  onSearchChange: (query: string) => void
  scanProgress: ScanProgress
  onStartScan: () => void
  onOpenShortcuts: () => void
}

export default function TransportStrip({
  transportState,
  bpm,
  onSetBpm,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onTransportPlay,
  onTransportPause,
  onTransportStop,
  onTransportSkipBack,
  searchQuery,
  onSearchChange,
  scanProgress,
  onStartScan,
  onOpenShortcuts
}: TransportStripProps) {
  const isPlaying = transportState === 'playing'

  const {
    editingBpm,
    bpmDraft,
    bpmInputRef,
    setBpmDraft,
    handleBpmEditStart,
    handleBpmEditCommit,
    handleBpmEditKeyDown
  } = useBpmEditor({ bpm, onSetBpm })

  return (
    <section className="middle-strip">
      <div className="strip-left">
        {/* Real project names arrive with .mixjam save/load (spec-011). */}
        <span className="strip-proj">Untitled</span>
        <span className="strip-sep" />
        {editingBpm ? (
          <input
            ref={bpmInputRef}
            type="number"
            className="strip-bpm-input"
            min={50}
            max={200}
            value={bpmDraft}
            onChange={(e) => setBpmDraft(e.currentTarget.value)}
            onBlur={handleBpmEditCommit}
            onKeyDown={handleBpmEditKeyDown}
            aria-label="Edit BPM"
          />
        ) : (
          <button
            type="button"
            className="strip-bpm"
            onClick={handleBpmEditStart}
            aria-label="Edit BPM"
            title="Click to edit BPM (50-200), Enter commits, Esc cancels"
          >
            {bpm} BPM
          </button>
        )}
      </div>
      <div className="strip-center">
        <button type="button" className="transport-button" aria-label="Skip Back" title="Skip back to start" onClick={onTransportSkipBack}>
          <TransportIcon shape="skip-back" />
        </button>
        <button
          type="button"
          className={`transport-button${isPlaying ? ' transport-button-play' : ''}`}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          onClick={isPlaying ? onTransportPause : onTransportPlay}
        >
          <TransportIcon shape={isPlaying ? 'pause' : 'play'} />
        </button>
        <button type="button" className="transport-button" aria-label="Stop" title="Stop" onClick={onTransportStop}>
          <TransportIcon shape="stop" />
        </button>
        <span className="strip-sep" />
        <button
          type="button"
          className="transport-button"
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          disabled={!canUndo}
          onClick={onUndo}
        >
          <TransportIcon shape="undo" />
        </button>
        <button
          type="button"
          className="transport-button"
          aria-label="Redo"
          title="Redo (Ctrl+Y)"
          disabled={!canRedo}
          onClick={onRedo}
        >
          <TransportIcon shape="undo" mirrored />
        </button>
      </div>
      <div className="strip-right">
        <ScanProgressBar progress={scanProgress} />
        <input
          type="search"
          className="strip-search"
          placeholder="Search samples…"
          aria-label="Search samples"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.currentTarget.value)}
        />
        <button
          type="button"
          className="strip-rescan"
          onClick={() => void onStartScan()}
          disabled={scanProgress.status === 'scanning'}
          aria-label={scanProgress.status === 'scanning' ? 'Scanning…' : 'Re-scan'}
          title="Re-scan the Sample Folder into the library"
        >
          {scanProgress.status === 'scanning' ? 'Scanning…' : 'Re-scan'}
        </button>
        <button
          type="button"
          className="strip-help"
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
          onClick={onOpenShortcuts}
        >
          ?
        </button>
      </div>
    </section>
  )
}
