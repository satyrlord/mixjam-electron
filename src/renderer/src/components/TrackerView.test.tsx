import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TrackerView from './TrackerView'
import type { RecentProjectItem, SampleBrowserItem } from '../../../shared/ipc'
import type { LaneState } from '../lib/playerShell'

const RECENT_PROJECTS: RecentProjectItem[] = [
  {
    path: 'c:/users/test/mixjam/club-night.mixjam',
    displayName: 'club-night',
    lastOpened: '2026-06-28T12:00:00.000Z'
  }
]

const SAMPLE_ROWS: SampleBrowserItem[] = [
  {
    id: 'kick-808',
    name: 'kick_808.wav',
    path: 'Drums/Kicks/kick_808.wav',
    category: 'Drums',
    duration: '--',
    metadata: ['44.1 kHz', 'Stereo', '52.0 KB'],
    tags: ['Drums', 'Kick', '808']
  }
]

const LANES: LaneState[] = Array.from({ length: 16 }, (_, index) => ({
  index,
  name: `Lane ${index + 1}`,
  muted: false,
  solo: false,
  clips: []
}))

const noop = () => undefined

function renderTracker(props: Partial<Parameters<typeof TrackerView>[0]> = {}) {
  return render(
    <TrackerView
      recentProjects={[]}
      sampleRows={[]}
      sampleSearchQuery=""
      sampleBrowserLoading={false}
      sampleBrowserError={null}
      selectedSamplePath={null}
      lanes={LANES}
      laneShouldDim={() => false}
      transportState="stopped"
      onSelectSampleDetail={noop}
      onSampleSearchChange={noop}
      onSampleRescan={noop}
      onPlaceSampleOnLane={noop}
      onToggleLaneMute={noop}
      onToggleLaneSolo={noop}
      onTransportPlay={noop}
      onTransportPause={noop}
      onTransportStop={noop}
      onTransportSkipBack={noop}
      {...props}
    />
  )
}

describe('TrackerView', () => {
  it('renders the player shell regions and recent projects rail', () => {
    renderTracker({
      recentProjects: RECENT_PROJECTS,
      sampleRows: SAMPLE_ROWS
    })

    expect(screen.getByText('Recent Projects')).toBeInTheDocument()
    expect(screen.getByText('club-night')).toBeInTheDocument()
    expect(screen.getByText('Lane 1')).toBeInTheDocument()
    expect(screen.getByText('Song Controls')).toBeInTheDocument()
    expect(screen.getByText('Category Tree')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /kick_808\.wav/i })).toBeInTheDocument()
  })

  it('renders clip bubbles on a lane after placement', () => {
    const lanesWithClip: LaneState[] = LANES.map((lane) =>
      lane.index === 0
        ? {
            ...lane,
            clips: [
              {
                id: 'clip-1',
                samplePath: 'Drums/Kicks/kick_808.wav',
                sampleName: 'kick_808.wav',
                startTick: 0,
                durationTicks: 32
              }
            ]
          }
        : lane
    )

    renderTracker({ lanes: lanesWithClip })
    expect(screen.getAllByTitle('kick_808.wav')).toHaveLength(1)
  })

  it('fires onPlaceSampleOnLane when clicking the lane canvas with a selected sample', () => {
    const onPlaceSampleOnLane = vi.fn()

    renderTracker({
      sampleRows: SAMPLE_ROWS,
      selectedSamplePath: 'Drums/Kicks/kick_808.wav',
      onPlaceSampleOnLane
    })

    const laneCanvas = screen.getByRole('button', { name: 'Place sample on Lane 1' })
    fireEvent.click(laneCanvas)
    expect(onPlaceSampleOnLane).toHaveBeenCalledWith(0, expect.any(Number))
  })

  it('fires onToggleLaneMute when clicking the M button', () => {
    const onToggleLaneMute = vi.fn()
    renderTracker({ onToggleLaneMute })

    fireEvent.click(screen.getByRole('button', { name: 'Mute Lane 1' }))
    expect(onToggleLaneMute).toHaveBeenCalledWith(0)
  })

  it('fires onToggleLaneSolo when clicking the S button', () => {
    const onToggleLaneSolo = vi.fn()
    renderTracker({ onToggleLaneSolo })

    fireEvent.click(screen.getByRole('button', { name: 'Solo Lane 2' }))
    expect(onToggleLaneSolo).toHaveBeenCalledWith(1)
  })

  it('shows active mute button state for muted lanes', () => {
    const mutedLanes = LANES.map((lane) =>
      lane.index === 3 ? { ...lane, muted: true } : lane
    )
    renderTracker({ lanes: mutedLanes })

    const muteBtn = screen.getByRole('button', { name: 'Mute Lane 4' })
    expect(muteBtn.className).toContain('tracker-lane-mute-active')
  })

  it('shows active solo button state for soloed lanes', () => {
    const soloLanes = LANES.map((lane) =>
      lane.index === 5 ? { ...lane, solo: true } : lane
    )
    renderTracker({
      lanes: soloLanes,
      laneShouldDim: (lane) => lane.index !== 5
    })

    const soloBtn = screen.getByRole('button', { name: 'Solo Lane 6' })
    expect(soloBtn.className).toContain('tracker-lane-solo-active')
  })

  it('dims non-soloed lanes when any lane is soloed', () => {
    const soloLanes = LANES.map((lane) =>
      lane.index === 0 ? { ...lane, solo: true } : lane
    )
    renderTracker({
      lanes: soloLanes,
      laneShouldDim: (lane) => lane.index !== 0
    })

    const dimmedLane = document.querySelector('.tracker-lane-dimmed')
    expect(dimmedLane).not.toBeNull()
  })

  it('fires transport callbacks when buttons are clicked', () => {
    const onTransportPlay = vi.fn()
    const onTransportPause = vi.fn()
    const onTransportStop = vi.fn()
    const onTransportSkipBack = vi.fn()

    renderTracker({
      onTransportPlay,
      onTransportPause,
      onTransportStop,
      onTransportSkipBack
    })

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(onTransportPlay).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(onTransportStop).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Skip Back' }))
    expect(onTransportSkipBack).toHaveBeenCalledTimes(1)
  })

  it('shows Pause button when transport is playing', () => {
    renderTracker({ transportState: 'playing' })

    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument()
  })
})
