import { memo, useCallback } from 'react'
import { LANE_HEAD_WIDTH_PX, LANE_HEIGHT_PX, type LaneState } from '../lib/playerShell'
import LaneClipCanvas from './LaneClipCanvas'

interface LaneRowProps {
  lane: LaneState
  dimmed: boolean
  totalTicks: number
  flashSamplePath: string | null
  selectedClipIds: ReadonlySet<string>
  onToggleLaneMute: (laneIndex: number) => void
  onToggleLaneSolo: (laneIndex: number) => void
  onSetLanePan: (laneIndex: number, pan: number) => void
  onClipDragStart: (clipId: string, event: React.DragEvent) => void
  onClipContextMenu: (info: {
    x: number; y: number; laneIndex: number; clipId: string; samplePath: string; sampleName: string
  }) => void
  onDragOver: (event: React.DragEvent) => void
  onDrop: (laneIndex: number, event: React.DragEvent<HTMLDivElement>) => void
  trackDragCleanup: (cleanup: () => void) => () => void
}

function LaneRow({
  lane,
  dimmed,
  totalTicks,
  flashSamplePath,
  selectedClipIds,
  onToggleLaneMute,
  onToggleLaneSolo,
  onSetLanePan,
  onClipDragStart,
  onClipContextMenu,
  onDragOver,
  onDrop,
  trackDragCleanup
}: LaneRowProps) {
  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => onDrop(lane.index, event),
    [onDrop, lane.index]
  )

  return (
    <div
      className={`tracker-lane${dimmed ? ' tracker-lane-dimmed' : ''}`}
      style={{ height: LANE_HEIGHT_PX }}
    >
      <div className="tracker-lane-head" style={{ width: LANE_HEAD_WIDTH_PX }}>
        <span className="tracker-lane-name">{lane.name}</span>
        <div className="tracker-lane-controls">
          <button
            type="button"
            className={`tracker-lane-mute${lane.muted ? ' tracker-lane-mute-active' : ''}`}
            aria-label={`Mute ${lane.name}`}
            title={lane.muted ? 'Unmute lane' : 'Mute lane'}
            onClick={() => onToggleLaneMute(lane.index)}
          >M</button>
          <button
            type="button"
            className={`tracker-lane-solo${lane.solo ? ' tracker-lane-solo-active' : ''}`}
            aria-label={`Solo ${lane.name}`}
            title={lane.solo ? 'Unsolo lane' : 'Solo lane'}
            onClick={() => onToggleLaneSolo(lane.index)}
          >S</button>
          <span
            className="tracker-lane-pan"
            role="slider"
            tabIndex={0}
            aria-label={`Pan ${lane.name}`}
            title="Drag or use Arrow keys to pan; Home to center"
            aria-valuemin={-100}
            aria-valuemax={100}
            aria-valuenow={Math.round(lane.pan * 100)}
            style={{ '--pan-angle': `${lane.pan * 135}deg` } as React.CSSProperties}
            onKeyDown={(e) => {
              const PAN_STEP = 0.05
              if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                e.preventDefault()
                onSetLanePan(lane.index, Math.min(1, lane.pan + PAN_STEP))
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                e.preventDefault()
                onSetLanePan(lane.index, Math.max(-1, lane.pan - PAN_STEP))
              } else if (e.key === 'Home') {
                e.preventDefault()
                onSetLanePan(lane.index, 0)
              }
            }}
            onMouseDown={(e) => {
              // Ignore right/middle press — it must not start a pan scrub (the
              // browser context menu handles right-click).
              if (e.button > 0) return
              e.preventDefault()
              const startX = e.clientX
              const startPan = lane.pan
              const onMove = (moveEvent: MouseEvent) => {
                const delta = (moveEvent.clientX - startX) * 0.01
                onSetLanePan(lane.index, Math.max(-1, Math.min(1, startPan + delta)))
              }
              const onUp = () => {
                window.removeEventListener('mousemove', onMove)
                window.removeEventListener('mouseup', onUp)
                untrack()
              }
              window.addEventListener('mousemove', onMove)
              window.addEventListener('mouseup', onUp)
              const untrack = trackDragCleanup(onUp)
            }}
            onDoubleClick={() => {
              onSetLanePan(lane.index, 0)
            }}
          />
        </div>
      </div>
      <div
        className="tracker-lane-canvas"
        onDragOver={onDragOver}
        onDrop={handleDrop}
        role="region"
        aria-label={`Lane ${lane.index + 1} track area`}
      >
        <LaneClipCanvas
          clips={lane.clips}
          totalTicks={totalTicks}
          laneIndex={lane.index}
          flashSamplePath={flashSamplePath}
          selectedClipIds={selectedClipIds}
          onClipDragStart={onClipDragStart}
          onClipContextMenu={onClipContextMenu}
        />
      </div>
    </div>
  )
}

// Memoized so the tracker's 10Hz playhead/meter updates skip re-rendering
// lanes whose props have not changed. Only re-renders when its own lane's
// state (clips, mute, solo, pan), selection, or flash target change.
export default memo(LaneRow)
