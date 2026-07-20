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
        onOpenSettings={vi.fn()}
        onOpenRepo={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: '1.2.3' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Select User Folder' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Zoom Level' })).not.toBeInTheDocument()
  })

  it('fires onOpenSettings when the settings link is clicked', () => {
    const onOpenSettings = vi.fn()
    render(
      <Footer
        view="player"
        version="1.2.3"
        sampleDetail={null}
        onOpenSettings={onOpenSettings}
        onOpenRepo={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })

  it('fires onOpenRepo when the version is clicked', () => {
    const onOpenRepo = vi.fn()
    render(
      <Footer
        view="home"
        version="1.2.3"
        sampleDetail={null}
        onOpenSettings={vi.fn()}
        onOpenRepo={onOpenRepo}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: '1.2.3' }))
    expect(onOpenRepo).toHaveBeenCalledTimes(1)
  })

  it('renders selected sample details in the Player', () => {
    render(
      <Footer
        view="player"
        version="1.2.3"
        sampleDetail={{
          name: 'kick_808.wav',
          relpath: 'Drums/Kicks/kick_808.wav',
          tags: ['Drums', 'Kick'],
          bpm: null,
          duration: null
        }}
        onOpenSettings={vi.fn()}
        onOpenRepo={vi.fn()}
      />
    )

    expect(screen.getByText('kick_808.wav')).toBeInTheDocument()
    expect(screen.getByText('Drums/Kicks/kick_808.wav')).toBeInTheDocument()
    expect(screen.getByText('Drums, Kick')).toBeInTheDocument()
  })

  // AC-003b: center footer slot populated while left settings and right version remain visible
  it('AC-003b: sample detail populates center slot while settings and version remain visible', () => {
    render(
      <Footer
        view="player"
        version="1.2.3"
        sampleDetail={{
          name: 'snare.wav',
          relpath: 'Drums/snare.wav',
          tags: ['Percussion'],
          bpm: null,
          duration: 0.8
        }}
        onOpenSettings={vi.fn()}
        onOpenRepo={vi.fn()}
      />
    )

    expect(screen.getByText('snare.wav')).toBeInTheDocument()
    expect(screen.getByText('Drums/snare.wav')).toBeInTheDocument()
    expect(screen.getByText('Percussion')).toBeInTheDocument()

    // Left settings link still visible
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
    // Right version string still visible
    expect(screen.getByRole('button', { name: '1.2.3' })).toBeInTheDocument()
  })

  it('does not expose Settings outside the Player', () => {
    render(
      <Footer
        view="home"
        version="1.2.3"
        sampleDetail={null}
        onOpenSettings={vi.fn()}
        onOpenRepo={vi.fn()}
      />
    )

    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument()
  })
})
