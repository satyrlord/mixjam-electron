import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMasterBusMeters } from './useMasterBusMeters'
import type { MasterBusMeterSnapshot } from '../engine/masterbus/dsp/core'
import { emptyMasterMeterSnapshot, type MasterMeterSnapshot } from '../engine/master-meter'

function snapshot(overrides: Partial<MasterBusMeterSnapshot> = {}): MasterBusMeterSnapshot {
  return {
    vuDb: -18,
    peakL: false,
    peakR: true,
    compGrDb: 1.5,
    limGrDb: 0.5,
    latencySamples: 277,
    faultCount: 0,
    ...overrides,
  }
}

interface HarnessProps {
  active: boolean
  getSnapshot: () => MasterBusMeterSnapshot | null
  masterMeter: MasterMeterSnapshot
}

function Harness({ active, getSnapshot, masterMeter }: HarnessProps) {
  const { meters, onResetOver } = useMasterBusMeters(active, getSnapshot, masterMeter)
  return (
    <div>
      <output data-testid="vu">{meters.vuDb}</output>
      <output data-testid="comp">{meters.compGrDb}</output>
      <output data-testid="over">{String(meters.overLatched)}</output>
      <button type="button" onClick={onResetOver}>reset over</button>
    </div>
  )
}

describe('useMasterBusMeters', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('polls while active and freezes the last snapshot when the stream stalls', () => {
    let current: MasterBusMeterSnapshot | null = snapshot()
    const getSnapshot = vi.fn(() => current)
    render(<Harness active getSnapshot={getSnapshot} masterMeter={emptyMasterMeterSnapshot()} />)
    act(() => {
      vi.advanceTimersByTime(40)
    })
    expect(screen.getByTestId('vu').textContent).toBe('-18')
    expect(screen.getByTestId('comp').textContent).toBe('1.5')
    // Stream stalls: values freeze instead of showing garbage.
    current = null
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(screen.getByTestId('vu').textContent).toBe('-18')
  })

  it('does not poll while inactive', () => {
    const getSnapshot = vi.fn(() => snapshot())
    render(<Harness active={false} getSnapshot={getSnapshot} masterMeter={emptyMasterMeterSnapshot()} />)
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(getSnapshot).not.toHaveBeenCalled()
  })

  it('latches the OVER lamp above -1 dBTP and re-latches only on a new maximum', () => {
    const hot: MasterMeterSnapshot = { ...emptyMasterMeterSnapshot(), truePeakDbtp: -0.4 }
    const { rerender } = render(
      <Harness active getSnapshot={() => snapshot()} masterMeter={hot} />
    )
    expect(screen.getByTestId('over').textContent).toBe('true')
    act(() => {
      screen.getByRole('button', { name: 'reset over' }).click()
    })
    expect(screen.getByTestId('over').textContent).toBe('false')
    // Same running maximum: stays reset.
    rerender(<Harness active getSnapshot={() => snapshot()} masterMeter={{ ...hot }} />)
    expect(screen.getByTestId('over').textContent).toBe('false')
    // A new, higher true peak latches again.
    rerender(<Harness active getSnapshot={() => snapshot()} masterMeter={{ ...hot, truePeakDbtp: -0.1 }} />)
    expect(screen.getByTestId('over').textContent).toBe('true')
  })

  it('keeps the lamp dark at or below -1 dBTP and with no measurement', () => {
    render(
      <Harness
        active
        getSnapshot={() => null}
        masterMeter={{ ...emptyMasterMeterSnapshot(), truePeakDbtp: -1.2 }}
      />
    )
    expect(screen.getByTestId('over').textContent).toBe('false')
    expect(screen.getByTestId('vu').textContent).toBe('-100')
  })
})
