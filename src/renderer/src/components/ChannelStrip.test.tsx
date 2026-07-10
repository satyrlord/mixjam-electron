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
  effects: [],
  onSetGain: vi.fn(),
  onSetPan: vi.fn(),
  onToggleMute: vi.fn(),
  onToggleSolo: vi.fn(),
  onRemove: vi.fn(),
  onAddEffect: vi.fn(),
  onUpdateEffect: vi.fn(),
  onToggleEffectBypass: vi.fn(),
  onRemoveEffect: vi.fn(),
  onMoveEffect: vi.fn()
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

  // --- 2026-07-07 amendments (spec-007 AC-018, AC-020..023) ---

  it('right-click on pan cycles C to 100% R to 100% L to C and suppresses the menu (AC-018)', () => {
    const onSetPan = vi.fn()
    const { rerender } = render(<ChannelStrip {...DEFAULT_PROPS} pan={0.4} onSetPan={onSetPan} />)
    const panKnob = () => screen.getByRole('slider', { name: 'Channel 1 Pan' })

    // Any freely-dragged position recenters first.
    const menuShown = fireEvent.contextMenu(panKnob())
    expect(menuShown).toBe(false) // preventDefault fired
    expect(onSetPan).toHaveBeenLastCalledWith(0, 0)

    rerender(<ChannelStrip {...DEFAULT_PROPS} pan={0} onSetPan={onSetPan} />)
    fireEvent.contextMenu(panKnob())
    expect(onSetPan).toHaveBeenLastCalledWith(0, 1)

    rerender(<ChannelStrip {...DEFAULT_PROPS} pan={1} onSetPan={onSetPan} />)
    fireEvent.contextMenu(panKnob())
    expect(onSetPan).toHaveBeenLastCalledWith(0, -1)

    rerender(<ChannelStrip {...DEFAULT_PROPS} pan={-1} onSetPan={onSetPan} />)
    fireEvent.contextMenu(panKnob())
    expect(onSetPan).toHaveBeenLastCalledWith(0, 0)
  })

  it('pan knob is focusable and arrow keys adjust pan by 0.05 clamped (AC-021)', () => {
    const onSetPan = vi.fn()
    const { rerender } = render(<ChannelStrip {...DEFAULT_PROPS} pan={0} onSetPan={onSetPan} />)
    const panKnob = () => screen.getByRole('slider', { name: 'Channel 1 Pan' })

    expect(panKnob()).toHaveAttribute('tabindex', '0')

    fireEvent.keyDown(panKnob(), { key: 'ArrowRight' })
    expect(onSetPan).toHaveBeenLastCalledWith(0, 0.05)
    fireEvent.keyDown(panKnob(), { key: 'ArrowLeft' })
    expect(onSetPan).toHaveBeenLastCalledWith(0, -0.05)
    // ArrowUp/ArrowDown mirror Right/Left (WAI-ARIA slider pattern).
    fireEvent.keyDown(panKnob(), { key: 'ArrowUp' })
    expect(onSetPan).toHaveBeenLastCalledWith(0, 0.05)
    fireEvent.keyDown(panKnob(), { key: 'ArrowDown' })
    expect(onSetPan).toHaveBeenLastCalledWith(0, -0.05)

    // Home centers, End goes hard right.
    fireEvent.keyDown(panKnob(), { key: 'Home' })
    expect(onSetPan).toHaveBeenLastCalledWith(0, 0)
    fireEvent.keyDown(panKnob(), { key: 'End' })
    expect(onSetPan).toHaveBeenLastCalledWith(0, 1)

    // Clamped at the extremes.
    rerender(<ChannelStrip {...DEFAULT_PROPS} pan={1} onSetPan={onSetPan} />)
    fireEvent.keyDown(panKnob(), { key: 'ArrowRight' })
    expect(onSetPan).toHaveBeenLastCalledWith(0, 1)

    // Unrelated keys are ignored.
    onSetPan.mockClear()
    fireEvent.keyDown(panKnob(), { key: 'a' })
    expect(onSetPan).not.toHaveBeenCalled()
  })

  it('right-click cycles from key-step residue near center (AC-018 epsilon)', () => {
    const onSetPan = vi.fn()
    // ArrowRight×3 then ArrowLeft×3 lands on ~1.4e-17, which reads as Center but
    // is not exactly 0; the first right-click must still step to 100% R.
    const residue = 1.3877787807814457e-17
    render(<ChannelStrip {...DEFAULT_PROPS} pan={residue} onSetPan={onSetPan} />)
    fireEvent.contextMenu(screen.getByRole('slider', { name: 'Channel 1 Pan' }))
    expect(onSetPan).toHaveBeenLastCalledWith(0, 1)
  })

  it('pan knob exposes aria-valuetext for its position (AC-021)', () => {
    const { rerender } = render(<ChannelStrip {...DEFAULT_PROPS} pan={0} />)
    const panKnob = () => screen.getByRole('slider', { name: 'Channel 1 Pan' })

    expect(panKnob()).toHaveAttribute('aria-valuetext', 'Center')
    rerender(<ChannelStrip {...DEFAULT_PROPS} pan={-0.4} />)
    expect(panKnob()).toHaveAttribute('aria-valuetext', '40% left')
    rerender(<ChannelStrip {...DEFAULT_PROPS} pan={1} />)
    expect(panKnob()).toHaveAttribute('aria-valuetext', '100% right')
  })

  it('muted strip gets the dimming class on its root (AC-022)', () => {
    render(<ChannelStrip {...DEFAULT_PROPS} muted />)
    expect(document.querySelector('.mixer-channel-strip')!.className)
      .toContain('mixer-channel-strip-muted')
  })

  it('shows the gain readout only while the fader is being dragged (AC-023)', () => {
    render(<ChannelStrip {...DEFAULT_PROPS} gain={0.8} />)
    const volSlider = screen.getByRole('slider', { name: 'Channel 1 Volume' })

    expect(document.querySelector('.mixer-channel-vol-readout')).not.toBeInTheDocument()
    fireEvent.pointerDown(volSlider)
    expect(screen.getByText('80%')).toBeInTheDocument()
    fireEvent.pointerUp(volSlider)
    expect(document.querySelector('.mixer-channel-vol-readout')).not.toBeInTheDocument()
  })

  it('renders the unity tick mark (AC-023)', () => {
    render(<ChannelStrip {...DEFAULT_PROPS} />)
    expect(document.querySelector('.mixer-channel-unity-tick')).toBeInTheDocument()
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
