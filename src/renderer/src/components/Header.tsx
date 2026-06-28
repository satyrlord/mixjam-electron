import { THEME_OPTIONS } from '../theme/themes'

interface HeaderProps {
  view: 'home' | 'tracker'
  timer: string
  onHome: () => void
  onThemeChange: (themeKey: string) => string
}

export default function Header({ view, timer, onHome, onThemeChange }: HeaderProps) {
  return (
    <header className="header">
      <div className="header-left">
        {view === 'tracker' && (
          <button className="home-link" onClick={onHome}>
            &lt; Return to Main Menu
          </button>
        )}
        <span className="brand">MixJam Electron</span>
      </div>

      {view === 'tracker' && (
        <div className="header-timer">{timer}</div>
      )}

      <div className="header-right">
        <select
          className="theme-selector"
          aria-label="Theme"
          defaultValue="emerald"
          onChange={(event) => {
            event.currentTarget.value = onThemeChange(event.currentTarget.value)
          }}
        >
          {THEME_OPTIONS.map((theme) => (
            <option key={theme.key} value={theme.key}>{theme.name}</option>
          ))}
        </select>
      </div>
    </header>
  )
}
