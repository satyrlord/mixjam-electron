import { memo, useCallback, useState } from 'react'
import { LANE_HEAD_WIDTH_PX, LANE_HEIGHT_PX, type LaneState } from '../lib/arrangement'
import { nextPanCycle } from '../lib/sample-utils'
import LaneSampleBubbleCanvas from './LaneSampleBubbleCanvas'

interface LaneRowProps {
  lane: LaneState
  dimmed: boolean
  totalTicks: number
  flashSamplePath: string | null
  selectedPlacementIds: ReadonlySet<string>
  missingSamplePaths: ReadonlySet<string>
  onToggleLaneMute: (laneIndex: number) => void
  onToggleLaneSolo: (laneIndex: number) => void
  onSetLanePan: (laneIndex: number, pan: number) => void
  onSetLaneNativeBpm: (laneIndex: number, nativeBPM: number | null) => void
  onPlacementDragStart: (placementId: string, event: React.DragEvent) => void
  onPlacementContextMenu: (info: {
    x: number; y: number; laneIndex: number; placementId: string; samplePath: string; sampleName: string
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
  selectedPlacementIds,
  missingSamplePaths,
  onToggleLaneMute,
  onToggleLaneSolo,
  onSetLanePan,
  onSetLaneNativeBpm,
  onPlacementDragStart,
  onPlacementContextMenu,
  onDragOver,
  onDrop,
  trackDragCleanup
}: LaneRowProps) {
  const [editingBpm, setEditingBpm] = useState(false)
  const [bpmDraft, setBpmDraft] = useState('')
  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => onDrop(lane.index, event),
    [onDrop, lane.index]
  )

  const commitBpm = useCallback(() => {
    const trimmed = bpmDraft.trim()
    if (trimmed === '') {
      onSetLaneNativeBpm(lane.index, null)
    } else {
      const value = Number(trimmed)
      if (Number.isFinite(value) && value > 0) {
        onSetLaneNativeBpm(lane.index, value)
      }
    }
    setEditingBpm(false)
  }, [bpmDraft, lane.index, onSetLaneNativeBpm])

  return (
    <div
      className={`tracker-lane${dimmed ? ' tracker-lane-dimmed' : ''}`}
      style={{ height: LANE_HEIGHT_PX }}
    >
      <div className="tracker-lane-head" style={{ width: LANE_HEAD_WIDTH_PX }}>
        <div className="tracker-lane-identity">
          <span className="tracker-lane-name">{lane.name}</span>
          {editingBpm ? (
            <input
              className="tracker-lane-bpm-input"
              type="number"
              min="1"
              step="0.1"
              value={bpmDraft}
              autoFocus
              aria-label={`Native BPM for ${lane.name}`}
              onChange={(event) => setBpmDraft(event.target.value)}
              onBlur={commitBpm}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  commitBpm()
                } else if (event.key === 'Escape') {
                  event.preventDefault()
                  setEditingBpm(false)
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="tracker-lane-bpm"
              aria-label={`Set native BPM for ${lane.name}`}
              title="Set the sample's native BPM; clear it for native-rate playback"
              onClick={() => {
                setBpmDraft(lane.nativeBPM?.toString() ?? '')
                setEditingBpm(true)
              }}
            >
              {lane.nativeBPM == null ? 'BPM --' : `${lane.nativeBPM} BPM`}
            </button>
          )}
        </div>
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
              // Ignore right/middle press — it must not start a pan scrub, or
              // it races the right-click cycle (AC-018) and audibly sweeps pan.
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
            onContextMenu={(e) => {
              e.preventDefault()
              onSetLanePan(lane.index, nextPanCycle(lane.pan))
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
        aria-label={`Lane ${lane.index + 1} placement area`}
      >
        <LaneSampleBubbleCanvas
          placements={lane.placements}
          totalTicks={totalTicks}
          laneIndex={lane.index}
          flashSamplePath={flashSamplePath}
          selectedPlacementIds={selectedPlacementIds}
          missingSamplePaths={missingSamplePaths}
          onPlacementDragStart={onPlacementDragStart}
          onPlacementContextMenu={onPlacementContextMenu}
        />
      </div>
    </div>
  )
}

// Memoized so the tracker's 10Hz playhead/meter updates skip re-rendering
// lanes whose props have not changed. Only re-renders when its own lane's
// state (placements, mute, solo, pan), selection, or flash target change.
export default memo(LaneRow)
