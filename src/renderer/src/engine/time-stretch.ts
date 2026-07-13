import { tickDurationSeconds } from './transport'

/** Playback-rate multiplier for an unplaced sample preview with known BPM. */
export function stretchRatio(
  nativeBpm: number | null | undefined,
  projectBpm: number
): number | null {
  if (nativeBpm == null) return null
  if (!Number.isFinite(nativeBpm) || nativeBpm <= 0) {
    throw new RangeError('Native BPM must be a positive finite number')
  }
  if (!Number.isFinite(projectBpm) || projectBpm <= 0) {
    throw new RangeError('Project BPM must be a positive finite number')
  }
  return projectBpm / nativeBpm
}

/** Playback-rate multiplier that makes source audio fill a placement span. */
export function stretchRatioForDuration(
  sourceDurationSeconds: number,
  durationTicks: number,
  projectBpm: number
): number {
  if (!Number.isFinite(sourceDurationSeconds) || sourceDurationSeconds <= 0) {
    throw new RangeError('Source duration must be a positive finite number')
  }
  if (!Number.isFinite(durationTicks) || durationTicks <= 0) {
    throw new RangeError('Placement duration must be a positive finite tick count')
  }
  const targetDurationSeconds = durationTicks * tickDurationSeconds(projectBpm)
  return sourceDurationSeconds / targetDurationSeconds
}
