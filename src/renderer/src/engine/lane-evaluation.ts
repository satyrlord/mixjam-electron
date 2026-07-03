// Pure scheduling logic for lanes: given the set of lanes and a tick, decide
// which clips should trigger a voice. Respects mute, solo (solo overrides mute),
// and the monophonic rule (a lane plays at most one voice; a new trigger cuts
// off the previous one — handled by the caller via the per-lane voice it owns).
//
// Engine boundary: pure TypeScript. No React, no DOM, no Web Audio. This is the
// decision layer the scheduler consults; the engine performs the actual
// triggering.

export interface EngineClip {
  startTick: number
  durationTicks: number
  samplePath: string
}

export interface EngineLane {
  index: number
  muted: boolean
  solo: boolean
  /** Lane-level pan (-1..1), independent of channel pan. */
  pan: number
  channelIndex: number
  clips: EngineClip[]
}

export interface LaneTrigger {
  laneIndex: number
  channelIndex: number
  samplePath: string
  /** Lane-level pan value carried through to the per-lane panner node. */
  pan: number
  clip: EngineClip
}

// The mute/solo audibility policy is defined once here over the minimal
// { muted, solo } shape so both the engine (EngineLane) and the UI
// (LaneState, via playerShell) share a single source of truth.
export interface MuteSolo {
  muted: boolean
  solo: boolean
}

export function anyLaneSoloed(lanes: readonly MuteSolo[]): boolean {
  return lanes.some((lane) => lane.solo)
}

// A lane is audible when it is not muted, and — if any lane is soloed — when it
// is itself soloed. Solo overrides mute for soloed lanes.
export function laneIsAudible(lane: MuteSolo, soloActive: boolean): boolean {
  if (soloActive) return lane.solo
  return !lane.muted
}

// Returns the triggers that fire exactly at `tick`: a clip fires when the
// playhead reaches its start tick on an audible lane. Clips that merely span the
// tick are already sounding and are not re-triggered.
export function triggersForTick(lanes: readonly EngineLane[], tick: number): LaneTrigger[] {
  const soloActive = anyLaneSoloed(lanes)
  const triggers: LaneTrigger[] = []

  for (const lane of lanes) {
    if (!laneIsAudible(lane, soloActive)) continue
    for (const clip of lane.clips) {
      if (clip.startTick === tick) {
        triggers.push({
          laneIndex: lane.index,
          channelIndex: lane.channelIndex,
          samplePath: clip.samplePath,
          pan: lane.pan,
          clip
        })
      }
    }
  }

  return triggers
}
