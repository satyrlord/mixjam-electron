import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import EffectsWorkspace from './EffectsWorkspace'
import { createDefaultEffect, type EffectSlot } from '../engine/effects'
import type { ChannelState } from '../hooks/useMixer'

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
    fireEvent.click(screen.getByText('Add effect'))
    fireEvent.click(screen.getByRole('button', { name: /Delay/ }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Bypass Compressor' }))
    expect(screen.getByRole('button', { name: 'Enable Compressor' })).toBeInTheDocument()
    fireEvent.click(screen.getByText('Actions'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove effect' }))
    expect(screen.getByRole('status')).toHaveTextContent('Compressor removed')
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByRole('heading', { name: 'Compressor' })).toBeInTheDocument()
  })

  it('shows the no-channel empty state', () => {
    render(<EffectsWorkspace channels={[]} selectedChannelIndex={null} selectedEffectId={null} effectReductions={new Map()} onSelectEffect={vi.fn()} onAdd={vi.fn()} onUpdate={vi.fn()} onToggleBypass={vi.fn()} onRemove={vi.fn()} onRestore={vi.fn()} onMove={vi.fn()} />)
    expect(screen.getByText('No mixer channels')).toBeInTheDocument()
  })
})
