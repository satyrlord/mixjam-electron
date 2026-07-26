import { createEvent, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RotaryControl, RotaryDial } from './RotaryField'
import { clamp } from '../lib/sample-utils'

// Renders the shared rotary the way its live callers do (ChannelStrip, LaneRow,
// MasterBusStrip, MixerFxSlot): RotaryControl wrapping a RotaryDial, with the
// caller supplying the formatted readout. `percent` mirrors the 0..1 controls
// that display whole percentages.
function Rotary({
  label = 'Time',
  value = 375,
  defaultValue = 375,
  min = 0,
  max = 2000,
  step = 1,
  suffix = ' ms',
  percent = false,
  onChange = vi.fn()
}: {
  label?: string
  value?: number
  defaultValue?: number
  min?: number
  max?: number
  step?: number
  suffix?: string
  percent?: boolean
  onChange?: (value: number) => void
}) {
  const displayValue = percent ? Math.round(value * 100) : Number(value.toFixed(step < 1 ? 1 : 0))
  const normalized = (input: number) => (max === min ? 0 : clamp((input - min) / (max - min), 0, 1))
  return (
    <RotaryControl
      className="rotary-control"
      label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      valueText={`${displayValue}${percent ? '%' : suffix}`}
      defaultValue={defaultValue}
      ariaMultiplier={percent ? 100 : 1}
      onChange={onChange}
    >
      <RotaryDial value={normalized(value)} defaultValue={normalized(defaultValue)} />
    </RotaryControl>
  )
}

