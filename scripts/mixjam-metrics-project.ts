import type { MeasurableProject } from '../src/shared/mixjam-metrics'
import type { ProjectDocument } from '../src/renderer/src/project/project-file'

/**
 * Convert the strict persistence model to the smaller audit model explicitly.
 * The persisted project uses `samplePath`; metrics use the format-neutral name
 * `sampleRef`. Keeping this at the CLI boundary prevents an unsafe JSON cast
 * from hiding future persistence changes.
 */
export function measurableProjectFromDocument(document: ProjectDocument): MeasurableProject {
  return {
    song: { bpm: document.song.bpm },
    lanes: document.lanes.map((lane) => ({
      name: lane.name,
      gain: lane.gain,
      pan: lane.pan,
      stereoPairId: lane.stereoPairId ?? null,
      sends: lane.sends,
      placements: lane.placements.map((placement) => ({
        sampleRef: placement.samplePath,
        startTick: placement.startTick,
        durationTicks: placement.durationTicks,
        nativeBPM: placement.nativeBPM
      }))
    })),
    fxBuses: document.fxBuses.map((bus) => ({
      module: { type: bus.module.type },
      returnLevel: bus.returnLevel
    }))
  }
}
