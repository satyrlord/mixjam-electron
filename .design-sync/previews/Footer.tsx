import Footer from '../../src/renderer/src/components/Footer'

export function Home() {
  return (
    <Footer
      view="home"
      version="0.5.0"
      sampleDetail={null}
      onSelectFolder={() => {}}
      onOpenRepo={() => {}}
    />
  )
}

export function TrackerWithSelection() {
  return (
    <Footer
      view="tracker"
      version="0.5.0"
      sampleDetail={{
        name: 'kick_808.wav',
        filepath: 'C:/Samples/Drums/Kicks/kick_808.wav',
        tags: ['Punchy', 'Warm'],
        duration: 0.8
      }}
      onSelectFolder={() => {}}
      onOpenRepo={() => {}}
    />
  )
}
