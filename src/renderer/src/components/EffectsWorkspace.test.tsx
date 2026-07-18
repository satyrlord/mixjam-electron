import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import EffectsWorkspace from './EffectsWorkspace'
import { createDefaultEffect, type EffectSlot } from '../engine/effects'
import type { ChannelState } from '../project/project-state'

function Harness({ initial = [] }: { initial?: EffectSlot[] }) {
  const [effects, setEffects] = useState(initial)
  const [selected, setSelected] = useState<string | null>(initial[0]?.id ?? null)
  const channel: ChannelState = { channelIndex: 0, gain: 0.8, pan: 0, muted: false, solo: false, effects }
  return <EffectsWorkspace
    channels={[channel]}
    selectedChannelIndex={0}
    selectedEffectId={selected}
    effectReductions={new Map(initial[0] ? [[initial[0].id, 6.4]] : [])}
    onSelectEffect={setSelected}
    onSelectChannel={vi.fn()}
    onAdd={(_channel, type) => {
      const effect = createDefaultEffect(type)
      setEffects((current) => [...current, effect])
      return effect
    }}
    onUpdate={(_channel, effect) => setEffects((current) => current.map((item) => item.id === effect.id ? effect : item))}
    onToggleBypass={(_channel, id) => setEffects((current) => current.map((item) => item.id === id ? { ...item, bypassed: !item.bypassed } : item))}
    onRemove={(_channel, id) => setEffects((current) => current.filter((item) => item.id !== id))}
    onRestore={(_channel, effect, index) => { setEffects((current) => { const next = [...current]; next.splice(index, 0, effect); return next }); return true }}
    onMove={(_channel, id, index) => setEffects((current) => { const next = [...current]; const from = next.findIndex((item) => item.id === id); const [item] = next.splice(from, 1); next.splice(index, 0, item!); return next })}
  />
}

