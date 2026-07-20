import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { PlaybackReturnSnapshot } from '../engine/playback-engine'
import { createDefaultFxBuses, createDefaultLanes } from '../project/project-state'
import MixerColumn from './MixerColumn'

type ReturnBuses = readonly [PlaybackReturnSnapshot, PlaybackReturnSnapshot, PlaybackReturnSnapshot, PlaybackReturnSnapshot]

function initialReturnBuses(): ReturnBuses {
  const buses = createDefaultFxBuses()
  return [
    { ...buses[0], index: 0 },
    { ...buses[1], index: 1 },
    { ...buses[2], index: 2 },
    { ...buses[3], index: 3 }
  ]
}

function Harness({ onSet, onPreview, onGestureStart = vi.fn(), onGestureEnd = vi.fn() }: {
  onSet: (bus: PlaybackReturnSnapshot) => void
  onPreview: (bus: PlaybackReturnSnapshot) => void
  onGestureStart?: () => void
  onGestureEnd?: () => void
}) {
  const [buses, setBuses] = useState<ReturnBuses>(initialReturnBuses)
  const [lanes] = useState(() => createDefaultLanes().slice(0, 1))
  const handleSet = (next: PlaybackReturnSnapshot) => {
    onSet(next)
    setBuses((current) => current.map((bus) => bus.index === next.index ? next : bus) as unknown as ReturnBuses)
  }
  return (
    <MixerColumn
      lanes={lanes}
      returnBuses={buses}
      channelLevels={new Map([[0, -12]])}
      channelPeaks={new Map([[0, -8]])}
      selectedLaneId={lanes[0]!.id}
      onSetChannelGain={vi.fn()}
      onSetChannelPan={vi.fn()}
      onSetChannelSend={vi.fn()}
      onSelectLane={vi.fn()}
      onGestureStart={onGestureStart}
      onGestureEnd={onGestureEnd}
      onSetReturnBus={handleSet}
      onPreviewReturnBus={onPreview}
    />
  )
}

