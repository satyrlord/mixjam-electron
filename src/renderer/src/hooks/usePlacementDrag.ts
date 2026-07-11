import { useCallback, useState } from 'react'
import type { FooterSampleDetail, LaneState, PlacementGroupEntry } from '../lib/arrangement'
import { LANE_HEAD_WIDTH_PX, LANE_HEIGHT_PX, RULER_HEIGHT_PX, sampleBubbleScreenRect } from '../lib/arrangement'
import { clamp, nearestTick } from '../lib/sample-utils'
import { TICKS_PER_BEAT } from '../engine/transport'
import { safeJsonParse } from '../lib/safeJsonParse'

// ---------------------------------------------------------------------------
// Drag payload validators
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFooterSampleDetail(value: unknown): value is FooterSampleDetail {
  if (!isRecord(value)) return false
  return typeof value.name === 'string' &&
    typeof value.relpath === 'string' &&
    Array.isArray(value.tags) &&
    (value.duration === null || typeof value.duration === 'number') &&
    (value.slot === undefined || typeof value.slot === 'number')
}

interface PlacementDragPayload {
  placementId: string
  group?: Array<{ placementId: string; tickOffset: number; laneOffset: number }>
}

function isPlacementDragPayload(value: unknown): value is PlacementDragPayload {
  if (!isRecord(value) || typeof value.placementId !== 'string') return false
  if (value.group === undefined) return true
  return Array.isArray(value.group) && value.group.every((entry) =>
    isRecord(entry) &&
    typeof entry.placementId === 'string' &&
    typeof entry.tickOffset === 'number' &&
    typeof entry.laneOffset === 'number'
  )
}

// ---------------------------------------------------------------------------
// Hook parameters
// ---------------------------------------------------------------------------

export interface UsePlacementDragParams {
  lanes: LaneState[]
  totalTicks: number
  selectedPlacementIds: ReadonlySet<string>
  pixelsPerTick: number
  bubblePixelsPerSecond: number
  /** Called to clear the current placement selection. */
  onClearSelection: () => void
  /** Begin dragging a placement from the tracker. Called from LaneRow's onDragStart. */
  onPlacementDragStart?: (placementId: string, event: React.DragEvent) => void

  // Arrangement mutations
  onPlaceSampleDetailOnLane: (detail: FooterSampleDetail, laneIndex: number, tick: number) => void
  onMovePlacement: (placementId: string, toLaneIndex: number, newStartTick: number) => void
  onDuplicatePlacement: (placementId: string, toLaneIndex: number, newStartTick: number) => void
  onMovePlacementGroup: (entries: PlacementGroupEntry[]) => void
  onDuplicatePlacementGroup: (entries: PlacementGroupEntry[]) => void
}

