// Minimal external value store for high-frequency playback telemetry
// (playhead tick, elapsed time, meter snapshots). Values that change at
// 10-60 Hz must not live in App-level React state: one setState there
// re-renders the whole tree on every tick. A ValueStore lets the engine
// write at any rate while only the leaf components that subscribe
// (via useStoreValue) re-render.

import { useSyncExternalStore } from 'react'

/** Read side of a store: current value plus change subscription. */
export interface ReadableStore<T> {
  get(): T
  subscribe(listener: () => void): () => void
}

/** Full store handle owned by whoever writes the value. */
export interface ValueStore<T> extends ReadableStore<T> {
  set(value: T): void
}

export function createValueStore<T>(initial: T): ValueStore<T> {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set: (next: T) => {
      if (Object.is(value, next)) return
      value = next
      for (const listener of listeners) listener()
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}

/**
 * Read-only view of a store through a selector. `get()` recomputes only
 * when the source value changed and keeps the previous result when the
 * selection is equal, so useSyncExternalStore subscribers skip re-renders
 * for irrelevant source changes.
 */
export function deriveStore<T, S>(
  source: ReadableStore<T>,
  selector: (value: T) => S,
  isEqual: (a: S, b: S) => boolean = Object.is
): ReadableStore<S> {
  let lastSource = source.get()
  let lastValue = selector(lastSource)
  return {
    get: () => {
      const current = source.get()
      if (!Object.is(current, lastSource)) {
        lastSource = current
        const next = selector(current)
        if (!isEqual(lastValue, next)) lastValue = next
      }
      return lastValue
    },
    subscribe: source.subscribe
  }
}

/** Subscribes a component to a store; re-renders only when `get()` changes. */
export function useStoreValue<T>(store: ReadableStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get)
}

