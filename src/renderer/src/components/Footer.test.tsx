import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Footer from './Footer'

describe('Footer', () => {
  it('renders the version string', () => {
    render(
      <Footer
        view="home"
        version="1.2.3"
        sampleDetail={null}
        onSelectFolder={vi.fn()}
        onOpenRepo={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: '1.2.3' })).toBeInTheDocument()
  })

  it('fires onSelectFolder when the settings link is clicked', () => {
    const onSelectFolder = vi.fn()
    render(
      <Footer
        view="home"
        version="1.2.3"
        sampleDetail={null}
        onSelectFolder={onSelectFolder}
        onOpenRepo={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Select settings folder' }))
    expect(onSelectFolder).toHaveBeenCalledTimes(1)
  })

  it('fires onOpenRepo when the version is clicked', () => {
    const onOpenRepo = vi.fn()
    render(
      <Footer
        view="home"
        version="1.2.3"
        sampleDetail={null}
        onSelectFolder={vi.fn()}
        onOpenRepo={onOpenRepo}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: '1.2.3' }))
    expect(onOpenRepo).toHaveBeenCalledTimes(1)
  })

  it('renders selected sample details in tracker view', () => {
    render(
      <Footer
        view="tracker"
        version="1.2.3"
        sampleDetail={{
          name: 'kick_808.wav',
          filepath: 'C:/Samples/Drums/Kicks/kick_808.wav',
          tags: ['Drums', 'Kick'],
          duration: null
        }}
        onSelectFolder={vi.fn()}
        onOpenRepo={vi.fn()}
      />
    )

    expect(screen.getByText('kick_808.wav')).toBeInTheDocument()
    expect(screen.getByText('C:/Samples/Drums/Kicks/kick_808.wav')).toBeInTheDocument()
    expect(screen.getByText('Drums, Kick')).toBeInTheDocument()
  })
})