export function usePlacementDrag(params: UsePlacementDragParams) {
  const {
    lanes, totalTicks, selectedPlacementIds,
    pixelsPerTick, bubblePixelsPerSecond,
    onClearSelection, onPlacementDragStart,
    onPlaceSampleDetailOnLane, onMovePlacement, onDuplicatePlacement,
    onMovePlacementGroup, onDuplicatePlacementGroup
  } = params

  const [selectionRect, setSelectionRect] = useState<{
    startX: number; startY: number; currentX: number; currentY: number
  } | null>(null)

  // ──────────────── Rectangle select ────────────────

  const handleLanesMouseDown = useCallback((
    e: React.MouseEvent<HTMLDivElement>,
    container: HTMLDivElement | null,
    setSelectedPlacementIds: React.Dispatch<React.SetStateAction<Set<string>>>
  ) => {
    if (!e.ctrlKey) {
      onClearSelection()
      return
    }
    if (!container) return
    const rect = container.getBoundingClientRect()
    const localX = e.clientX - rect.left
    const localY = e.clientY - rect.top
    if (localX < LANE_HEAD_WIDTH_PX || localY < RULER_HEIGHT_PX) return

    e.preventDefault()
    const startX = localX + container.scrollLeft
    const startY = localY + container.scrollTop
    setSelectionRect({ startX, startY, currentX: startX, currentY: startY })

    // Return cleanup function. The caller registers it with their drag-cleanup
    // tracker so PlayerView unmount tears it down.
    let active = true
    const onMove = (moveEvent: MouseEvent) => {
      if (!active || !container) return
      const cx = moveEvent.clientX - rect.left + container.scrollLeft
      const cy = moveEvent.clientY - rect.top + container.scrollTop
      setSelectionRect((prev) => prev ? { ...prev, currentX: cx, currentY: cy } : null)

      const x1 = Math.min(startX, cx) - LANE_HEAD_WIDTH_PX
      const x2 = Math.max(startX, cx) - LANE_HEAD_WIDTH_PX
      const y1 = Math.min(startY, cy) - RULER_HEIGHT_PX
      const y2 = Math.max(startY, cy) - RULER_HEIGHT_PX

      const minLane = Math.max(0, Math.floor(y1 / LANE_HEIGHT_PX))
      const maxLane = Math.min(lanes.length - 1, Math.floor(y2 / LANE_HEIGHT_PX))

      const ids = new Set<string>()
      for (let li = minLane; li <= maxLane; li++) {
        const lane = lanes[li]
        if (!lane) continue
        for (const placement of lane.placements) {
          const { x: bubbleX, width: bubbleWidth } = sampleBubbleScreenRect(
            placement,
            pixelsPerTick,
            bubblePixelsPerSecond
          )
          if (bubbleX + bubbleWidth > x1 && bubbleX < x2) {
            ids.add(placement.id)
          }
        }
      }
      setSelectedPlacementIds(ids)
    }

    const onUp = () => {
      if (!active) return
      active = false
      setSelectionRect(null)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return onUp
  }, [onClearSelection, lanes, pixelsPerTick, bubblePixelsPerSecond])

  // ──────────────── Sample drag start ────────────────

  const handleSampleDragStart = useCallback((event: React.DragEvent, detail: FooterSampleDetail) => {
    event.dataTransfer.setData('application/mixjam-sample', JSON.stringify(detail))
    event.dataTransfer.effectAllowed = 'copy'
  }, [])

  // ──────────────── Intra-tracker placement drag ────────────────

  const handlePlacementDragStart = useCallback((placementId: string, event: React.DragEvent) => {
    if (selectedPlacementIds.size > 1 && selectedPlacementIds.has(placementId)) {
      let anchorLaneIndex = 0
      let anchorStartTick = 0
      for (const lane of lanes) {
        const placement = lane.placements.find((c) => c.id === placementId)
        if (placement) { anchorLaneIndex = lane.index; anchorStartTick = placement.startTick; break }
      }
      const group: Array<{ placementId: string; tickOffset: number; laneOffset: number }> = []
      for (const lane of lanes) {
        for (const placement of lane.placements) {
          if (selectedPlacementIds.has(placement.id)) {
            group.push({
              placementId: placement.id,
              tickOffset: placement.startTick - anchorStartTick,
              laneOffset: lane.index - anchorLaneIndex
            })
          }
        }
      }
      event.dataTransfer.setData('application/mixjam-clip-placement', JSON.stringify({ placementId, group }))
    } else {
      event.dataTransfer.setData('application/mixjam-clip-placement', JSON.stringify({ placementId }))
    }
    event.dataTransfer.effectAllowed = 'copyMove'
    event.stopPropagation()

    // Also notify the parent so it can forward to LaneRow's own callers
    onPlacementDragStart?.(placementId, event)
  }, [selectedPlacementIds, lanes, onPlacementDragStart])

  // ──────────────── Drag-over / Drop on lane canvas ────────────────

  const handleLaneCanvasDragOver = useCallback((event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes('application/mixjam-sample') &&
        !event.dataTransfer.types.includes('application/mixjam-clip-placement')) return
    event.preventDefault()
    if (event.dataTransfer.types.includes('application/mixjam-clip-placement')) {
      event.dataTransfer.dropEffect = event.shiftKey ? 'copy' : 'move'
    } else {
      event.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const handleLaneCanvasDrop = useCallback((laneIndex: number, event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const snap = event.altKey ? 1 : TICKS_PER_BEAT
    const raw = event.dataTransfer.getData('application/mixjam-sample')
    if (raw) {
      const detail = safeJsonParse(raw, null, isFooterSampleDetail)
      if (detail) {
        const rect = event.currentTarget.getBoundingClientRect()
        const clickX = event.clientX - rect.left
        const tick = nearestTick(clickX, rect.width, totalTicks, snap)
        onPlaceSampleDetailOnLane(detail, laneIndex, tick)
      }
      return
    }
    // Intra-player placement move or duplicate
    const placementRaw = event.dataTransfer.getData('application/mixjam-clip-placement')
    if (placementRaw) {
      const parsed = safeJsonParse(placementRaw, null, isPlacementDragPayload)
      if (parsed) {
        const rect = event.currentTarget.getBoundingClientRect()
        const clickX = event.clientX - rect.left
        const anchorTick = nearestTick(clickX, rect.width, totalTicks, snap)

        if (parsed.group && parsed.group.length > 1) {
          const entries: PlacementGroupEntry[] = parsed.group.map((g) => ({
            placementId: g.placementId,
            toLaneIndex: clamp(laneIndex + g.laneOffset, 0, lanes.length - 1),
            newStartTick: clamp(anchorTick + g.tickOffset, 0, totalTicks - 1)
          }))
          const applyGroup = event.shiftKey
            ? onDuplicatePlacementGroup
            : onMovePlacementGroup
          applyGroup(entries)
          onClearSelection()
        } else {
          const applySingle = event.shiftKey
            ? onDuplicatePlacement
            : onMovePlacement
          applySingle(parsed.placementId, laneIndex, anchorTick)
          onClearSelection()
        }
      }
    }
  }, [lanes.length, totalTicks, onPlaceSampleDetailOnLane, onMovePlacement, onDuplicatePlacement,
    onMovePlacementGroup, onDuplicatePlacementGroup, onClearSelection])

  return {
    selectionRect,
    handleLanesMouseDown,
    handleSampleDragStart,
    handlePlacementDragStart,
    handleLaneCanvasDragOver,
    handleLaneCanvasDrop
  }
}
