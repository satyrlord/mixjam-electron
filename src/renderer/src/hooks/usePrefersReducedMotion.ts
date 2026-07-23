import { useEffect, useState } from 'react'

/**
 * Tracks the `prefers-reduced-motion: reduce` media query, updating when the
 * user's OS setting changes. Returns `false` in environments without
 * `window.matchMedia` (SSR, minimal test DOM). Shared by the FX editors, whose
 * visualizers pause their animation when motion is reduced.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  )
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const listener = () => setReduced(query.matches)
    query.addEventListener('change', listener)
    return () => query.removeEventListener('change', listener)
  }, [])
  return reduced
}
