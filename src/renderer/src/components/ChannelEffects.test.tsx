import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ChannelEffects from './ChannelEffects'
import { createDefaultEffect } from '../engine/effects'

describe('ChannelEffects', () => {
  it('adds an effect from the type selector', () => {
    const onAdd = vi.fn()
    render(<ChannelEffects channelIndex={0} effects={[]} onAdd={onAdd} onUpdate={vi.fn()} onToggleBypass={vi.fn()} onRemove={vi.fn()} onMove={vi.fn()} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Add effect to channel 1' }), { target: { value: 'delay' } })

    expect(onAdd).toHaveBeenCalledWith(0, 'delay')
  })

  it('opens parameters and dispatches live edits, bypass, moves, and removal', () => {
    const delay = createDefaultEffect('delay')
    const reverb = createDefaultEffect('reverb')
    const onUpdate = vi.fn()
    const onToggleBypass = vi.fn()
    const onRemove = vi.fn()
    const onMove = vi.fn()
    render(<ChannelEffects channelIndex={0} effects={[delay, reverb]} onAdd={vi.fn()} onUpdate={onUpdate} onToggleBypass={onToggleBypass} onRemove={onRemove} onMove={onMove} />)

    fireEvent.click(screen.getByRole('button', { name: 'Delay effect on channel 1' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Time' }), { target: { value: '640' } })
    expect(onUpdate).toHaveBeenCalledWith(0, expect.objectContaining({ id: delay.id, timeMs: 640 }))

    fireEvent.click(screen.getByRole('button', { name: 'Bypass' }))
    expect(onToggleBypass).toHaveBeenCalledWith(0, delay.id)
    fireEvent.click(screen.getByRole('button', { name: 'Move right' }))
    expect(onMove).toHaveBeenCalledWith(0, delay.id, 1)
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(onRemove).toHaveBeenCalledWith(0, delay.id)
  })

  it('edits every delay parameter and closes from the dialog header', () => {
    const delay = createDefaultEffect('delay')
    const onUpdate = vi.fn()
    render(<ChannelEffects channelIndex={0} effects={[delay]} onAdd={vi.fn()} onUpdate={onUpdate} onToggleBypass={vi.fn()} onRemove={vi.fn()} onMove={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delay effect on channel 1' }))

    fireEvent.change(screen.getByRole('slider', { name: 'Feedback' }), { target: { value: '0.7' } })
    fireEvent.change(screen.getByRole('slider', { name: 'Mix' }), { target: { value: '0.6' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ping-pong' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tempo sync' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Note division' }), { target: { value: '1/16T' } })

    expect(onUpdate).toHaveBeenCalledWith(0, expect.objectContaining({ feedback: 0.7 }))
    expect(onUpdate).toHaveBeenCalledWith(0, expect.objectContaining({ mix: 0.6 }))
    expect(onUpdate).toHaveBeenCalledWith(0, expect.objectContaining({ pingPong: true }))
    expect(onUpdate).toHaveBeenCalledWith(0, expect.objectContaining({ tempoSync: true }))
    expect(onUpdate).toHaveBeenCalledWith(0, expect.objectContaining({ noteDivision: '1/16T' }))

    fireEvent.click(screen.getByRole('button', { name: 'Close effect settings' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('edits reverb and compressor controls', () => {
    const reverb = createDefaultEffect('reverb')
    const compressor = createDefaultEffect('compressor')
    const onUpdate = vi.fn()
    const { rerender } = render(<ChannelEffects channelIndex={0} effects={[reverb]} onAdd={vi.fn()} onUpdate={onUpdate} onToggleBypass={vi.fn()} onRemove={vi.fn()} onMove={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Reverb effect on channel 1' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Room size' }), { target: { value: '0.8' } })
    fireEvent.change(screen.getByRole('slider', { name: 'Decay' }), { target: { value: '0.7' } })
    fireEvent.change(screen.getByRole('slider', { name: 'Mix' }), { target: { value: '0.4' } })
    expect(onUpdate).toHaveBeenCalledTimes(3)

    fireEvent.click(screen.getByRole('button', { name: 'Close effect settings' }))
    rerender(<ChannelEffects channelIndex={0} effects={[compressor]} onAdd={vi.fn()} onUpdate={onUpdate} onToggleBypass={vi.fn()} onRemove={vi.fn()} onMove={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Compressor effect on channel 1' }))
    for (const [name, value] of [['Threshold', '-12'], ['Ratio', '8'], ['Attack', '40'], ['Release', '800'], ['Makeup gain', '6']] as const) {
      fireEvent.change(screen.getByRole('slider', { name }), { target: { value } })
    }
    expect(onUpdate).toHaveBeenCalledTimes(8)
  })

  it('supports backdrop dismissal, bypassed state, and drag reordering', () => {
    const delay = { ...createDefaultEffect('delay'), bypassed: true }
    const reverb = createDefaultEffect('reverb')
    const onToggleBypass = vi.fn()
    const onMove = vi.fn()
    render(<ChannelEffects channelIndex={0} effects={[delay, reverb]} onAdd={vi.fn()} onUpdate={vi.fn()} onToggleBypass={onToggleBypass} onRemove={vi.fn()} onMove={onMove} />)

    const delayButton = screen.getByRole('button', { name: 'Delay effect on channel 1' })
    expect(delayButton).toHaveClass('channel-effect-slot-bypassed')
    fireEvent.click(delayButton)
    fireEvent.click(screen.getByRole('button', { name: 'Enable' }))
    expect(onToggleBypass).toHaveBeenCalledWith(0, delay.id)
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement!)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    let draggedId = ''
    const dataTransfer = {
      setData: vi.fn((_type: string, value: string) => { draggedId = value }),
      getData: vi.fn(() => draggedId)
    }
    fireEvent.dragStart(delayButton, { dataTransfer })
    const reverbButton = screen.getByRole('button', { name: 'Reverb effect on channel 1' })
    fireEvent.dragOver(reverbButton, { dataTransfer })
    fireEvent.drop(reverbButton, { dataTransfer })
    expect(onMove).toHaveBeenCalledWith(0, delay.id, 1)
  })

  it('disables adding at the four-slot cap', () => {
    const effects = [createDefaultEffect('delay'), createDefaultEffect('reverb'), createDefaultEffect('compressor'), createDefaultEffect('delay')]
    render(<ChannelEffects channelIndex={0} effects={effects} onAdd={vi.fn()} onUpdate={vi.fn()} onToggleBypass={vi.fn()} onRemove={vi.fn()} onMove={vi.fn()} />)
    expect(screen.getByRole('combobox', { name: 'Add effect to channel 1' })).toBeDisabled()
  })
})
