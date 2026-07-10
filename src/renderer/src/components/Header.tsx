import { THEME_OPTIONS } from '../theme/themes'

interface HeaderProps {
  view: 'home' | 'player'
  timer: string
  theme: string
  onHome: () => void
  onThemeChange: (themeKey: string) => void
}

export default function Header({ view, timer, theme, onHome, onThemeChange }: HeaderProps) {
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
        <div className="header-timer">{timer}</div>
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
