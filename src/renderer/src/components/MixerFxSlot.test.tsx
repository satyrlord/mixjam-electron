import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PlaybackReturnSnapshot } from '../engine/playback-engine'
import { createDefaultEchoformDelayReturnModule, createEmptyReturnModule } from '../engine/return-effects'
import MixerFxSlot from './MixerFxSlot'

function delayBus(): PlaybackReturnSnapshot {
  return {
    index: 0,
    module: createDefaultEchoformDelayReturnModule('fx-1'),
    powered: true,
    returnLevel: 0.7,
    limiterEnabled: false
  }
}

function renderSlot(bus: PlaybackReturnSnapshot, overrides: Partial<{
  onSet: (bus: PlaybackReturnSnapshot) => void
  onPreview: (bus: PlaybackReturnSnapshot) => void
  onGestureStart: () => void
  onGestureEnd: () => void
}> = {}) {
  const props = {
    onSet: vi.fn(),
    onPreview: vi.fn(),
    onGestureStart: vi.fn(),
    onGestureEnd: vi.fn(),
    ...overrides
  }
  return { ...props, ...render(<MixerFxSlot bus={bus} {...props} />) }
}

describe('MixerFxSlot', () => {
  it('shows the Echoform summary and exposes the shared Mix knob and Power toggle', () => {
    const { onSet } = renderSlot(delayBus())

    const card = screen.getByRole('region', { name: 'FX Return 1' })
    // The FX-slot Mix knob is the shared Mix parameter.
    expect(card).toContainElement(screen.getByRole('slider', { name: 'FX Return 1 Mix' }))
    expect(card).toContainElement(screen.getByRole('button', { name: 'Limiter for FX Return 1' }))
    expect(screen.getByRole('button', { name: 'FX 1 Echoform Delay' })).toHaveTextContent('Echoform Delay')
    expect(card).toHaveTextContent('Feedback 68%')
    expect(card).toHaveTextContent('tape')
    // Mix reads from returnLevel (0.7 -> 70%).
    expect(card).toHaveTextContent('Mix 70%')

    const power = screen.getByRole('button', { name: 'Power FX 1' })
    expect(power).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(power)
    expect(onSet).toHaveBeenCalledWith(expect.objectContaining({ powered: false }))
  })

  it('binds the FX-slot Mix knob to the bus return level (shared Mix)', () => {
    const onSet = vi.fn()
    render(<MixerFxSlot bus={delayBus()} onSet={onSet} onPreview={vi.fn()} onGestureStart={vi.fn()} onGestureEnd={vi.fn()} />)
    const mix = screen.getByRole('slider', { name: 'FX Return 1 Mix' })
    fireEvent.keyDown(mix, { key: 'ArrowUp' })
    expect(onSet).toHaveBeenCalledWith(expect.objectContaining({ returnLevel: expect.any(Number) }))
    const arg = onSet.mock.calls.at(-1)![0] as PlaybackReturnSnapshot
    expect(arg.returnLevel).toBeCloseTo(0.71, 5)
  })

  it('dims a powered-off delay as bypassed and shows the slot number', () => {
    const { rerender } = render(<MixerFxSlot
      bus={delayBus()} onSet={vi.fn()} onPreview={vi.fn()} onGestureStart={vi.fn()} onGestureEnd={vi.fn()} />)
    expect(screen.getByText('01')).toBeInTheDocument()
    expect(document.querySelector('.mixer-fx-card')!.className).not.toContain('mixer-fx-card-bypassed')

    rerender(<MixerFxSlot
      bus={{ ...delayBus(), powered: false }} onSet={vi.fn()} onPreview={vi.fn()} onGestureStart={vi.fn()} onGestureEnd={vi.fn()} />)
    expect(document.querySelector('.mixer-fx-card')!.className).toContain('mixer-fx-card-bypassed')
    expect(screen.getByRole('button', { name: 'Power FX 1' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('opens the Echoform editor directly from the Edit button', () => {
    const { onPreview } = renderSlot(delayBus())
    fireEvent.click(screen.getByRole('button', { name: 'Edit parameters for FX 1' }))
    expect(screen.getByRole('dialog', { name: 'Echoform Delay' })).toBeInTheDocument()
    expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({ index: 0 }))
  })

  it('Edit on an Empty slot auditions a default Echoform delay', () => {
    const { onPreview } = renderSlot({ ...delayBus(), module: createEmptyReturnModule('fx-1') })
    fireEvent.click(screen.getByRole('button', { name: 'Edit parameters for FX 1' }))
    expect(screen.getByRole('dialog', { name: 'Echoform Delay' })).toBeInTheDocument()
    expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({
      module: expect.objectContaining({ type: 'echoform-delay' })
    }))
  })

  it('previews edits, saves on close, and preserves Return host settings', () => {
    const { onSet, onPreview } = renderSlot(delayBus())

    fireEvent.click(screen.getByRole('button', { name: 'Edit parameters for FX 1' }))
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Feedback' }), { key: 'ArrowUp' })
    fireEvent.click(screen.getByRole('button', { name: 'Close Echoform Delay editor' }))
    expect(onPreview).toHaveBeenCalled()
    expect(onSet).toHaveBeenCalledWith(expect.objectContaining({
      index: 0,
      returnLevel: 0.7,
      limiterEnabled: false,
      module: expect.objectContaining({ type: 'echoform-delay', feedback: 69 })
    }))
  })

  it('clears a populated slot and offers only Echoform Delay for Empty', () => {
    const onSet = vi.fn()
    const { rerender } = render(<MixerFxSlot
      bus={delayBus()} onSet={onSet} onPreview={vi.fn()} onGestureStart={vi.fn()} onGestureEnd={vi.fn()} />)
    fireEvent.keyDown(screen.getByRole('button', { name: 'FX 1 Echoform Delay' }), { key: 'Enter' })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear slot' }))
    expect(onSet).toHaveBeenCalledWith(expect.objectContaining({
      module: expect.objectContaining({ type: 'empty' })
    }))

    rerender(<MixerFxSlot
      bus={{ ...delayBus(), index: 1, module: createEmptyReturnModule('fx-2') }}
      onSet={onSet} onPreview={vi.fn()} onGestureStart={vi.fn()} onGestureEnd={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Power FX 2' })).toBeNull()
    fireEvent.keyDown(screen.getByRole('button', { name: 'FX 2 Empty' }), { key: 'Enter' })
    expect(screen.getByRole('menuitem', { name: 'Echoform Delay...' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Clear slot' })).toBeNull()
  })

  it('derives the visible slot and update identity from the bus index', () => {
    const onSet = vi.fn()
    const bus = { ...delayBus(), index: 2 }
    render(<MixerFxSlot bus={bus} onSet={onSet} onPreview={vi.fn()} onGestureStart={vi.fn()} onGestureEnd={vi.fn()} />)

    expect(screen.getByRole('region', { name: 'FX Return 3' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Power FX 3' }))
    expect(onSet).toHaveBeenCalledWith({ ...bus, powered: false })
  })
})
