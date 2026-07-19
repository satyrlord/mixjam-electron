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
    render(<MixerFxSlot slot={1} bus={delayBus()} onSet={onSet} onPreview={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'FX 1' })).toHaveTextContent('Delay')
    expect(screen.getByRole('button', { name: 'FX 1' })).toHaveTextContent('375 ms')
    expect(screen.getByRole('button', { name: 'FX 1' })).toHaveTextContent('Feedback 35%')
    expect(screen.getByRole('button', { name: 'FX 1' })).toHaveTextContent('Tape 0%')
    expect(screen.getByRole('button', { name: 'FX 1' })).toHaveTextContent('Ping-Pong Off')
    fireEvent.click(screen.getByRole('button', { name: 'Power FX 1' }))
    expect(onSet).toHaveBeenCalledWith(expect.objectContaining({ powered: false }))
  })

  it('previews a Delay, saves edits, and preserves Return host settings', () => {
    const onSet = vi.fn()
    const onPreview = vi.fn()
    render(<MixerFxSlot slot={1} bus={delayBus()} onSet={onSet} onPreview={onPreview} />)

    fireEvent.keyDown(screen.getByRole('button', { name: 'FX 1' }), { key: 'Enter' })
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
    const { rerender } = render(<MixerFxSlot slot={1} bus={delayBus()} onSet={onSet} onPreview={onPreview} />)
    fireEvent.keyDown(screen.getByRole('button', { name: 'FX 1' }), { key: 'Enter' })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear slot' }))
    expect(onSet).toHaveBeenCalledWith(expect.objectContaining({
      module: expect.objectContaining({ type: 'empty' })
    }))

    rerender(<MixerFxSlot
      slot={2}
      bus={{ ...delayBus(), index: 1, module: createEmptyReturnModule('fx-2') }}
      onSet={onSet}
      onPreview={onPreview}
    />)
    expect(screen.queryByRole('button', { name: 'Power FX 2' })).toBeNull()
    fireEvent.keyDown(screen.getByRole('button', { name: 'FX 2' }), { key: 'Enter' })
    expect(screen.getByRole('menuitem', { name: 'Delay...' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Clear slot' })).toBeNull()
  })
})
