// Live meter feed for the Master Bus Strip (spec-012 Metering and UI Data).
// Publishes into a value store, not React state: the worklet's 30 Hz chain
// snapshot and the 10 Hz loudness update re-render only the meter leaves that
// subscribe (the VU needle, the LUFS/TP bars, the two GR rows), never the whole
// 13-module rack. Polls the worklet at the strip's publish cadence while the
// Master tab is active; while hidden it stops polling and stops republishing so
// the rack costs nothing off-screen. The last published values freeze on stall.
//
// The OVER lamp latch lives here: the loudness meter's maximum true peak is a
// running maximum, so the latch compares it against the level recorded at the
// last reset. The floor and the last published value persist across tab
// switches (refs and the store both survive the panel staying mounted), so the
// latch survives a switch even though republishing pauses while hidden.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { MasterBusMeterSnapshot } from '../engine/masterbus/dsp/core'
import type { MasterMeterSnapshot } from '../engine/master-meter'
import type { MasterBusUiMeters } from '../components/MasterBusStrip'
import { createValueStore, type ReadableStore } from '../lib/value-store'

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
  /** Live UI meters. Leaf components subscribe through this store so a meter
   *  frame never re-renders the rack shell. */
  metersStore: ReadableStore<MasterBusUiMeters>
  onResetOver: () => void
}

export function useMasterBusMeters(
  active: boolean,
  getSnapshot: () => MasterBusMeterSnapshot | null,
  masterMeterStore: ReadableStore<MasterMeterSnapshot>
): MasterBusMetersResult {
  const [metersStore] = useState(() => createValueStore<MasterBusUiMeters>(IDLE_METERS))
  const lastChainRef = useRef<MasterBusMeterSnapshot | null>(null)
  // True peak level already acknowledged by an OVER lamp reset. A ref, not
  // state: a reset republishes the store rather than re-rendering the panel.
  const overResetFloorRef = useRef(Number.NEGATIVE_INFINITY)

  const publish = useCallback(() => {
    const chain = lastChainRef.current
    const loudness = masterMeterStore.get()
    const tp = loudness.truePeakDbtp
    const overLatched = tp !== null && tp > OVER_THRESHOLD_DBTP && tp > overResetFloorRef.current
    metersStore.set({
      vuDb: chain ? chain.vuDb : IDLE_METERS.vuDb,
      peakL: chain ? chain.peakL : false,
      peakR: chain ? chain.peakR : false,
      compGrDb: chain ? chain.compGrDb : 0,
      limGrDb: chain ? chain.limGrDb : 0,
      momentaryLufs: loudness.momentaryLufs,
      integratedLufs: loudness.integratedLufs,
      truePeakDbtp: tp,
      overLatched,
    })
  }, [masterMeterStore, metersStore])

  // Chain snapshot poll: only while the strip is watched. On stall (engine gone
  // or worklet failed) the last snapshot stays put, so meters freeze rather than
  // showing garbage.
  useEffect(() => {
    if (!active) return
    const poll = (): void => {
      const snapshot = getSnapshot()
      if (snapshot && snapshot !== lastChainRef.current) {
        lastChainRef.current = snapshot
        publish()
      }
    }
    poll()
    const interval = window.setInterval(poll, POLL_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [active, getSnapshot, publish])

  // Loudness + latch: republish on every loudness frame while active. The
  // engine's true peak keeps climbing as a running maximum even while the tab is
  // hidden, so the first publish after re-activation reflects any peak that
  // happened off-screen and latches OVER correctly.
  useEffect(() => {
    if (!active) return
    publish()
    return masterMeterStore.subscribe(publish)
  }, [active, masterMeterStore, publish])

  const onResetOver = useCallback(() => {
    overResetFloorRef.current = masterMeterStore.get().truePeakDbtp ?? Number.NEGATIVE_INFINITY
    publish()
  }, [masterMeterStore, publish])

  return { metersStore, onResetOver }
}
