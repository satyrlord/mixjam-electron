interface HomeScreenProps {
  onStart: () => void
  onLoad: () => void
}

export default function HomeScreen({ onStart, onLoad }: HomeScreenProps) {
  return (
    <div className="home-screen">
      <div className="home-actions">
        <button className="btn-primary" onClick={onStart}>
          Start New MixJam
        </button>
        <button className="link-secondary" onClick={onLoad}>
          Load MixJam
        </button>
      </div>
    </div>
  )
}
