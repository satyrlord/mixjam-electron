import Header from './components/Header'
import Footer from './components/Footer'
import HomeScreen from './components/HomeScreen'
import TrackerView from './components/TrackerView'
import { useAppState } from './hooks/useAppState'

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

  return (
    <div className="app">
      <Header view={view} timer={timerText} onHome={goToHome} />
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
