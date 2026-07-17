import { describe, expect, it } from 'vitest'
import { ClipEdgeBoundaryPolicy, type ClipEdgeBoundaryTrigger } from './clip-edge-boundary-policy'

function trigger(startTick: number, nextStartTick?: number): ClipEdgeBoundaryTrigger {
  return {
    laneIndex: 0,
    placement: {
      startTick,
      durationTicks: 8,
      samplePath: `${startTick}.wav`
    },
    ...(nextStartTick === undefined
      ? {}
      : {
          nextPlacement: {
            startTick: nextStartTick,
            durationTicks: 8,
            samplePath: `${nextStartTick}.wav`
          }
        }),
    fadeInAtStart: startTick === 0,
    fadeOutAtEnd: nextStartTick === undefined
  }
}

describe('ClipEdgeBoundaryPolicy', () => {
  it('keeps a touching ready boundary continuous', () => {
    const policy = new ClipEdgeBoundaryPolicy()

    expect(policy.decide(trigger(0, 8), {
      previousVoicePlaying: true,
      nextPlacementReady: true
    })).toEqual({
      fadeInEnabled: true,
      fadeOutEnabled: false
    })
    expect(policy.decide(trigger(8), {
      previousVoicePlaying: true,
      nextPlacementReady: false
    })).toEqual({
      fadeInEnabled: false,
      fadeOutEnabled: true
    })
  })

  it('fades both sides of a touching unavailable placement', () => {
    const policy = new ClipEdgeBoundaryPolicy()

    expect(policy.decide(trigger(0, 8), {
      previousVoicePlaying: true,
      nextPlacementReady: false
    })).toEqual({
      fadeInEnabled: true,
      fadeOutEnabled: true
    })
    expect(policy.decide(trigger(8), {
      previousVoicePlaying: true,
      nextPlacementReady: false
    })).toEqual({
      fadeInEnabled: true,
      fadeOutEnabled: true
    })
  })

  it('propagates silence across consecutive failed placements', () => {
    const policy = new ClipEdgeBoundaryPolicy()

    policy.markPlacementSilent(trigger(8, 16))
    policy.markPlacementSilent(trigger(16, 24))

    expect(policy.decide(trigger(24), {
      previousVoicePlaying: true,
      nextPlacementReady: false
    })).toEqual({
      fadeInEnabled: true,
      fadeOutEnabled: true
    })
  })

  it('drops pending boundary state when playback restarts', () => {
    const policy = new ClipEdgeBoundaryPolicy()
    policy.markPlacementSilent(trigger(8, 16))

    policy.reset()

    expect(policy.decide(trigger(16), {
      previousVoicePlaying: true,
      nextPlacementReady: false
    })).toEqual({
      fadeInEnabled: false,
      fadeOutEnabled: true
    })
  })
})