describe('RotaryControl', () => {
  it('renders the dial parts and the current value', () => {
    render(<Rotary />)
    const slider = screen.getByRole('slider', { name: 'Time' })
    expect(slider).toBeInTheDocument()
    const dial = slider.querySelector('svg.rotary-dial')
    expect(dial).toHaveAttribute('data-rotary-mode', 'unipolar')
    for (const part of ['track', 'value', 'default-marker', 'cap', 'pointer']) {
      expect(dial?.querySelector(`.rotary-dial-${part}`)).toBeInTheDocument()
    }
    expect(slider).toHaveAttribute('aria-valuetext', '375 ms')
  })

  it('reports percent variants through the aria multiplier', () => {
    render(<Rotary value={0.35} defaultValue={0.35} min={0} max={1} step={0.01} suffix="" percent />)
    const slider = screen.getByRole('slider')
    expect(slider).toHaveAttribute('aria-valuenow', '35')
    expect(slider).toHaveAttribute('aria-valuetext', '35%')
  })

  it('commits on double-click to default value', () => {
    const onChange = vi.fn()
    render(<Rotary value={500} onChange={onChange} />)
    fireEvent.doubleClick(screen.getByRole('slider', { name: 'Time' }))
    expect(onChange).toHaveBeenCalledWith(375)
  })

  it('increments on ArrowUp', () => {
    const onChange = vi.fn()
    render(<Rotary onChange={onChange} />)
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Time' }), { key: 'ArrowUp' })
    expect(onChange).toHaveBeenCalledWith(376)
  })

  it('decrements on ArrowDown', () => {
    const onChange = vi.fn()
    render(<Rotary onChange={onChange} />)
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Time' }), { key: 'ArrowDown' })
    expect(onChange).toHaveBeenCalledWith(374)
  })

  it('increments on ArrowRight', () => {
    const onChange = vi.fn()
    render(<Rotary onChange={onChange} />)
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Time' }), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith(376)
  })

  it('decrements on ArrowLeft', () => {
    const onChange = vi.fn()
    render(<Rotary onChange={onChange} />)
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Time' }), { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenCalledWith(374)
  })

  it('increments on wheel up and prevents page scrolling', () => {
    const onChange = vi.fn()
    render(<Rotary onChange={onChange} />)
    const slider = screen.getByRole('slider', { name: 'Time' })
    const event = createEvent.wheel(slider, { deltaY: -100, cancelable: true })

    fireEvent(slider, event)

    expect(event.defaultPrevented).toBe(true)
    expect(onChange).toHaveBeenCalledWith(376)
  })

  it('keeps one native wheel listener and reads the latest committed inputs', () => {
    const firstOnChange = vi.fn()
    const latestOnChange = vi.fn()
    const addEventListener = vi.spyOn(EventTarget.prototype, 'addEventListener')
    try {
      const control = (value: number, onChange: (next: number) => void) => (
        <RotaryControl
          className="rotary-control"
          label="Stable wheel"
          value={value}
          min={0}
          max={20}
          step={1}
          valueText={String(value)}
          defaultValue={0}
          onChange={onChange}
        />
      )
      const { rerender } = render(control(5, firstOnChange))
      const slider = screen.getByRole('slider', { name: 'Stable wheel' })
      const wheelBindingCount = () => addEventListener.mock.calls.filter(
        (call, index) => addEventListener.mock.instances[index] === slider && call[0] === 'wheel'
      ).length

      expect(wheelBindingCount()).toBe(1)
      rerender(control(10, latestOnChange))
      expect(wheelBindingCount()).toBe(1)

      fireEvent.wheel(slider, { deltaY: -100 })
      expect(firstOnChange).not.toHaveBeenCalled()
      expect(latestOnChange).toHaveBeenCalledWith(11)
    } finally {
      addEventListener.mockRestore()
    }
  })

  it('decrements on wheel down', () => {
    const onChange = vi.fn()
    render(<Rotary onChange={onChange} />)

    fireEvent.wheel(screen.getByRole('slider', { name: 'Time' }), { deltaY: 100 })

    expect(onChange).toHaveBeenCalledWith(374)
  })

  it('applies fine adjustment with Shift+wheel', () => {
    const onChange = vi.fn()
    render(<Rotary label="Mix" value={0.35} defaultValue={0.3} min={0} max={1} step={0.01} suffix="" percent onChange={onChange} />)

    fireEvent.wheel(screen.getByRole('slider', { name: 'Mix' }), { deltaY: -100, shiftKey: true })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0]![0]).toBeCloseTo(0.351)
  })

  it('ignores wheel events without vertical movement', () => {
    const onChange = vi.fn()
    render(<Rotary onChange={onChange} />)
    const slider = screen.getByRole('slider', { name: 'Time' })
    const event = createEvent.wheel(slider, { deltaY: 0 })

    fireEvent(slider, event)

    expect(event.defaultPrevented).toBe(false)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('jumps to min on Home', () => {
    const onChange = vi.fn()
    render(<Rotary onChange={onChange} />)
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Time' }), { key: 'Home' })
    expect(onChange).toHaveBeenCalledWith(0)
  })

  it('jumps to max on End', () => {
    const onChange = vi.fn()
    render(<Rotary onChange={onChange} />)
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Time' }), { key: 'End' })
    expect(onChange).toHaveBeenCalledWith(2000)
  })

  it('applies fine step with Shift+ArrowUp on percent variant', () => {
    const onChange = vi.fn()
    render(<Rotary label="Mix" value={0.35} defaultValue={0.3} min={0} max={1} step={0.01} suffix="" percent onChange={onChange} />)
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Mix' }), { key: 'ArrowUp', shiftKey: true })
    expect(onChange).toHaveBeenCalledTimes(1)
    const called = onChange.mock.calls[0]![0] as number
    expect(called).toBeGreaterThan(0.35)
    expect(called).toBeLessThan(0.36)
  })

  it('clamps value at min', () => {
    const onChange = vi.fn()
    render(<Rotary value={0} onChange={onChange} />)
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Time' }), { key: 'ArrowDown' })
    expect(onChange).toHaveBeenCalledWith(0)
  })

  it('clamps value at max', () => {
    const onChange = vi.fn()
    render(<Rotary value={2000} onChange={onChange} />)
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Time' }), { key: 'ArrowUp' })
    expect(onChange).toHaveBeenCalledWith(2000)
  })

  it('ignores non-left button pointer down', () => {
    render(<Rotary />)
    const slider = screen.getByRole('slider', { name: 'Time' })
    fireEvent.pointerDown(slider, { button: 1, pointerId: 1 })
  })

  it('triggers pointerDown and pointerUp without crashing', () => {
    render(<Rotary />)
    const slider = screen.getByRole('slider', { name: 'Time' })

    fireEvent.pointerDown(slider, { button: 0, pointerId: 1, clientY: 200 })
    fireEvent.pointerMove(slider, { pointerId: 1, clientY: 100 })
    fireEvent.pointerUp(slider, { pointerId: 1 })
  })

  it('does not move on pointer move without prior pointer down', () => {
    const onChange = vi.fn()
    render(<Rotary onChange={onChange} />)
    const slider = screen.getByRole('slider', { name: 'Time' })

    fireEvent.pointerMove(slider, { pointerId: 2, clientY: 100 })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('handles shiftKey in key down for fine adjustment', () => {
    const onChange = vi.fn()
    render(<Rotary onChange={onChange} />)
    const slider = screen.getByRole('slider', { name: 'Time' })

    fireEvent.keyDown(slider, { key: 'ArrowUp', shiftKey: true })
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
