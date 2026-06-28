// TODO(spec-002): source the theme list from the canonical theming module
// instead of this presentational constant once theme switching lands.
const THEMES = [
  'Emerald',
  'Flat Studio',
  'Neon Rave',
  'Warm Analog',
  'IDE',
  'Rust Industrial',
  'Screen Maximal',
  'Club PA'
]

interface HeaderProps {
  view: 'home' | 'tracker'
  timer: string
  onHome: () => void
}

export default function Header({ view, timer, onHome }: HeaderProps) {
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
        <select className="theme-selector" aria-label="Theme" defaultValue="Emerald">
          {THEMES.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>
    </header>
  )
}
