import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ChannelEffects from './ChannelEffects'
import { createDefaultEffect } from '../engine/effects'

describe('ChannelEffects', () => {
  it('opens the channel FX workspace and reports slot usage', () => {
    const onOpen = vi.fn()
    render(<ChannelEffects channelIndex={1} effects={[createDefaultEffect('delay')]} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open channel 2 effects, 1 of 4 used' }))
    expect(onOpen).toHaveBeenCalledWith(1)
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('shows an all-bypassed state only when the non-empty chain is bypassed', () => {
    const effect = { ...createDefaultEffect('reverb'), bypassed: true }
    const { rerender } = render(<ChannelEffects channelIndex={0} effects={[effect]} onOpen={vi.fn()} />)
    expect(screen.getByRole('button')).toHaveClass('channel-fx-button-bypassed')
    rerender(<ChannelEffects channelIndex={0} effects={[]} onOpen={vi.fn()} />)
    expect(screen.getByRole('button')).not.toHaveClass('channel-fx-button-bypassed')
  })
})
