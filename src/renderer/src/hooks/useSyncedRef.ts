import { useEffect, useRef } from 'react'

/** Keeps a ref in sync with a value so callbacks and effects always read the
 *  latest version without re-subscribing. Replaces the repeated pattern:
 *
 *    const ref = useRef(value)
 *    useEffect(() => { ref.current = value }, [value])
 */
export function useSyncedRef<T>(value: T): React.MutableRefObject<T> {
  const ref = useRef(value)
  useEffect(() => {
    ref.current = value
  }, [value])
  return ref
}
