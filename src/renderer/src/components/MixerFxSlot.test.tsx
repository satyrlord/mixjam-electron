import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PlaybackReturnSnapshot } from '../engine/playback-engine'
import { createDefaultDelayReturnModule, createEmptyReturnModule } from '../engine/return-effects'
import MixerFxSlot from './MixerFxSlot'

function delayBus(): PlaybackReturnSnapshot {
  return {
    index: 0,
    module: createDefaultDelayReturnModule('fx-1'),
    powered: true,
    returnLevel: 0.7,
    limiterEnabled: false
  }
}

describe('MixerFxSlot', () => {
  it('shows the complete closed summary and exposes a real Power toggle', () => {
    const onSet = vi.fn()
    render(<MixerFxSlot
      bus={delayBus()}
      onSet={onSet}
      onPreview={vi.fn()}
      onGestureStart={vi.fn()}
      onGestureEnd={vi.fn()}
    />)

    const card = screen.getByRole('region', { name: 'FX Return 1' })
    expect(card).toContainElement(screen.getByRole('slider', { name: 'FX Return 1 level' }))
    expect(card).toContainElement(screen.getByRole('button', { name: 'Limiter for FX Return 1' }))
    expect(screen.getByRole('button', { name: 'FX 1 Delay' })).toHaveTextContent('Delay')
    expect(card).toHaveTextContent('375 ms')
    expect(card).toHaveTextContent('Feedback 35%')
    expect(card).toHaveTextContent('Tape 0%')
    expect(card).toHaveTextContent('Ping-Pong Off')
    const power = screen.getByRole('button', { name: 'Power FX 1' })
    expect(power).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(power)
    expect(onSet).toHaveBeenCalledWith(expect.objectContaining({ powered: false }))
  })

  it('dims a powered-off Delay as bypassed and shows the slot number', () => {
    const { rerender } = render(<MixerFxSlot
      bus={delayBus()}
      onSet={vi.fn()}
      onPreview={vi.fn()}
      onGestureStart={vi.fn()}
      onGestureEnd={vi.fn()}
    />)
    expect(screen.getByText('01')).toBeInTheDocument()
    expect(document.querySelector('.mixer-fx-card')!.className).not.toContain('mixer-fx-card-bypassed')

    rerender(<MixerFxSlot
      bus={{ ...delayBus(), powered: false }}
      onSet={vi.fn()}
      onPreview={vi.fn()}
      onGestureStart={vi.fn()}
      onGestureEnd={vi.fn()}
    />)
    expect(document.querySelector('.mixer-fx-card')!.className).toContain('mixer-fx-card-bypassed')
    expect(screen.getByRole('button', { name: 'Power FX 1' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('opens the Delay editor directly from the Edit button', () => {
    const onPreview = vi.fn()
    render(<MixerFxSlot
      bus={delayBus()}
      onSet={vi.fn()}
      onPreview={onPreview}
      onGestureStart={vi.fn()}
      onGestureEnd={vi.fn()}
    />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit parameters for FX 1' }))
    expect(screen.getByRole('dialog', { name: 'Delay' })).toBeInTheDocument()
    expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({ index: 0 }))
  })

  it('Edit on an Empty slot auditions a default Delay in the editor', () => {
    const onPreview = vi.fn()
    render(<MixerFxSlot
      bus={{ ...delayBus(), module: createEmptyReturnModule('fx-1') }}
      onSet={vi.fn()}
      onPreview={onPreview}
      onGestureStart={vi.fn()}
      onGestureEnd={vi.fn()}
    />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit parameters for FX 1' }))
    expect(screen.getByRole('dialog', { name: 'Delay' })).toBeInTheDocument()
    expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({
      module: expect.objectContaining({ type: 'delay' })
    }))
  })

  it('previews a Delay, saves edits, and preserves Return host settings', () => {
    const onSet = vi.fn()
    const onPreview = vi.fn()
    render(<MixerFxSlot
      bus={delayBus()}
      onSet={onSet}
      onPreview={onPreview}
      onGestureStart={vi.fn()}
      onGestureEnd={vi.fn()}
    />)

    fireEvent.keyDown(screen.getByRole('button', { name: 'FX 1 Delay' }), { key: 'Enter' })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delay...' }))
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Feedback' }), { key: 'ArrowUp' })
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(onPreview).toHaveBeenCalled()
    expect(onSet).toHaveBeenCalledWith(expect.objectContaining({
      index: 0,
      returnLevel: 0.7,
      limiterEnabled: false,
      module: expect.objectContaining({ type: 'delay', feedback: 36 })
    }))
  })

  it('clears a populated slot and offers only Delay for Empty', () => {
    const onSet = vi.fn()
    const onPreview = vi.fn()
    const { rerender } = render(<MixerFxSlot
      bus={delayBus()}
      onSet={onSet}
      onPreview={onPreview}
      onGestureStart={vi.fn()}
      onGestureEnd={vi.fn()}
    />)
    fireEvent.keyDown(screen.getByRole('button', { name: 'FX 1 Delay' }), { key: 'Enter' })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear slot' }))
    expect(onSet).toHaveBeenCalledWith(expect.objectContaining({
      module: expect.objectContaining({ type: 'empty' })
    }))

    rerender(<MixerFxSlot
      bus={{ ...delayBus(), index: 1, module: createEmptyReturnModule('fx-2') }}
      onSet={onSet}
      onPreview={onPreview}
      onGestureStart={vi.fn()}
      onGestureEnd={vi.fn()}
    />)
    expect(screen.queryByRole('button', { name: 'Power FX 2' })).toBeNull()
    fireEvent.keyDown(screen.getByRole('button', { name: 'FX 2 Empty' }), { key: 'Enter' })
    expect(screen.getByRole('menuitem', { name: 'Delay...' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Clear slot' })).toBeNull()
  })

  it('derives the visible slot and every update identity from the bus index', () => {
    const onSet = vi.fn()
    const onPreview = vi.fn()
    const bus = { ...delayBus(), index: 2 }
    render(<MixerFxSlot
      bus={bus}
      onSet={onSet}
      onPreview={onPreview}
      onGestureStart={vi.fn()}
      onGestureEnd={vi.fn()}
    />)

    expect(screen.getByRole('region', { name: 'FX Return 3' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Power FX 3' }))
    expect(onSet).toHaveBeenCalledWith({ ...bus, powered: false })

    fireEvent.keyDown(screen.getByRole('button', { name: 'FX 3 Delay' }), { key: 'Enter' })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delay...' }))
    expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({ index: 2 }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    fireEvent.keyDown(screen.getByRole('button', { name: 'FX 3 Delay' }), { key: 'Enter' })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear slot' }))
    expect(onSet).toHaveBeenLastCalledWith(expect.objectContaining({
      index: 2,
      module: expect.objectContaining({ type: 'empty' })
    }))
  })
})
