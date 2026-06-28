import Header from './components/Header'
import Footer from './components/Footer'
import HomeScreen from './components/HomeScreen'
import TrackerView from './components/TrackerView'
import { useAppState } from './hooks/useAppState'
import { selectTheme } from './theme/themes'

export default function App() {
  const {
    view,
    version,
    timerText,
    goToTracker,
    goToHome,
    handleLoadMixJam,
    openSettingsFolder,
    openRepo
  } = useAppState(window.electronAPI)

  // Theme is bootstrap-applied synchronously in main.tsx before React mounts
  // (spec-002 AC-001). Only Emerald is implemented; all selections collapse to
  // the default per AC-006.

  const handleThemeChange = (requestedThemeKey: string) => {
    return selectTheme(requestedThemeKey)
  }

  return (
    <div className="app">
      <Header
        view={view}
        timer={timerText}
        onHome={goToHome}
        onThemeChange={handleThemeChange}
      />
      <main className="content">
        {view === 'home' ? (
          <HomeScreen onStart={goToTracker} onLoad={handleLoadMixJam} />
        ) : (
          <TrackerView />
        )}
      </main>
      <Footer version={version} onSelectFolder={openSettingsFolder} onOpenRepo={openRepo} />
    </div>
  )
}
