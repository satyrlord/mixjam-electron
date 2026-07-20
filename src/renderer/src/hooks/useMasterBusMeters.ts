// Live meter feed for the Master Bus Strip (spec-012 Metering and UI
// Data). Polls the worklet's snapshot at the strip's 30 Hz publish cadence
// while the Master tab is active. If the stream stalls (engine gone or
// worklet failed), the last values freeze — meters never show garbage.
// Also owns the OVER lamp latch: the loudness meter's maximum true peak is
// a running maximum, so the latch compares it against the level recorded
// at the last reset.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { MasterBusMeterSnapshot } from '../engine/masterbus/dsp/core'
import type { MasterMeterSnapshot } from '../engine/master-meter'
import type { MasterBusUiMeters } from '../components/MasterBusStrip'

const POLL_INTERVAL_MS = 33
const OVER_THRESHOLD_DBTP = -1

const IDLE_METERS: MasterBusUiMeters = {
  vuDb: -100,
  peakL: false,
  peakR: false,
  compGrDb: 0,
  limGrDb: 0,
  momentaryLufs: null,
  integratedLufs: null,
  truePeakDbtp: null,
  overLatched: false,
}

export interface MasterBusMetersResult {
  meters: MasterBusUiMeters
  onResetOver: () => void
}

export function useMasterBusMeters(
  active: boolean,
  getSnapshot: () => MasterBusMeterSnapshot | null,
  masterMeter: MasterMeterSnapshot
): MasterBusMetersResult {
  const [chainMeters, setChainMeters] = useState<MasterBusMeterSnapshot | null>(null)
  const lastSnapshotRef = useRef<MasterBusMeterSnapshot | null>(null)
  // True peak level already acknowledged by an OVER lamp reset.
  const [overResetFloor, setOverResetFloor] = useState(Number.NEGATIVE_INFINITY)

  useEffect(() => {
    if (!active) return
    const poll = (): void => {
      const snapshot = getSnapshot()
      if (snapshot && snapshot !== lastSnapshotRef.current) {
        lastSnapshotRef.current = snapshot
        setChainMeters(snapshot)
      }
    }
    poll()
    const interval = window.setInterval(poll, POLL_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [active, getSnapshot])

  const tp = masterMeter.truePeakDbtp
  const overLatched = tp !== null && tp > OVER_THRESHOLD_DBTP && tp > overResetFloor

  const onResetOver = useCallback(() => {
    setOverResetFloor(tp ?? Number.NEGATIVE_INFINITY)
  }, [tp])

  const meters: MasterBusUiMeters = chainMeters
    ? {
        vuDb: chainMeters.vuDb,
        peakL: chainMeters.peakL,
        peakR: chainMeters.peakR,
        compGrDb: chainMeters.compGrDb,
        limGrDb: chainMeters.limGrDb,
        momentaryLufs: masterMeter.momentaryLufs,
        integratedLufs: masterMeter.integratedLufs,
        truePeakDbtp: tp,
        overLatched,
      }
    : { ...IDLE_METERS, momentaryLufs: masterMeter.momentaryLufs, integratedLufs: masterMeter.integratedLufs, truePeakDbtp: tp, overLatched }

  return { meters, onResetOver }
}
