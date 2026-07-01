import { useCallback, useEffect, useState, type ReactNode } from 'react'
import Header from '../src/renderer/src/components/Header'
import Footer from '../src/renderer/src/components/Footer'
import { selectTheme } from '../src/renderer/src/theme/themes'
import type { FooterSampleDetail } from '../src/renderer/src/lib/playerShell'

interface AppShellProps {
  /** The tracker/home body rendered between the header and footer. */
  children?: ReactNode
  /** Transport timer text shown centered in the header (tracker view). */
  timer?: string
  /** App version string shown in the footer. */
  version?: string
  /** Selected-sample detail shown in the footer (tracker view). */
  sampleDetail?: FooterSampleDetail | null
  /** Initial theme key; the header's selector switches it live thereafter. */
  initialTheme?: string
}

/**
 * The full MixJam application frame: `Header` (with its working theme selector)
 * + the body + `Footer`, wired exactly as `App.tsx` does — owning the active
 * theme in state and calling `selectTheme()` on change. Use this to preview a
 * whole window and switch every theme live from the in-header dropdown, rather
 * than one component in isolation.
 */
export function AppShell({
  children,
  timer = '00:00.0',
  version = '0.5.0',
  sampleDetail = null,
  initialTheme = 'emerald',
}: AppShellProps) {
  const [activeTheme, setActiveTheme] = useState(initialTheme)

  // Apply the initial theme to the DOM on mount. A plain (post-layout) effect,
  // not useLayoutEffect: the shared ThemeBootstrap provider (cfg.provider) wraps
  // this and applies the default theme in its own layout effect, which — since
  // React fires layout effects child-first — would run AFTER a useLayoutEffect
  // here and stomp the initial theme back to emerald. useEffect runs after all
  // layout effects, so this wins. (User-driven dropdown changes go through
  // handleThemeChange and are unaffected either way.)
  useEffect(() => {
    setActiveTheme(selectTheme(initialTheme))
  }, [initialTheme])

  const handleThemeChange = useCallback((requestedThemeKey: string) => {
    setActiveTheme(selectTheme(requestedThemeKey))
  }, [])

  return (
    <div className="app">
      <Header
        view="tracker"
        timer={timer}
        theme={activeTheme}
        onHome={() => {}}
        onThemeChange={handleThemeChange}
      />
      <main className="content">{children}</main>
      <Footer
        view="tracker"
        version={version}
        sampleDetail={sampleDetail}
        onSelectFolder={() => {}}
        onOpenRepo={() => {}}
      />
    </div>
  )
}
