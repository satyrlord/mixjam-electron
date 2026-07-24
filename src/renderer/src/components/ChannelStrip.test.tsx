import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createValueStore } from '../lib/value-store'
import ChannelStrip from './ChannelStrip'

const DEFAULT_PROPS = {
  laneId: 'lane-kick',
  channelIndex: 0,
  label: 'Kick',
  gain: 0.8,
  muted: false,
  sends: [0, 0, 0, 0] as const,
  sendModuleNames: ['Empty', 'Delay', 'Empty', 'Empty'] as const,
  meterStore: createValueStore({ levelDb: -20, peakDb: -15 }),
  onSetGain: vi.fn(),
  onSetSend: vi.fn(),
  onSelect: vi.fn(),
  onGestureStart: vi.fn(),
  onGestureEnd: vi.fn()
}

describe('ChannelStrip', () => {
  it('renders a zero-padded channel number, accessible lane label, sends, and volume slider', () => {
    render(<ChannelStrip {...DEFAULT_PROPS} />)
    expect(screen.getByText('01')).toBeInTheDocument()
    expect(screen.queryByText('Kick')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kick, channel 1' })).toBeInTheDocument()
    expect(screen.queryByRole('slider', { name: /Pan/ })).toBeNull()
    expect(screen.getByRole('slider', { name: 'Channel 1 Volume' })).toBeInTheDocument()
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

  it('shows muted state with dimming CSS class on the strip root', () => {
    render(<ChannelStrip {...DEFAULT_PROPS} muted />)
    expect(document.querySelector('.mixer-channel-strip')!.className)
      .toContain('mixer-channel-strip-muted')
  })

  it('renders meter fill with green color when level is below -12 dB', () => {
    render(<ChannelStrip {...DEFAULT_PROPS} meterStore={createValueStore({ levelDb: -20, peakDb: -15 })} />)
    const meterFill = document.querySelector('.mixer-channel-meter-fill')
    expect(meterFill).toBeInTheDocument()
    expect(meterFill).toHaveStyle({ background: 'var(--meter-green)' })
    expect(document.querySelector('.vertical-meter-track')).toBeInTheDocument()
  })

  it('renders meter fill with yellow color when level is between -12 and -3 dB', () => {
    render(<ChannelStrip {...DEFAULT_PROPS} meterStore={createValueStore({ levelDb: -6, peakDb: -6 })} />)
    const meterFill = document.querySelector('.mixer-channel-meter-fill')
    expect(meterFill).toHaveStyle({ background: 'var(--meter-yellow)' })
  })

  it('renders meter fill with red color when level is above -3 dB', () => {
    render(<ChannelStrip {...DEFAULT_PROPS} meterStore={createValueStore({ levelDb: 0, peakDb: 0 })} />)
    const meterFill = document.querySelector('.mixer-channel-meter-fill')
    expect(meterFill).toHaveStyle({ background: 'var(--meter-red)' })
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

    expect(addEventListenerSpy).not.toHaveBeenCalledWith('mousemove', expect.any(Function))
    expect(addEventListenerSpy).not.toHaveBeenCalledWith('mouseup', expect.any(Function))

    addEventListenerSpy.mockRestore()
  })

  it('select button fires onSelect with channel index', () => {
    const onSelect = vi.fn()
    render(<ChannelStrip {...DEFAULT_PROPS} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: 'Kick, channel 1' }))
    expect(onSelect).toHaveBeenCalledWith('lane-kick')
  })

  it('select button has aria-pressed matching selected prop', () => {
    const { rerender } = render(<ChannelStrip {...DEFAULT_PROPS} selected={false} />)
    expect(screen.getByRole('button', { name: 'Kick, channel 1' })).toHaveAttribute('aria-pressed', 'false')
    rerender(<ChannelStrip {...DEFAULT_PROPS} selected />)
    expect(screen.getByRole('button', { name: 'Kick, channel 1' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders rotary controls for all four sends with per-slot accents and no EQ group', () => {
    render(<ChannelStrip {...DEFAULT_PROPS} sends={[0, 0.3, 0, 0]} />)
    expect(screen.getByRole('group', { name: 'Kick Sends' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Kick Send 1' })).toHaveAttribute('aria-valuenow', '0')
    expect(screen.getByRole('slider', { name: 'Kick Send 2' })).toHaveAttribute('aria-valuenow', '30')
    expect(screen.getByRole('slider', { name: 'Kick Send 3' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Kick Send 4' })).toBeInTheDocument()
    const triggers = document.querySelectorAll('.mixer-send-tooltip-trigger')
    expect(triggers).toHaveLength(4)
    triggers.forEach((trigger, index) => {
      expect(trigger.getAttribute('style')).toContain(`--fx-accent-${index + 1}`)
    })
    // The REV 07 reference strip has no EQ section; the decorative group is gone.
    expect(document.querySelector('.mixer-channel-eq')).toBeNull()
    expect(screen.queryByRole('button', { name: 'M' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'S' })).toBeNull()
  })

  it('shows the derived channel number and fader-position dB readout', () => {
    const { rerender } = render(<ChannelStrip {...DEFAULT_PROPS} channelIndex={2} gain={0.8} />)
    expect(screen.getByText('03')).toBeInTheDocument()
    expect(screen.getByText('-2 dB')).toBeInTheDocument()
    rerender(<ChannelStrip {...DEFAULT_PROPS} channelIndex={2} gain={1} />)
    expect(screen.getByText('0 dB')).toBeInTheDocument()
    rerender(<ChannelStrip {...DEFAULT_PROPS} channelIndex={2} gain={0} />)
    expect(screen.getByText('−∞ dB')).toBeInTheDocument()
  })

  it('uses the full shared SVG rotary visual for sends', () => {
    render(<ChannelStrip {...DEFAULT_PROPS} sends={[0, 0.3, 0.6, 1]} />)

    for (const slot of [1, 2, 3, 4]) {
      const send = screen.getByRole('slider', { name: `Kick Send ${slot}` })
      const dial = send.querySelector('svg.rotary-dial')
      expect(dial).toHaveAttribute('data-rotary-mode', 'unipolar')
      expect(dial?.querySelectorAll('path, circle, line').length).toBeGreaterThan(3)
    }
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
      'mixer-channel-select',
      'mixer-channel-sends',
      'vertical-fader vertical-fader-has-meter vertical-fader-side-meter mixer-channel-vol-wrap',
      'mixer-channel-db'
    ])
  })
})
