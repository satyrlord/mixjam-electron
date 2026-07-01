import { useLayoutEffect, type ReactNode } from 'react'
import { bootstrapTheme, selectTheme, type ThemeKey } from '../src/renderer/src/theme/themes'

interface ThemeBootstrapProps {
  themeKey?: ThemeKey
  children?: ReactNode
}

/**
 * Preview-only wrapper: MixJam themes are applied as CSS custom properties on
 * `document.documentElement` at runtime (see theme/themes.ts), not through a
 * React context/provider — and `body` stays `visibility: hidden` until that
 * bootstrap runs. This component reproduces that bootstrap so previews render
 * themed and visible, exactly as the real app does on load.
 */
export function ThemeBootstrap({ themeKey, children }: ThemeBootstrapProps) {
  useLayoutEffect(() => {
    if (themeKey) selectTheme(themeKey)
    else bootstrapTheme()
  }, [themeKey])

  return <>{children}</>
}
