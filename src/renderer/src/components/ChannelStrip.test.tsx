import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ChannelStrip from './ChannelStrip'

const DEFAULT_PROPS = {
  channelIndex: 0,
  label: 'Kick',
  gain: 0.8,
  pan: 0,
  muted: false,
  solo: false,
  levelDb: -20,
  peakDb: -15,
  onSetGain: vi.fn(),
  onSetPan: vi.fn(),
  onToggleMute: vi.fn(),
  onToggleSolo: vi.fn(),
  onRemove: vi.fn()
}

describe('ChannelStrip', () => {
  it('renders label, volume slider, pan slider, mute/solo/remove buttons', () => {
    render(<ChannelStrip {...DEFAULT_PROPS} />)
    expect(screen.getByText('Kick')).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Channel 1 Pan' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mute channel 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Solo channel 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove channel 1' })).toBeInTheDocument()
  })

  it('volume slider fires onSetGain with 0..1 value', () => {
    const onSetGain = vi.fn()
    render(<ChannelStrip {...DEFAULT_PROPS} onSetGain={onSetGain} />)

    const slider = screen.getByRole('slider', { name: 'Channel 1 Volume' })
    fireEvent.change(slider, { target: { value: '50' } })
    expect(onSetGain).toHaveBeenCalledWith(0, 0.5)
  })

  it('pan slider fires onSetPan on mouse drag', () => {
    const onSetPan = vi.fn()
    render(<ChannelStrip {...DEFAULT_PROPS} onSetPan={onSetPan} />)

    const panSlider = screen.getByRole('slider', { name: 'Channel 1 Pan' })
    fireEvent.mouseDown(panSlider, { clientX: 100 })
    // Drag right
    fireEvent.mouseMove(window, { clientX: 200 })
    expect(onSetPan).toHaveBeenCalledWith(0, expect.any(Number))
    const calledPan = onSetPan.mock.calls[0]![1] as number
    expect(calledPan).toBeGreaterThan(0)
    expect(calledPan).toBeLessThanOrEqual(1)

    // Release
    fireEvent.mouseUp(window)
  })

  it('mute button fires onToggleMute', () => {
    const onToggleMute = vi.fn()
    render(<ChannelStrip {...DEFAULT_PROPS} onToggleMute={onToggleMute} />)

    fireEvent.click(screen.getByRole('button', { name: 'Mute channel 1' }))
    expect(onToggleMute).toHaveBeenCalledWith(0)
  })

  it('solo button fires onToggleSolo', () => {
    const onToggleSolo = vi.fn()
    render(<ChannelStrip {...DEFAULT_PROPS} onToggleSolo={onToggleSolo} />)

    fireEvent.click(screen.getByRole('button', { name: 'Solo channel 1' }))
    expect(onToggleSolo).toHaveBeenCalledWith(0)
  })

  it('remove button fires onRemove', () => {
    const onRemove = vi.fn()
    render(<ChannelStrip {...DEFAULT_PROPS} onRemove={onRemove} />)

    fireEvent.click(screen.getByRole('button', { name: 'Remove channel 1' }))
    expect(onRemove).toHaveBeenCalledWith(0)
  })

  it('shows muted state with active CSS class when muted is true', () => {
    render(<ChannelStrip {...DEFAULT_PROPS} muted />)
    const muteBtn = screen.getByRole('button', { name: 'Mute channel 1' })
    expect(muteBtn.className).toContain('mixer-channel-m-active')
    expect(muteBtn).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows soloed state with active CSS class when solo is true', () => {
    render(<ChannelStrip {...DEFAULT_PROPS} solo />)
    const soloBtn = screen.getByRole('button', { name: 'Solo channel 1' })
    expect(soloBtn.className).toContain('mixer-channel-s-active')
    expect(soloBtn).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders meter fill with green color when level is below -12 dB', () => {
    render(<ChannelStrip {...DEFAULT_PROPS} levelDb={-20} />)
    const meterFill = document.querySelector('.mixer-channel-meter-fill')
    expect(meterFill).toBeInTheDocument()
    expect(meterFill).toHaveStyle({ background: 'var(--meter-green)' })
  })

  it('renders meter fill with yellow color when level is between -12 and -3 dB', () => {
    render(<ChannelStrip {...DEFAULT_PROPS} levelDb={-6} />)
    const meterFill = document.querySelector('.mixer-channel-meter-fill')
    expect(meterFill).toHaveStyle({ background: 'var(--meter-yellow)' })
  })

  it('renders meter fill with red color when level is above -3 dB', () => {
    render(<ChannelStrip {...DEFAULT_PROPS} levelDb={0} />)
    const meterFill = document.querySelector('.mixer-channel-meter-fill')
    expect(meterFill).toHaveStyle({ background: 'var(--meter-red)' })
  })

  it('renders pan slider with correct aria-valuenow', () => {
    render(<ChannelStrip {...DEFAULT_PROPS} pan={0.5} />)
    const panSlider = screen.getByRole('slider', { name: 'Channel 1 Pan' })
    expect(panSlider).toHaveAttribute('aria-valuenow', '0.5')
  })

  it('cleans up window listeners on unmount during pan drag', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
    render(<ChannelStrip {...DEFAULT_PROPS} />)

    const panSlider = screen.getByRole('slider', { name: 'Channel 1 Pan' })
    fireEvent.mouseDown(panSlider, { clientX: 100 })
    fireEvent.mouseUp(window)

    expect(removeEventListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function))
    expect(removeEventListenerSpy).toHaveBeenCalledWith('mouseup', expect.any(Function))

    removeEventListenerSpy.mockRestore()
  })
})
