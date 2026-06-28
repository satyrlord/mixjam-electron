import type { SampleBrowserItem } from '../../../shared/ipc'

export type FooterSampleDetail = Pick<SampleBrowserItem, 'name' | 'path' | 'metadata' | 'tags'>

export const DEFAULT_LANE_COUNT = 16
export const LANE_HEIGHT_PX = 44
export const LANE_HEAD_WIDTH_PX = 168
export const DEFAULT_CLIP_DURATION_TICKS = 32

export interface LaneClip {
  id: string
  samplePath: string
  sampleName: string
  startTick: number
  durationTicks: number
}

export interface LaneState {
  index: number
  name: string
  muted: boolean
  solo: boolean
  clips: LaneClip[]
}

export function createDefaultLanes(): LaneState[] {
  return Array.from({ length: DEFAULT_LANE_COUNT }, (_, index) => ({
    index,
    name: `Lane ${index + 1}`,
    muted: false,
    solo: false,
    clips: []
  }))
}

export function placeClipOnLane(
  lanes: LaneState[],
  laneIndex: number,
  samplePath: string,
  sampleName: string,
  startTick: number
): LaneState[] {
  return lanes.map((lane) => {
    if (lane.index !== laneIndex) return lane

    const clipId = `clip-${samplePath}-${startTick}-${Date.now()}`
    const newClip: LaneClip = {
      id: clipId,
      samplePath,
      sampleName,
      startTick,
      durationTicks: DEFAULT_CLIP_DURATION_TICKS
    }

    const newStart = startTick
    const newEnd = startTick + DEFAULT_CLIP_DURATION_TICKS

    // Carve the new clip's span out of every existing clip, preserving any
    // surviving head (before newStart) and tail (at/after newEnd) so that
    // partially overlapped clips are trimmed rather than dropped entirely.
    const trimmed: LaneClip[] = []
    for (const existing of lane.clips) {
      const existingEnd = existing.startTick + existing.durationTicks

      // No overlap: keep the clip untouched.
      if (existingEnd <= newStart || existing.startTick >= newEnd) {
        trimmed.push(existing)
        continue
      }

      // Surviving head: the portion before the new clip starts.
      if (existing.startTick < newStart) {
        trimmed.push({ ...existing, durationTicks: newStart - existing.startTick })
      }

      // Surviving tail: the portion at/after the new clip ends.
      if (existingEnd > newEnd) {
        trimmed.push({
          ...existing,
          id: `${existing.id}-tail`,
          startTick: newEnd,
          durationTicks: existingEnd - newEnd
        })
      }
    }

    return {
      ...lane,
      clips: sortClips([...trimmed, newClip])
    }
  })
}

function sortClips(clips: LaneClip[]): LaneClip[] {
  return [...clips].sort((a, b) => a.startTick - b.startTick)
}

export function toggleLaneMute(lanes: LaneState[], laneIndex: number): LaneState[] {
  return lanes.map((lane) =>
    lane.index === laneIndex ? { ...lane, muted: !lane.muted } : lane
  )
}

export function toggleLaneSolo(lanes: LaneState[], laneIndex: number): LaneState[] {
  const targetLane = lanes.find((lane) => lane.index === laneIndex)
  if (!targetLane) return lanes

  const willSolo = !targetLane.solo

  return lanes.map((lane) => {
    if (lane.index === laneIndex) {
      return { ...lane, solo: willSolo }
    }
    if (willSolo) {
      return { ...lane, solo: false }
    }
    return lane
  })
}

export function anyLaneSoloed(lanes: LaneState[]): boolean {
  return lanes.some((lane) => lane.solo)
}

export function laneShouldDim(lane: LaneState, anySoloed: boolean): boolean {
  if (lane.muted) return true
  if (anySoloed && !lane.solo) return true
  return false
}