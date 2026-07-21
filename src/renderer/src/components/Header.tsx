import { THEME_OPTIONS } from '../theme/themes'
import { formatTimer } from '../lib/formatTimer'
import { useStoreValue, type ReadableStore } from '../lib/value-store'

interface HeaderProps {
  view: 'home' | 'player'
  elapsedMsStore: ReadableStore<number>
  theme: string
  onHome: () => void
  onThemeChange: (themeKey: string) => void
}

// Leaf subscriber: the elapsed timer updates at 10 Hz while playing, so only
// this element re-renders per update, never the Header or the App tree.
function HeaderTimer({ elapsedMsStore }: { elapsedMsStore: ReadableStore<number> }) {
  const elapsedMs = useStoreValue(elapsedMsStore)
  return <div className="header-timer">{formatTimer(elapsedMs)}</div>
}

export default function Header({ view, elapsedMsStore, theme, onHome, onThemeChange }: HeaderProps) {
  return (
    <header className="header">
      <div className="header-left">
        {view === 'player' && (
          <button className="home-link" onClick={onHome}>
            &lt; Return to Main Menu
          </button>
        )}
        <span className="brand">MixJam Electron</span>
      </div>

      {view === 'player' && (
        <HeaderTimer elapsedMsStore={elapsedMsStore} />
      )}

      <div className="header-right">
        <span className="theme-swatch-dot" aria-hidden="true" />
        <select
          className="theme-selector"
          aria-label="Theme"
          value={theme}
          onChange={(event) => onThemeChange(event.currentTarget.value)}
        >
          {THEME_OPTIONS.map((theme) => (
            <option key={theme.key} value={theme.key}>{theme.name}</option>
          ))}
        </select>
      </div>
    </header>
  )
}
