// The store that carries high-frequency playback telemetry (ticks, meter
// frames) outside React state. Correctness here is what keeps a 10-60 Hz
// write from re-rendering anything that did not subscribe.

import { describe, expect, it, vi } from 'vitest'
import { createValueStore, deriveStore } from './value-store'

describe('createValueStore', () => {
  it('holds the value and notifies subscribers on change', () => {
    const store = createValueStore(1)
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    store.set(2)
    expect(store.get()).toBe(2)
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    store.set(3)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('skips notification when the value is identical', () => {
    const store = createValueStore(5)
    const listener = vi.fn()
    store.subscribe(listener)
    store.set(5)
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('deriveStore', () => {
  it('keeps the previous selection when the source change is irrelevant', () => {
    const source = createValueStore({ levels: new Map([[0, -20], [1, -30]]) })
    const view = deriveStore(
      source,
      (frame) => ({ db: frame.levels.get(0) ?? -100 }),
      (a, b) => a.db === b.db
    )
    const first = view.get()
    expect(first.db).toBe(-20)
    // Channel 1 changed; channel 0 did not. The selected object is reused so
    // useSyncExternalStore subscribers bail out of re-rendering.
    source.set({ levels: new Map([[0, -20], [1, -12]]) })
    expect(view.get()).toBe(first)
    source.set({ levels: new Map([[0, -6], [1, -12]]) })
    expect(view.get()).toEqual({ db: -6 })
  })
})