describe('MixerColumn', () => {
  it('edits real Return controls, previews and saves an Echoform Delay, and clears it', () => {
    const onSet = vi.fn()
    const onPreview = vi.fn()
    render(<Harness onSet={onSet} onPreview={onPreview} />)

    expect(screen.getByRole('button', { name: 'Lane 1' })).toBeInTheDocument()
    const firstFxReturn = screen.getByRole('region', { name: 'FX Return 1' })
    expect(firstFxReturn).toContainElement(screen.getByRole('slider', { name: 'FX Return 1 Mix' }))
    expect(firstFxReturn).toContainElement(screen.getByRole('button', { name: 'Limiter for FX Return 1' }))
    expect(screen.queryByRole('region', { name: 'FX Returns' })).toBeNull()
    fireEvent.keyDown(screen.getByRole('slider', { name: 'FX Return 1 Mix' }), { key: 'Home' })
    fireEvent.click(screen.getByRole('button', { name: 'Limiter for FX Return 1' }))

    fireEvent.keyDown(screen.getByRole('button', { name: 'FX 1 Empty' }), { key: 'Enter' })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Echoform Delay...' }))
    expect(screen.getByRole('dialog', { name: 'Echoform Delay' })).toBeInTheDocument()
    expect(document.body.dataset.mixjamModalBlocking).toBe('1')
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Feedback' }), { key: 'ArrowUp' })
    fireEvent.click(screen.getByRole('button', { name: 'Digital' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close Echoform Delay editor' }))

    expect(onPreview).toHaveBeenCalled()
    expect(onSet).toHaveBeenCalled()
    expect(document.body.dataset.mixjamModalBlocking).toBeUndefined()

    fireEvent.keyDown(screen.getByRole('button', { name: 'FX 1 Echoform Delay' }), { key: 'Enter' })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear slot' }))
    expect(onSet).toHaveBeenLastCalledWith(expect.objectContaining({
      index: 0,
      module: expect.objectContaining({ type: 'empty' })
    }))
  })

  it('renders reference panel headers for the channel bank and FX bank', () => {
    render(<Harness onSet={vi.fn()} onPreview={vi.fn()} />)
    const channelPanel = document.querySelector('.mixer-panel')!
    expect(channelPanel.querySelector('.mixer-panel-header')).toHaveTextContent('1 × Channels')
    expect(channelPanel.querySelector('.mixer-panel-header')).toHaveTextContent('4 Sends')
    const fxBank = screen.getByRole('region', { name: 'FX and Returns' })
    expect(fxBank.querySelector('.mixer-panel-header')).toHaveTextContent('4 × FX Slots')
    expect(fxBank.querySelector('.mixer-panel-header')).toHaveTextContent('Active')
    expect(channelPanel.querySelectorAll('.mixer-status-led')).toHaveLength(1)
    expect(fxBank.querySelectorAll('.mixer-status-led')).toHaveLength(1)
  })

  it('uses a constrained scrollport and supports only explicit horizontal wheel conversion', () => {
    render(<Harness onSet={vi.fn()} onPreview={vi.fn()} />)
    const scrollport = screen.getByRole('region', { name: 'Mixer channels and returns' })
    expect(scrollport.querySelector(':scope > .mixer-strips-row')).not.toBeNull()

    Object.defineProperty(scrollport, 'scrollLeft', { configurable: true, writable: true, value: 0 })
    fireEvent.wheel(scrollport, { deltaY: 40 })
    expect(scrollport.scrollLeft).toBe(0)
    fireEvent.wheel(scrollport, { deltaY: 40, shiftKey: true })
    expect(scrollport.scrollLeft).toBe(40)
    fireEvent.keyDown(scrollport, { key: 'ArrowRight' })
    expect(scrollport.scrollLeft).toBe(120)
  })

  it('wraps a multi-update Return drag in one Mixer gesture', () => {
    const onGestureStart = vi.fn()
    const onGestureEnd = vi.fn()
    render(
      <Harness
        onSet={vi.fn()}
        onPreview={vi.fn()}
        onGestureStart={onGestureStart}
        onGestureEnd={onGestureEnd}
      />
    )
    const level = screen.getByRole('slider', { name: 'FX Return 1 Mix' })
    fireEvent.pointerDown(level, { button: 0, pointerId: 8, clientY: 120 })
    fireEvent.pointerMove(level, { pointerId: 8, clientY: 100 })
    fireEvent.pointerMove(level, { pointerId: 8, clientY: 80 })
    fireEvent.pointerUp(level, { pointerId: 8 })

    expect(onGestureStart).toHaveBeenCalledOnce()
    expect(onGestureEnd).toHaveBeenCalledOnce()
  })

  it('uses the shared SVG rotary visual for Return levels', () => {
    render(<Harness onSet={vi.fn()} onPreview={vi.fn()} />)

    for (const slot of [1, 2, 3, 4]) {
      const level = screen.getByRole('slider', { name: `FX Return ${slot} Mix` })
      expect(level.querySelector('svg.rotary-dial')).toHaveAttribute('data-rotary-mode', 'unipolar')
    }
  })

  it('uses the shared tooltip for the exact limiter explanation', async () => {
    render(<Harness onSet={vi.fn()} onPreview={vi.fn()} />)
    const limiter = screen.getByRole('button', { name: 'Limiter for FX Return 1' })
    expect(limiter).not.toHaveAttribute('title')
    fireEvent.focus(limiter)
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Limiter Caps this FX Return at −1 dBFS using stereo-linked peak limiting. Enabled by default. Click to bypass. This does not limit the Master output.'
    )
  })

  it('traps focus and restores it to the originating FX container on Cancel', () => {
    const onPreview = vi.fn()
    render(<Harness onSet={vi.fn()} onPreview={onPreview} />)
    const slot = screen.getByRole('button', { name: 'FX 2 Empty' })
    slot.focus()
    fireEvent.keyDown(slot, { key: 'Enter' })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Echoform Delay...' }))
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Echoform Delay' }), { key: 'Escape' })
    expect(slot).toHaveFocus()
    expect(onPreview).toHaveBeenCalled()
  })
})
