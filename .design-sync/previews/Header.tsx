import { useEffect, type ReactNode } from 'react'
import Header from '../../src/renderer/src/components/Header'
import { selectTheme, type ThemeKey } from '../../src/renderer/src/theme/themes'

// .header-timer is absolutely centered against .header's own width
// (left: 50%), which spans the full app window in the real app. A bare
// preview card sizes .header to its content's natural width, so the timer
// centers over a much narrower box and collides with the brand/nav text.
// Give it the app's real width so the centering lands where it actually does.
function AppShellHost({ children }: { children: ReactNode }) {
  return <div style={{ width: 1280 }}>{children}</div>
}

// Overrides the shared ThemeBootstrap provider's default theme for this one
// story — proves the 8 generated theme token blocks (see
// generate-theme-tokens.mjs) actually apply, not just exist in the CSS.
// Must be a plain (post-layout) effect: ThemeBootstrap (the outer cfg.provider
// wrapping every card) runs its own useLayoutEffect too, and React fires
// layout effects child-first — so a useLayoutEffect here would still run
// BEFORE the parent ThemeBootstrap's, which then stomps it back to emerald.
// useEffect guarantees this runs after every layout effect completes.
function Themed({ themeKey, children }: { themeKey: ThemeKey; children: ReactNode }) {
  useEffect(() => {
    selectTheme(themeKey)
  }, [themeKey])
  return <>{children}</>
}

export function Home() {
  return (
    <AppShellHost>
      <Header
        view="home"
        timer="00:00.0"
        theme="emerald"
        onHome={() => {}}
        onThemeChange={() => {}}
      />
    </AppShellHost>
  )
}

export function Tracker() {
  return (
    <AppShellHost>
      <Header
        view="tracker"
        timer="01:23.4"
        theme="emerald"
        onHome={() => {}}
        onThemeChange={() => {}}
      />
    </AppShellHost>
  )
}

export function NeonRaveTheme() {
  return (
    <AppShellHost>
      <Themed themeKey="rave">
        <Header
          view="tracker"
          timer="01:23.4"
          theme="rave"
          onHome={() => {}}
          onThemeChange={() => {}}
        />
      </Themed>
    </AppShellHost>
  )
}
