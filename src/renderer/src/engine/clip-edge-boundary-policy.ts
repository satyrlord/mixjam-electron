interface BoundaryPlacement {
  startTick: number
  durationTicks: number
  samplePath: string
}

export interface ClipEdgeBoundaryTrigger {
  laneIndex: number
  placement: BoundaryPlacement
  nextPlacement?: BoundaryPlacement
  fadeInAtStart: boolean
  fadeOutAtEnd: boolean
}

export interface ClipEdgeBoundaryObservation {
  previousVoicePlaying: boolean
  nextPlacementReady: boolean
}

export interface ClipEdgeBoundaryDecision {
  fadeInEnabled: boolean
  fadeOutEnabled: boolean
}

function boundaryKey(laneIndex: number, placement: BoundaryPlacement): string {
  return `${laneIndex}:${placement.startTick}:${placement.durationTicks}:${placement.samplePath}`
}

/**
 * Resolves runtime-only silence at touching placement boundaries. Geometric
 * silence remains owned by lane evaluation; this state only tracks boundaries
 * made silent by unavailable samples or invalid resumed source offsets.
 */
export class ClipEdgeBoundaryPolicy {
  private readonly forcedFadeIns = new Set<string>()

  reset(): void {
    this.forcedFadeIns.clear()
  }

  decide(
    trigger: ClipEdgeBoundaryTrigger,
    observation: ClipEdgeBoundaryObservation
  ): ClipEdgeBoundaryDecision {
    const currentKey = boundaryKey(trigger.laneIndex, trigger.placement)
    const forcedFadeIn = this.forcedFadeIns.delete(currentKey)
    let fadeOutEnabled = trigger.fadeOutAtEnd

    if (!fadeOutEnabled && trigger.nextPlacement) {
      const nextKey = boundaryKey(trigger.laneIndex, trigger.nextPlacement)
      if (observation.nextPlacementReady) {
        this.forcedFadeIns.delete(nextKey)
      } else {
        fadeOutEnabled = true
        this.forcedFadeIns.add(nextKey)
      }
    }

    return {
      fadeInEnabled: trigger.fadeInAtStart ||
        !observation.previousVoicePlaying ||
        forcedFadeIn,
      fadeOutEnabled
    }
  }

  markPlacementSilent(trigger: ClipEdgeBoundaryTrigger): void {
    this.forcedFadeIns.delete(boundaryKey(trigger.laneIndex, trigger.placement))
    if (trigger.nextPlacement) {
      this.forcedFadeIns.add(boundaryKey(trigger.laneIndex, trigger.nextPlacement))
    }
  }
}
