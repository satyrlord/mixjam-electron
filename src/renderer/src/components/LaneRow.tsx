import { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
  LANE_HEAD_WIDTH_PX,
  LANE_HEIGHT_PX,
  type LaneState
} from '../lib/arrangement'
import { nextPanCycle } from '../lib/sample-utils'
import LaneSampleBubbleCanvas from './LaneSampleBubbleCanvas'
import { RotaryControl } from './RotaryField'
import { Tooltip } from './ui/Tooltip'

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
  renaming: boolean
  onLaneContextMenu: (laneIndex: number, laneName: string) => void
  onCommitLaneName: (laneIndex: number, name: string) => void
  onCancelLaneRename: () => void
  onPlacementDragStart: (placementId: string, event: React.DragEvent) => void
  onPlacementContextMenu: (info: {
    x: number; y: number; laneIndex: number; placementId: string; samplePath: string; sampleName: string
  }) => void
  onDragOver: (event: React.DragEvent) => void
  onDrop: (laneIndex: number, event: React.DragEvent<HTMLDivElement>) => void
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
  renaming,
  onLaneContextMenu,
  onCommitLaneName,
  onCancelLaneRename,
  onPlacementDragStart,
  onPlacementContextMenu,
  onDragOver,
  onDrop
}: LaneRowProps) {
  const [renameValue, setRenameValue] = useState(lane.name)
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!renaming) return
    setRenameValue(lane.name)
    const frame = requestAnimationFrame(() => renameInputRef.current?.select())
    return () => cancelAnimationFrame(frame)
  }, [lane.name, renaming])

  const commitRename = useCallback(() => {
    const nextName = renameValue.trim()
    if (nextName) onCommitLaneName(lane.index, nextName)
    else onCancelLaneRename()
  }, [lane.index, onCancelLaneRename, onCommitLaneName, renameValue])

  const hasMissingSample = lane.placements.some((placement) =>
    missingSamplePaths.has(placement.samplePath)
  )
  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => onDrop(lane.index, event),
    [onDrop, lane.index]
  )

  return (
    <div
      className={`tracker-lane${dimmed ? ' tracker-lane-dimmed' : ''}`}
      style={{ height: LANE_HEIGHT_PX }}
    >
      <div
        className="tracker-lane-head"
        style={{ width: LANE_HEAD_WIDTH_PX }}
        onContextMenu={(event) => {
          if (event.defaultPrevented) return
          onLaneContextMenu(lane.index, lane.name)
        }}
      >
        {renaming ? (
          <input
            ref={renameInputRef}
            className="tracker-lane-name-input"
            aria-label={`Rename ${lane.name}`}
            value={renameValue}
            onChange={(event) => setRenameValue(event.currentTarget.value)}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitRename()
              } else if (event.key === 'Escape') {
                event.preventDefault()
                onCancelLaneRename()
              }
            }}
          />
        ) : (
          <span className="tracker-lane-name">{lane.name}</span>
        )}
        {hasMissingSample && (
          <Tooltip content="This lane references a missing sample"><span
            className="tracker-lane-missing"
            role="img"
            aria-label={`${lane.name} contains a missing sample`}
          >!</span></Tooltip>
        )}
        <div className="tracker-lane-controls">
          <Tooltip content={lane.muted ? 'Unmute lane' : 'Mute lane'}><button
            type="button"
            className={`tracker-lane-mute${lane.muted ? ' tracker-lane-mute-active' : ''}`}
            aria-label={`Mute ${lane.name}`}
            onClick={() => onToggleLaneMute(lane.index)}
          >M</button></Tooltip>
          <Tooltip content={lane.solo ? 'Unsolo lane' : 'Solo lane'}><button
            type="button"
            className={`tracker-lane-solo${lane.solo ? ' tracker-lane-solo-active' : ''}`}
            aria-label={`Solo ${lane.name}`}
            onClick={() => onToggleLaneSolo(lane.index)}
          >S</button></Tooltip>
          <RotaryControl
            className="tracker-lane-pan"
            label={`Pan ${lane.name}`}
            value={lane.pan}
            min={-1}
            max={1}
            step={0.05}
            valueText={lane.pan === 0 ? 'Center' : `${Math.round(Math.abs(lane.pan) * 100)}% ${lane.pan < 0 ? 'left' : 'right'}`}
            defaultValue={0}
            homeValue={0}
            dragAxis="horizontal"
            ariaMultiplier={100}
            style={{ '--pan-angle': `${lane.pan * 135}deg` } as React.CSSProperties}
            onChange={(value) => onSetLanePan(lane.index, value)}
            onContextMenu={(event) => {
              event.preventDefault()
              onSetLanePan(lane.index, nextPanCycle(lane.pan))
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
