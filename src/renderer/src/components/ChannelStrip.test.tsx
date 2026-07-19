import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ChannelStrip from './ChannelStrip'

const DEFAULT_PROPS = {
  laneId: 'lane-kick',
  channelIndex: 0,
  label: 'Kick',
  gain: 0.8,
  pan: 0,
  muted: false,
  sends: [0, 0, 0, 0] as const,
  sendModuleNames: ['Empty', 'Delay', 'Empty', 'Empty'] as const,
  levelDb: -20,
  peakDb: -15,
  onSetGain: vi.fn(),
  onSetPan: vi.fn(),
  onSetSend: vi.fn(),
  onSelect: vi.fn(),
  onGestureStart: vi.fn(),
  onGestureEnd: vi.fn()
}

describe('ChannelStrip', () => {
  it('renders label, volume slider, and pan slider', () => {
    render(<ChannelStrip {...DEFAULT_PROPS} />)
    expect(screen.getByText('Kick')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kick' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Channel 1 Pan' })).toBeInTheDocument()
  })

  it('volume slider fires onSetGain with normalized values', () => {
    const onSetGain = vi.fn()
    render(<ChannelStrip {...DEFAULT_PROPS} onSetGain={onSetGain} />)

    const slider = screen.getByRole('slider', { name: 'Channel 1 Volume' })
    fireEvent.keyDown(slider, { key: 'Home' })
    expect(onSetGain).toHaveBeenCalledWith(0, 0)
  })

  it('uses the shared vertical fader and directional keyboard contract', () => {
    const onSetGain = vi.fn()
    render(<ChannelStrip {...DEFAULT_PROPS} onSetGain={onSetGain} />)
    const slider = screen.getByRole('slider', { name: 'Channel 1 Volume' })

    expect(slider).toHaveAttribute('aria-orientation', 'vertical')
    expect(slider.closest('.vertical-fader')).not.toBeNull()
    fireEvent.keyDown(slider, { key: 'ArrowUp' })
    expect(onSetGain).toHaveBeenLastCalledWith(0, 0.81)
    fireEvent.keyDown(slider, { key: 'Home' })
    expect(onSetGain).toHaveBeenLastCalledWith(0, 0)
    fireEvent.keyDown(slider, { key: 'End' })
    expect(onSetGain).toHaveBeenLastCalledWith(0, 1)
  })

  it('pan slider fires onSetPan on pointer drag', () => {
    const onSetPan = vi.fn()
    render(<ChannelStrip {...DEFAULT_PROPS} onSetPan={onSetPan} />)

    const panSlider = screen.getByRole('slider', { name: 'Channel 1 Pan' })
    fireEvent.pointerDown(panSlider, { button: 0, pointerId: 1, pointerType: 'mouse', clientX: 100 })
    fireEvent.pointerMove(panSlider, { pointerId: 1, pointerType: 'mouse', clientX: 200 })
    expect(onSetPan).toHaveBeenCalledWith(0, expect.any(Number))
    const calledPan = onSetPan.mock.calls[0]![1] as number
    expect(calledPan).toBeGreaterThan(0)
    expect(calledPan).toBeLessThanOrEqual(1)

    fireEvent.pointerUp(panSlider, { pointerId: 1, pointerType: 'mouse' })
  })

  it('shows muted state with dimming CSS class on the strip root', () => {
    render(<ChannelStrip {...DEFAULT_PROPS} muted />)
    expect(document.querySelector('.mixer-channel-strip')!.className)
      .toContain('mixer-channel-strip-muted')
  })

  it('renders meter fill with green color when level is below -12 dB', () => {
    render(<ChannelStrip {...DEFAULT_PROPS} levelDb={-20} />)
    const meterFill = document.querySelector('.mixer-channel-meter-fill')
    expect(meterFill).toBeInTheDocument()
    expect(meterFill).toHaveStyle({ background: 'var(--meter-green)' })
    expect(document.querySelector('.vertical-meter-track')).toBeInTheDocument()
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

  it('right-click on pan cycles C to 100% R to 100% L to C and suppresses the menu', () => {
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

  it('pan knob is focusable and arrow keys adjust pan by 0.05 clamped', () => {
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

  it('mouse wheel adjusts the channel pan knob by 0.05', () => {
    const onSetPan = vi.fn()
    render(<ChannelStrip {...DEFAULT_PROPS} pan={0} onSetPan={onSetPan} />)
    const panKnob = screen.getByRole('slider', { name: 'Channel 1 Pan' })

    fireEvent.wheel(panKnob, { deltaY: -100 })
    expect(onSetPan).toHaveBeenLastCalledWith(0, 0.05)

    fireEvent.wheel(panKnob, { deltaY: 100 })
    expect(onSetPan).toHaveBeenLastCalledWith(0, -0.05)
  })

  it('right-click cycles from key-step residue near center', () => {
    const onSetPan = vi.fn()
    // ArrowRight×3 then ArrowLeft×3 lands on ~1.4e-17, which reads as Center but
    // is not exactly 0; the first right-click must still step to 100% R.
    const residue = 1.3877787807814457e-17
    render(<ChannelStrip {...DEFAULT_PROPS} pan={residue} onSetPan={onSetPan} />)
    fireEvent.contextMenu(screen.getByRole('slider', { name: 'Channel 1 Pan' }))
    expect(onSetPan).toHaveBeenLastCalledWith(0, 1)
  })

  it('pan knob exposes aria-valuetext for its position', () => {
    const { rerender } = render(<ChannelStrip {...DEFAULT_PROPS} pan={0} />)
    const panKnob = () => screen.getByRole('slider', { name: 'Channel 1 Pan' })

    expect(panKnob()).toHaveAttribute('aria-valuetext', 'Center')
    rerender(<ChannelStrip {...DEFAULT_PROPS} pan={-0.4} />)
    expect(panKnob()).toHaveAttribute('aria-valuetext', '40% left')
    rerender(<ChannelStrip {...DEFAULT_PROPS} pan={1} />)
    expect(panKnob()).toHaveAttribute('aria-valuetext', '100% right')
  })

  it('muted strip gets the dimming class on its root', () => {
    render(<ChannelStrip {...DEFAULT_PROPS} muted />)
    expect(document.querySelector('.mixer-channel-strip')!.className)
      .toContain('mixer-channel-strip-muted')
  })

  it('shows the gain readout only while the fader is being dragged', () => {
    render(<ChannelStrip {...DEFAULT_PROPS} gain={0.8} />)
    const volSlider = screen.getByRole('slider', { name: 'Channel 1 Volume' })

    expect(document.querySelector('.mixer-channel-vol-readout')).not.toBeInTheDocument()
    fireEvent.pointerDown(volSlider)
    expect(screen.getByText('80%')).toBeInTheDocument()
    fireEvent.pointerUp(volSlider)
    expect(document.querySelector('.mixer-channel-vol-readout')).not.toBeInTheDocument()
  })

  it('renders the unity tick mark', () => {
    render(<ChannelStrip {...DEFAULT_PROPS} />)
    expect(document.querySelector('.mixer-channel-unity-tick')).toBeInTheDocument()
  })

  it('uses pointer capture instead of window-level drag listeners', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    render(<ChannelStrip {...DEFAULT_PROPS} />)

    const panSlider = screen.getByRole('slider', { name: 'Channel 1 Pan' })
    fireEvent.pointerDown(panSlider, { button: 0, pointerId: 1, pointerType: 'mouse', clientX: 100 })
    fireEvent.pointerUp(panSlider, { pointerId: 1, pointerType: 'mouse' })

    expect(addEventListenerSpy).not.toHaveBeenCalledWith('mousemove', expect.any(Function))
    expect(addEventListenerSpy).not.toHaveBeenCalledWith('mouseup', expect.any(Function))

    addEventListenerSpy.mockRestore()
  })

  it('select button fires onSelect with channel index', () => {
    const onSelect = vi.fn()
    render(<ChannelStrip {...DEFAULT_PROPS} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: 'Kick' }))
    expect(onSelect).toHaveBeenCalledWith('lane-kick')
  })

  it('select button has aria-pressed matching selected prop', () => {
    const { rerender } = render(<ChannelStrip {...DEFAULT_PROPS} selected={false} />)
    expect(screen.getByRole('button', { name: 'Kick' })).toHaveAttribute('aria-pressed', 'false')
    rerender(<ChannelStrip {...DEFAULT_PROPS} selected />)
    expect(screen.getByRole('button', { name: 'Kick' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders rotary controls for all four sends and disabled decorative EQ', () => {
    render(<ChannelStrip {...DEFAULT_PROPS} sends={[0, 0.3, 0, 0]} />)
    expect(screen.getByRole('group', { name: 'Kick Sends' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Kick Send 1' })).toHaveAttribute('aria-valuenow', '0')
    expect(screen.getByRole('slider', { name: 'Kick Send 2' })).toHaveAttribute('aria-valuenow', '30')
    expect(screen.getByRole('slider', { name: 'Kick Send 3' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Kick Send 4' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'EQ Power unavailable' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Treble unavailable' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Bass unavailable' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'M' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'S' })).toBeNull()
  })

  it('uses the shared SVG rotary visual for sends and bipolar pan', () => {
    render(<ChannelStrip {...DEFAULT_PROPS} sends={[0, 0.3, 0.6, 1]} pan={-0.4} />)

    for (const slot of [1, 2, 3, 4]) {
      const send = screen.getByRole('slider', { name: `Kick Send ${slot}` })
      expect(send.querySelector('svg.rotary-dial')).toHaveAttribute('data-rotary-mode', 'unipolar')
    }
    const pan = screen.getByRole('slider', { name: 'Channel 1 Pan' })
    expect(pan.querySelector('svg.rotary-dial')).toHaveAttribute('data-rotary-mode', 'bipolar')
  })

  it('wraps a multi-update pan drag in one Mixer gesture', () => {
    const onGestureStart = vi.fn()
    const onGestureEnd = vi.fn()
    const onSetPan = vi.fn()
    render(
      <ChannelStrip
        {...DEFAULT_PROPS}
        onGestureStart={onGestureStart}
        onGestureEnd={onGestureEnd}
        onSetPan={onSetPan}
      />
    )
    const pan = screen.getByRole('slider', { name: 'Channel 1 Pan' })
    fireEvent.pointerDown(pan, { button: 0, pointerId: 4, clientX: 100 })
    fireEvent.pointerMove(pan, { pointerId: 4, clientX: 130 })
    fireEvent.pointerMove(pan, { pointerId: 4, clientX: 160 })
    fireEvent.pointerUp(pan, { pointerId: 4 })

    expect(onSetPan).toHaveBeenCalledTimes(2)
    expect(onGestureStart).toHaveBeenCalledOnce()
    expect(onGestureEnd).toHaveBeenCalledOnce()
  })

  it('adjusts send levels through the shared rotary keyboard contract', () => {
    const onSetSend = vi.fn()
    render(
      <ChannelStrip
        {...DEFAULT_PROPS}
        sends={[0, 1, 0, 0]}
        onSetSend={onSetSend}
      />
    )

    fireEvent.keyDown(screen.getByRole('slider', { name: 'Kick Send 1' }), { key: 'ArrowUp' })
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Kick Send 2' }), { key: 'Home' })
    expect(onSetSend.mock.calls).toEqual([[0, 0, 0.01], [0, 1, 0]])
  })

  it('renders controls in the documented order', () => {
    const { container } = render(<ChannelStrip {...DEFAULT_PROPS} />)
    const classes = Array.from(container.querySelector('.mixer-channel-strip')!.children)
      .map((element) => element.className)
    expect(classes).toEqual([
      'mixer-channel-label',
      'mixer-channel-sends',
      'mixer-channel-eq',
      'mixer-channel-pan',
      'vertical-fader vertical-fader-has-meter mixer-channel-vol-wrap'
    ])
  })
})
