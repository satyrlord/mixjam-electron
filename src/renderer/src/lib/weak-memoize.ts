/** Caches the result of a single object-keyed computation in a WeakMap.
 *
 * Useful for hot paths that transform immutable values (e.g. lane arrays)
 * because the weak keys let the cache entries be collected when the source
 * value is no longer referenced anywhere else. */
export function weakMemoize1<K extends object, V>(
  compute: (key: K) => V
): (key: K) => V {
  const cache = new WeakMap<K, { value: V }>()
  return (key: K): V => {
    const entry = cache.get(key)
    if (entry) return entry.value
    const value = compute(key)
    cache.set(key, { value })
    return value
  }
}