describe('EffectsWorkspace', () => {
  it('adds a described effect and opens its factory preset', () => {
    render(<Harness />)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Add effect' }), { key: 'Enter' })
    fireEvent.click(screen.getByRole('menuitem', { name: /Delay/ }))
    expect(screen.getByRole('heading', { name: 'Delay' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Starting point' })).toHaveValue('Classic Echo')
  })

  it('applies a preset, edits a knob by keyboard, and marks the result custom', () => {
    render(<Harness initial={[createDefaultEffect('delay')]} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Starting point' }), { target: { value: 'Slapback' } })
    expect(screen.getByRole('slider', { name: 'Time' })).toHaveAttribute('aria-valuenow', '110')
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Time' }), { key: 'ArrowUp' })
    expect(screen.getByRole('combobox', { name: 'Starting point' })).toHaveValue('Custom')
  })

  it('bypasses, removes, and restores the selected effect', () => {
    render(<Harness initial={[createDefaultEffect('compressor')]} />)
    const enabled = screen.getByRole('button', { name: 'Bypass Compressor' })
    expect(enabled).toHaveTextContent('Enabled')
    fireEvent.click(enabled)
    expect(screen.getByRole('button', { name: 'Enable Compressor' })).toHaveTextContent('Bypassed')
    fireEvent.keyDown(screen.getByText('Actions'), { key: 'Enter' })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove effect' }))
    expect(screen.getByRole('status')).toHaveTextContent('Compressor removed')
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByRole('heading', { name: 'Compressor' })).toBeInTheDocument()
  })

  it('shows direct recovery actions in the no-channel empty state', () => {
    const onOpenMixer = vi.fn()
    const onRestoreChannel = vi.fn()
    render(<EffectsWorkspace channels={[]} selectedChannelIndex={null} selectedEffectId={null} effectReductions={new Map()} canRestoreChannel onOpenMixer={onOpenMixer} onRestoreChannel={onRestoreChannel} onSelectChannel={vi.fn()} onSelectEffect={vi.fn()} onAdd={vi.fn()} onUpdate={vi.fn()} onToggleBypass={vi.fn()} onRemove={vi.fn()} onRestore={vi.fn()} onMove={vi.fn()} />)
    expect(screen.getByText('No mixer channels')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Restore a channel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Mixer' }))
    expect(onRestoreChannel).toHaveBeenCalledTimes(1)
    expect(onOpenMixer).toHaveBeenCalledTimes(1)
  })

  it('allows omitted recovery callbacks in the no-channel empty state', () => {
    render(<EffectsWorkspace channels={[]} selectedChannelIndex={null} selectedEffectId={null} effectReductions={new Map()} canRestoreChannel onSelectChannel={vi.fn()} onSelectEffect={vi.fn()} onAdd={vi.fn()} onUpdate={vi.fn()} onToggleBypass={vi.fn()} onRemove={vi.fn()} onRestore={vi.fn()} onMove={vi.fn()} />)

    expect(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Restore a channel' }))
      fireEvent.click(screen.getByRole('button', { name: 'Open Mixer' }))
    }).not.toThrow()
  })

  it('provides an internal channel selector', () => {
    const onSelectChannel = vi.fn()
    const channels: ChannelState[] = [
      { channelIndex: 0, gain: 0.8, pan: 0, muted: false, solo: false, effects: [] },
      { channelIndex: 2, gain: 0.8, pan: 0, muted: false, solo: false, effects: [] }
    ]
    render(<EffectsWorkspace channels={channels} selectedChannelIndex={2} selectedEffectId={null} effectReductions={new Map()} onSelectChannel={onSelectChannel} onSelectEffect={vi.fn()} onAdd={vi.fn()} onUpdate={vi.fn()} onToggleBypass={vi.fn()} onRemove={vi.fn()} onRestore={vi.fn()} onMove={vi.fn()} />)

    const selector = screen.getByRole('combobox', { name: 'FX channel' })
    expect(selector).toHaveValue('2')
    fireEvent.change(selector, { target: { value: '0' } })
    expect(onSelectChannel).toHaveBeenCalledWith(0)
  })

  it('shows the empty chain message when no effect is selected', () => {
    const channel: ChannelState = { channelIndex: 0, gain: 0.8, pan: 0, muted: false, solo: false, effects: [] }
    render(<EffectsWorkspace channels={[channel]} selectedChannelIndex={0} selectedEffectId={null} effectReductions={new Map()} onSelectChannel={vi.fn()} onSelectEffect={vi.fn()} onAdd={vi.fn()} onUpdate={vi.fn()} onToggleBypass={vi.fn()} onRemove={vi.fn()} onRestore={vi.fn()} onMove={vi.fn()} />)
    expect(screen.getByText('Build a signal chain')).toBeInTheDocument()
    expect(screen.getByText(/Add an effect to begin/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add effect' })).toBeInTheDocument()
  })

  it('shows the disabled add-effect state when 4 effects are present', () => {
    const fx = Array.from({ length: 4 }, () => createDefaultEffect('delay'))
    const channel: ChannelState = { channelIndex: 0, gain: 0.8, pan: 0, muted: false, solo: false, effects: fx }
    render(<EffectsWorkspace channels={[channel]} selectedChannelIndex={0} selectedEffectId={fx[0]!.id} effectReductions={new Map()} onSelectChannel={vi.fn()} onSelectEffect={vi.fn()} onAdd={vi.fn()} onUpdate={vi.fn()} onToggleBypass={vi.fn()} onRemove={vi.fn()} onRestore={vi.fn()} onMove={vi.fn()} />)
    expect(screen.getByText('4 of 4 effects used')).toBeInTheDocument()
  })

  it('scrolls the selected card using viewport geometry relative to the chain', () => {
    const effects = [createDefaultEffect('delay'), createDefaultEffect('reverb')]
    const channel: ChannelState = { channelIndex: 0, gain: 0.8, pan: 0, muted: false, solo: false, effects }
    const props = {
      channels: [channel], selectedChannelIndex: 0, effectReductions: new Map<string, number>(),
      onSelectChannel: vi.fn(), onSelectEffect: vi.fn(), onAdd: vi.fn(), onUpdate: vi.fn(),
      onToggleBypass: vi.fn(), onRemove: vi.fn(), onRestore: vi.fn(), onMove: vi.fn()
    }
    const { container, rerender } = render(<EffectsWorkspace {...props} selectedEffectId={null} />)
    const chain = container.querySelector('.effects-chain') as HTMLDivElement
    const cards = container.querySelectorAll<HTMLElement>('[data-effect-id]')
    const scrollTo = vi.fn()
    chain.scrollTo = scrollTo
    Object.defineProperty(chain, 'scrollLeft', { configurable: true, value: 40, writable: true })
    vi.spyOn(chain, 'getBoundingClientRect').mockReturnValue({
      left: 100, right: 400, top: 0, bottom: 100, width: 300, height: 100, x: 100, y: 0, toJSON: () => ({})
    })
    vi.spyOn(cards[1]!, 'getBoundingClientRect').mockReturnValue({
      left: 420, right: 500, top: 0, bottom: 80, width: 80, height: 80, x: 420, y: 0, toJSON: () => ({})
    })

    rerender(<EffectsWorkspace {...props} selectedEffectId={effects[1]!.id} />)

    expect(scrollTo).toHaveBeenCalledWith({ left: 152, behavior: 'smooth' })
  })

  it('scrolls the selected card again when its chain position changes', () => {
    const delay = createDefaultEffect('delay')
    const reverb = createDefaultEffect('reverb')
    const channel: ChannelState = {
      channelIndex: 0,
      gain: 0.8,
      pan: 0,
      muted: false,
      solo: false,
      effects: [delay, reverb]
    }
    const props = {
      selectedChannelIndex: 0,
      selectedEffectId: delay.id,
      effectReductions: new Map<string, number>(),
      onSelectChannel: vi.fn(), onSelectEffect: vi.fn(), onAdd: vi.fn(), onUpdate: vi.fn(),
      onToggleBypass: vi.fn(), onRemove: vi.fn(), onRestore: vi.fn(), onMove: vi.fn()
    }
    const { container, rerender } = render(<EffectsWorkspace {...props} channels={[channel]} />)
    const chain = container.querySelector('.effects-chain') as HTMLDivElement
    const selectedCard = container.querySelector<HTMLElement>(`[data-effect-id="${delay.id}"]`)!
    const scrollTo = vi.fn()
    chain.scrollTo = scrollTo
    Object.defineProperty(chain, 'scrollLeft', { configurable: true, value: 0, writable: true })
    vi.spyOn(chain, 'getBoundingClientRect').mockReturnValue({
      left: 20, right: 320, top: 0, bottom: 100, width: 300, height: 100, x: 20, y: 0, toJSON: () => ({})
    })
    vi.spyOn(selectedCard, 'getBoundingClientRect').mockReturnValue({
      left: 350, right: 430, top: 0, bottom: 80, width: 80, height: 80, x: 350, y: 0, toJSON: () => ({})
    })

    rerender(<EffectsWorkspace {...props} channels={[{ ...channel, effects: [reverb, delay] }]} />)

    expect(scrollTo).toHaveBeenCalledWith({ left: 122, behavior: 'smooth' })
  })

  it('reorders an effect via Alt+ArrowRight keyboard shortcut', () => {
    const delay = createDefaultEffect('delay')
    const reverb = createDefaultEffect('reverb')
    render(<Harness initial={[delay, reverb]} />)
    const delayCard = document.querySelector<HTMLElement>(`[data-effect-id="${delay.id}"] .effect-card-main`)!
    fireEvent.click(delayCard)
    fireEvent.keyDown(delayCard, { key: 'ArrowRight', altKey: true })
    expect([...document.querySelectorAll('.effect-card-name')].map((node) => node.textContent))
      .toEqual(['Reverb', 'Delay'])
  })

  it('reorders an effect via Move left/right menu', () => {
    render(<Harness initial={[createDefaultEffect('delay'), createDefaultEffect('reverb')]} />)
    const orderButtons = screen.getAllByRole('button', { name: /order actions/ })
    expect(orderButtons.length).toBe(2)
    fireEvent.keyDown(orderButtons[1]!, { key: 'Enter' })
    const moveLefts = screen.getAllByRole('menuitem', { name: 'Move left' })
    fireEvent.click(moveLefts[moveLefts.length - 1]!)
    expect([...document.querySelectorAll('.effect-card-name')].map((node) => node.textContent))
      .toEqual(['Reverb', 'Delay'])
  })

  it('resets selected effect to factory defaults', () => {
    render(<Harness initial={[createDefaultEffect('delay')]} />)
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Time' }), { key: 'ArrowUp' })
    expect(screen.getByRole('slider', { name: 'Time' })).toHaveAttribute('aria-valuenow', '376')
    fireEvent.keyDown(screen.getByText('Actions'), { key: 'Enter' })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reset to factory settings' }))
    expect(screen.getByRole('slider', { name: 'Time' })).toHaveAttribute('aria-valuenow', '375')
  })

  it('displays compressor reduction meter', () => {
    const compressor = createDefaultEffect('compressor')
    const reductions = new Map<string, number>([[compressor.id, 4.2]])
    const channel: ChannelState = { channelIndex: 0, gain: 0.8, pan: 0, muted: false, solo: false, effects: [compressor] }
    render(<EffectsWorkspace channels={[channel]} selectedChannelIndex={0} selectedEffectId={compressor.id} effectReductions={reductions} onSelectChannel={vi.fn()} onSelectEffect={vi.fn()} onAdd={vi.fn()} onUpdate={vi.fn()} onToggleBypass={vi.fn()} onRemove={vi.fn()} onRestore={vi.fn()} onMove={vi.fn()} />)
    const meter = screen.getByRole('meter', { name: 'Gain reduction 4.2 dB' })
    expect(meter).toHaveAttribute('aria-valuemin', '0')
    expect(meter).toHaveAttribute('aria-valuemax', '24')
    expect(meter).toHaveAttribute('aria-valuenow', '4.2')
    expect(screen.getByText('4.2 dB')).toBeInTheDocument()
  })

  it('undo toast disappears after timeout', async () => {
    vi.useFakeTimers()
    render(<Harness initial={[createDefaultEffect('compressor')]} />)
    fireEvent.keyDown(screen.getByText('Actions'), { key: 'Enter' })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove effect' }))
    expect(screen.getByRole('status')).toHaveTextContent('Compressor removed')
    vi.advanceTimersByTime(6000)
    await vi.runAllTimersAsync()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    vi.useRealTimers()
  })

  it('undo restore fails when channel is full', () => {
    const onRestore = vi.fn().mockReturnValue(false)
    const compressor = createDefaultEffect('compressor')
    const channel: ChannelState = { channelIndex: 0, gain: 0.8, pan: 0, muted: false, solo: false, effects: [compressor] }
    render(<EffectsWorkspace channels={[channel]} selectedChannelIndex={0} selectedEffectId={compressor.id} effectReductions={new Map()} onSelectChannel={vi.fn()} onSelectEffect={vi.fn()} onAdd={vi.fn()} onUpdate={vi.fn()} onToggleBypass={vi.fn()} onRemove={vi.fn()} onRestore={onRestore} onMove={vi.fn()} />)
    fireEvent.keyDown(screen.getByText('Actions'), { key: 'Enter' })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove effect' }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByText(/Could not restore/)).toBeInTheDocument()
  })

  it('applies a reverb preset, edits a knob, and marks it custom', () => {
    render(<Harness initial={[createDefaultEffect('reverb')]} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Starting point' }), { target: { value: 'Long Hall' } })
    expect(screen.getByRole('slider', { name: 'Room size' })).toHaveAttribute('aria-valuenow', '85')
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Decay' }), { key: 'ArrowUp' })
    expect(screen.getByRole('combobox', { name: 'Starting point' })).toHaveValue('Custom')
  })

  it('applies a compressor preset and edits a knob', () => {
    render(<Harness initial={[createDefaultEffect('compressor')]} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Starting point' }), { target: { value: 'Gentle Glue' } })
    expect(screen.getByRole('slider', { name: 'Threshold' })).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Ratio' }), { key: 'ArrowUp' })
    expect(screen.getByRole('combobox', { name: 'Starting point' })).toHaveValue('Custom')
  })

  it('renders delay effect controls with tempo sync off', () => {
    const delay = createDefaultEffect('delay')
    const channel: ChannelState = { channelIndex: 0, gain: 0.8, pan: 0, muted: false, solo: false, effects: [delay] }
    render(<EffectsWorkspace channels={[channel]} selectedChannelIndex={0} selectedEffectId={delay.id} effectReductions={new Map()} onSelectChannel={vi.fn()} onSelectEffect={vi.fn()} onAdd={vi.fn()} onUpdate={vi.fn()} onToggleBypass={vi.fn()} onRemove={vi.fn()} onRestore={vi.fn()} onMove={vi.fn()} />)
    expect(screen.getByRole('slider', { name: 'Time' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Feedback' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Mix' })).toBeInTheDocument()
  })

  it('renders delay effect controls with tempo sync on', () => {
    const delay = { ...createDefaultEffect('delay'), tempoSync: true }
    const channel: ChannelState = { channelIndex: 0, gain: 0.8, pan: 0, muted: false, solo: false, effects: [delay] }
    render(<EffectsWorkspace channels={[channel]} selectedChannelIndex={0} selectedEffectId={delay.id} effectReductions={new Map()} onSelectChannel={vi.fn()} onSelectEffect={vi.fn()} onAdd={vi.fn()} onUpdate={vi.fn()} onToggleBypass={vi.fn()} onRemove={vi.fn()} onRestore={vi.fn()} onMove={vi.fn()} />)
    expect(screen.getByText('Note division')).toBeInTheDocument()
  })

  it('renders reverb effect controls', () => {
    const reverb = createDefaultEffect('reverb')
    const channel: ChannelState = { channelIndex: 0, gain: 0.8, pan: 0, muted: false, solo: false, effects: [reverb] }
    render(<EffectsWorkspace channels={[channel]} selectedChannelIndex={0} selectedEffectId={reverb.id} effectReductions={new Map()} onSelectChannel={vi.fn()} onSelectEffect={vi.fn()} onAdd={vi.fn()} onUpdate={vi.fn()} onToggleBypass={vi.fn()} onRemove={vi.fn()} onRestore={vi.fn()} onMove={vi.fn()} />)
    expect(screen.getByRole('slider', { name: 'Room size' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Decay' })).toBeInTheDocument()
  })

  it('renders compressor controls with all knobs', () => {
    const compressor = createDefaultEffect('compressor')
    const channel: ChannelState = { channelIndex: 0, gain: 0.8, pan: 0, muted: false, solo: false, effects: [compressor] }
    render(<EffectsWorkspace channels={[channel]} selectedChannelIndex={0} selectedEffectId={compressor.id} effectReductions={new Map()} onSelectChannel={vi.fn()} onSelectEffect={vi.fn()} onAdd={vi.fn()} onUpdate={vi.fn()} onToggleBypass={vi.fn()} onRemove={vi.fn()} onRestore={vi.fn()} onMove={vi.fn()} />)
    expect(screen.getByRole('slider', { name: 'Threshold' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Ratio' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Attack' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Release' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Makeup' })).toBeInTheDocument()
  })

  it('renders project-owned SVG dial faces with accessible interaction hints', () => {
    const compressor = createDefaultEffect('compressor')
    const channel: ChannelState = { channelIndex: 0, gain: 0.8, pan: 0, muted: false, solo: false, effects: [compressor] }
    render(<EffectsWorkspace channels={[channel]} selectedChannelIndex={0} selectedEffectId={compressor.id} effectReductions={new Map()} onSelectChannel={vi.fn()} onSelectEffect={vi.fn()} onAdd={vi.fn()} onUpdate={vi.fn()} onToggleBypass={vi.fn()} onRemove={vi.fn()} onRestore={vi.fn()} onMove={vi.fn()} />)

    const threshold = screen.getByRole('slider', { name: 'Threshold' })
    expect(threshold.querySelector('.rotary-dial-track')).toBeInTheDocument()
    expect(threshold.querySelector('.rotary-dial-value')).toBeInTheDocument()
    expect(threshold.querySelector('.rotary-dial-cap')).toBeInTheDocument()
    expect(threshold.querySelector('.rotary-dial-pointer')).toBeInTheDocument()
    const descriptionId = threshold.getAttribute('aria-describedby')
    expect(descriptionId).toBeTruthy()
    expect(document.getElementById(descriptionId!)).toHaveTextContent('Hold Shift for fine control')
  })

  it('shows signal direction connectors between the chain and add slot', () => {
    const compressor = createDefaultEffect('compressor')
    const channel: ChannelState = { channelIndex: 0, gain: 0.8, pan: 0, muted: false, solo: false, effects: [compressor] }
    const { container } = render(<EffectsWorkspace channels={[channel]} selectedChannelIndex={0} selectedEffectId={compressor.id} effectReductions={new Map()} onSelectChannel={vi.fn()} onSelectEffect={vi.fn()} onAdd={vi.fn()} onUpdate={vi.fn()} onToggleBypass={vi.fn()} onRemove={vi.fn()} onRestore={vi.fn()} onMove={vi.fn()} />)

    expect(container.querySelectorAll('.effect-chain-connector')).toHaveLength(1)
  })

  it('deselects effect when channel changes to one without that effect', () => {
    const onSelectEffect = vi.fn()
    const compressor = createDefaultEffect('compressor')
    const channel0: ChannelState = { channelIndex: 0, gain: 0.8, pan: 0, muted: false, solo: false, effects: [compressor] }
    const channel1: ChannelState = { channelIndex: 1, gain: 0.8, pan: 0, muted: false, solo: false, effects: [] }
    const { rerender } = render(
      <EffectsWorkspace channels={[channel0, channel1]} selectedChannelIndex={0} selectedEffectId={compressor.id} effectReductions={new Map()} onSelectChannel={vi.fn()} onSelectEffect={onSelectEffect} onAdd={vi.fn()} onUpdate={vi.fn()} onToggleBypass={vi.fn()} onRemove={vi.fn()} onRestore={vi.fn()} onMove={vi.fn()} />
    )
    // Switch to channel 1 (no effects)
    rerender(
      <EffectsWorkspace channels={[channel0, channel1]} selectedChannelIndex={1} selectedEffectId={compressor.id} effectReductions={new Map()} onSelectChannel={vi.fn()} onSelectEffect={onSelectEffect} onAdd={vi.fn()} onUpdate={vi.fn()} onToggleBypass={vi.fn()} onRemove={vi.fn()} onRestore={vi.fn()} onMove={vi.fn()} />
    )
    expect(onSelectEffect).toHaveBeenCalledWith(null)
  })

  it('effect cards are draggable and handle drag events without crashing', () => {
    const fx = [createDefaultEffect('delay'), createDefaultEffect('compressor')]
    const channel: ChannelState = { channelIndex: 0, gain: 0.8, pan: 0, muted: false, solo: false, effects: fx }
    render(<EffectsWorkspace channels={[channel]} selectedChannelIndex={0} selectedEffectId={fx[0]!.id} effectReductions={new Map()} onSelectChannel={vi.fn()} onSelectEffect={vi.fn()} onAdd={vi.fn()} onUpdate={vi.fn()} onToggleBypass={vi.fn()} onRemove={vi.fn()} onRestore={vi.fn()} onMove={vi.fn()} />)

    const cards = screen.getAllByRole('article')
    // Provide a minimal dataTransfer to avoid 'getData' crash on drop
    const dt = { setData: vi.fn(), getData: vi.fn().mockReturnValue(''), effectAllowed: '', dropEffect: '' }
    fireEvent.dragStart(cards[1]!, { dataTransfer: dt })
    fireEvent.dragOver(cards[0]!, { dataTransfer: dt })
    fireEvent.dragLeave(cards[0]!, { dataTransfer: dt })
    fireEvent.drop(cards[0]!, { dataTransfer: dt })
  })

  it('triggers dragOver state on effect card', () => {
    const fx = [createDefaultEffect('delay'), createDefaultEffect('compressor')]
    const channel: ChannelState = { channelIndex: 0, gain: 0.8, pan: 0, muted: false, solo: false, effects: fx }
    render(<EffectsWorkspace channels={[channel]} selectedChannelIndex={0} selectedEffectId={fx[0]!.id} effectReductions={new Map()} onSelectChannel={vi.fn()} onSelectEffect={vi.fn()} onAdd={vi.fn()} onUpdate={vi.fn()} onToggleBypass={vi.fn()} onRemove={vi.fn()} onRestore={vi.fn()} onMove={vi.fn()} />)

    const cards = screen.getAllByRole('article')
    fireEvent.dragOver(cards[0]!)
    expect(cards[0]!.className).toContain('dragover')
    fireEvent.dragLeave(cards[0]!)
    expect(cards[0]!.className).not.toContain('dragover')
  })

  it('applies a reverb preset via Harness', () => {
    render(<Harness initial={[createDefaultEffect('reverb')]} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Starting point' }), { target: { value: 'Long Hall' } })
    expect(screen.getByRole('slider', { name: 'Room size' })).toHaveAttribute('aria-valuenow', '85')
  })

  it('applies a compressor preset via Harness', () => {
    render(<Harness initial={[createDefaultEffect('compressor')]} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Starting point' }), { target: { value: 'Gentle Glue' } })
    expect(screen.getByRole('slider', { name: 'Threshold' })).toHaveAttribute('aria-valuenow', '-18')
  })

  it('toggles tempo sync on a delay effect', () => {
    const onUpdate = vi.fn()
    const delay = createDefaultEffect('delay')
    const channel: ChannelState = { channelIndex: 0, gain: 0.8, pan: 0, muted: false, solo: false, effects: [delay] }
    render(<EffectsWorkspace channels={[channel]} selectedChannelIndex={0} selectedEffectId={delay.id} effectReductions={new Map()} onSelectChannel={vi.fn()} onSelectEffect={vi.fn()} onAdd={vi.fn()} onUpdate={onUpdate} onToggleBypass={vi.fn()} onRemove={vi.fn()} onRestore={vi.fn()} onMove={vi.fn()} />)

    const label = screen.getByText('Tempo sync')
    fireEvent.click(label)
    expect(onUpdate).toHaveBeenCalled()
  })

  it('toggles ping-pong on delay effect', () => {
    const delay = createDefaultEffect('delay')
    const channel: ChannelState = { channelIndex: 0, gain: 0.8, pan: 0, muted: false, solo: false, effects: [delay] }
    const onUpdate = vi.fn()
    render(<EffectsWorkspace channels={[channel]} selectedChannelIndex={0} selectedEffectId={delay.id} effectReductions={new Map()} onSelectChannel={vi.fn()} onSelectEffect={vi.fn()} onAdd={vi.fn()} onUpdate={onUpdate} onToggleBypass={vi.fn()} onRemove={vi.fn()} onRestore={vi.fn()} onMove={vi.fn()} />)

    const label = screen.getByText('Ping-pong')
    fireEvent.click(label)
    expect(onUpdate).toHaveBeenCalled()
  })

  it('removes selected effect and selects adjacent effect', () => {
    const onSelectEffect = vi.fn()
    const onRemove = vi.fn()
    const fx = [createDefaultEffect('delay'), createDefaultEffect('compressor')]
    const channel: ChannelState = { channelIndex: 0, gain: 0.8, pan: 0, muted: false, solo: false, effects: fx }
    render(<EffectsWorkspace channels={[channel]} selectedChannelIndex={0} selectedEffectId={fx[0]!.id} effectReductions={new Map()} onSelectChannel={vi.fn()} onSelectEffect={onSelectEffect} onAdd={vi.fn()} onUpdate={vi.fn()} onToggleBypass={vi.fn()} onRemove={onRemove} onRestore={vi.fn()} onMove={vi.fn()} />)

    fireEvent.keyDown(screen.getByText('Actions'), { key: 'Enter' })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove effect' }))
    expect(onRemove).toHaveBeenCalledWith(0, fx[0]!.id)
    expect(onSelectEffect).toHaveBeenCalledWith(fx[1]!.id)
  })

  it('renders full delay effect with tempo sync on and note division selector', () => {
    const delay = { ...createDefaultEffect('delay'), tempoSync: true }
    const channel: ChannelState = { channelIndex: 0, gain: 0.8, pan: 0, muted: false, solo: false, effects: [delay] }
    const onUpdate = vi.fn()
    render(<EffectsWorkspace channels={[channel]} selectedChannelIndex={0} selectedEffectId={delay.id} effectReductions={new Map()} onSelectChannel={vi.fn()} onSelectEffect={vi.fn()} onAdd={vi.fn()} onUpdate={onUpdate} onToggleBypass={vi.fn()} onRemove={vi.fn()} onRestore={vi.fn()} onMove={vi.fn()} />)

    expect(screen.getByText('Note division')).toBeInTheDocument()
    const select = screen.getByRole('combobox', { name: /Note division/ })
    fireEvent.change(select, { target: { value: '1/16' } })
    expect(onUpdate).toHaveBeenCalled()
  })

  it('renders delay with ping-pong toggle and tempo sync off', () => {
    const delay = createDefaultEffect('delay')
    const channel: ChannelState = { channelIndex: 0, gain: 0.8, pan: 0, muted: false, solo: false, effects: [delay] }
    render(<EffectsWorkspace channels={[channel]} selectedChannelIndex={0} selectedEffectId={delay.id} effectReductions={new Map()} onSelectChannel={vi.fn()} onSelectEffect={vi.fn()} onAdd={vi.fn()} onUpdate={vi.fn()} onToggleBypass={vi.fn()} onRemove={vi.fn()} onRestore={vi.fn()} onMove={vi.fn()} />)

    expect(screen.getByRole('slider', { name: 'Time' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Feedback' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Mix' })).toBeInTheDocument()
  })
})
