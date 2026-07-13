import { createEvent, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RotaryField, ToggleField } from './RotaryField'

describe('ToggleField', () => {
  it('renders unchecked and toggles on change', () => {
    const onChange = vi.fn()
    render(<ToggleField label="Tempo sync" help="Locks echo timing" checked={false} onChange={onChange} />)

    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).not.toBeChecked()

    fireEvent.click(checkbox)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('renders checked and toggles off', () => {
    const onChange = vi.fn()
    render(<ToggleField label="Tempo sync" help="Locks echo timing" checked={true} onChange={onChange} />)

    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).toBeChecked()

    fireEvent.click(checkbox)
    expect(onChange).toHaveBeenCalledWith(false)
  })
})

describe('RotaryField', () => {
  const defaultProps = {
    label: 'Time',
    help: 'Controls how long the echo waits.',
    value: 375,
    defaultValue: 375,
    min: 0,
    max: 2000,
    step: 1,
    suffix: ' ms',
    onChange: vi.fn()
  } as const

  it('renders with the current value', () => {
    render(<RotaryField {...defaultProps} />)
    expect(screen.getByRole('slider', { name: 'Time' })).toBeInTheDocument()
    expect(screen.getByText('375 ms')).toBeInTheDocument()
  })

  it('renders with percent display', () => {
    render(<RotaryField {...defaultProps} value={0.35} defaultValue={0.35} min={0} max={1} step={0.01} suffix="" percent onChange={vi.fn()} />)
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '35')
    expect(screen.getByText('35%')).toBeInTheDocument()
  })

  it('commits on double-click to default value', () => {
    const onChange = vi.fn()
    render(<RotaryField {...defaultProps} value={500} onChange={onChange} />)
    fireEvent.doubleClick(screen.getByRole('slider', { name: 'Time' }))
    expect(onChange).toHaveBeenCalledWith(375)
  })

  it('increments on ArrowUp', () => {
    const onChange = vi.fn()
    render(<RotaryField {...defaultProps} onChange={onChange} />)
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Time' }), { key: 'ArrowUp' })
    expect(onChange).toHaveBeenCalledWith(376)
  })

  it('decrements on ArrowDown', () => {
    const onChange = vi.fn()
    render(<RotaryField {...defaultProps} onChange={onChange} />)
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Time' }), { key: 'ArrowDown' })
    expect(onChange).toHaveBeenCalledWith(374)
  })

  it('increments on ArrowRight', () => {
    const onChange = vi.fn()
    render(<RotaryField {...defaultProps} onChange={onChange} />)
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Time' }), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith(376)
  })

  it('decrements on ArrowLeft', () => {
    const onChange = vi.fn()
    render(<RotaryField {...defaultProps} onChange={onChange} />)
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Time' }), { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenCalledWith(374)
  })

  it('increments on wheel up and prevents page scrolling', () => {
    const onChange = vi.fn()
    render(<RotaryField {...defaultProps} onChange={onChange} />)
    const slider = screen.getByRole('slider', { name: 'Time' })
    const event = createEvent.wheel(slider, { deltaY: -100, cancelable: true })

    fireEvent(slider, event)

    expect(event.defaultPrevented).toBe(true)
    expect(onChange).toHaveBeenCalledWith(376)
  })

  it('decrements on wheel down', () => {
    const onChange = vi.fn()
    render(<RotaryField {...defaultProps} onChange={onChange} />)

    fireEvent.wheel(screen.getByRole('slider', { name: 'Time' }), { deltaY: 100 })

    expect(onChange).toHaveBeenCalledWith(374)
  })

  it('applies fine adjustment with Shift+wheel', () => {
    const onChange = vi.fn()
    render(<RotaryField label="Mix" help="Blends" value={0.35} defaultValue={0.3} min={0} max={1} step={0.01} suffix="" percent onChange={onChange} />)

    fireEvent.wheel(screen.getByRole('slider', { name: 'Mix' }), { deltaY: -100, shiftKey: true })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0]![0]).toBeCloseTo(0.351)
  })

  it('ignores wheel events without vertical movement', () => {
    const onChange = vi.fn()
    render(<RotaryField {...defaultProps} onChange={onChange} />)
    const slider = screen.getByRole('slider', { name: 'Time' })
    const event = createEvent.wheel(slider, { deltaY: 0 })

    fireEvent(slider, event)

    expect(event.defaultPrevented).toBe(false)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('jumps to min on Home', () => {
    const onChange = vi.fn()
    render(<RotaryField {...defaultProps} onChange={onChange} />)
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Time' }), { key: 'Home' })
    expect(onChange).toHaveBeenCalledWith(0)
  })

  it('jumps to max on End', () => {
    const onChange = vi.fn()
    render(<RotaryField {...defaultProps} onChange={onChange} />)
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Time' }), { key: 'End' })
    expect(onChange).toHaveBeenCalledWith(2000)
  })

  it('applies fine step with Shift+ArrowUp on percent variant', () => {
    const onChange = vi.fn()
    render(<RotaryField label="Mix" help="Blends" value={0.35} defaultValue={0.3} min={0} max={1} step={0.01} suffix="" percent onChange={onChange} />)
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Mix' }), { key: 'ArrowUp', shiftKey: true })
    expect(onChange).toHaveBeenCalledTimes(1)
    const called = onChange.mock.calls[0]![0] as number
    expect(called).toBeGreaterThan(0.35)
    expect(called).toBeLessThan(0.36)
  })

  it('clamps value at min', () => {
    const onChange = vi.fn()
    render(<RotaryField {...defaultProps} value={0} onChange={onChange} />)
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Time' }), { key: 'ArrowDown' })
    expect(onChange).toHaveBeenCalledWith(0)
  })

  it('clamps value at max', () => {
    const onChange = vi.fn()
    render(<RotaryField {...defaultProps} value={2000} onChange={onChange} />)
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Time' }), { key: 'ArrowUp' })
    expect(onChange).toHaveBeenCalledWith(2000)
  })

  it('switches to editing mode on value button click', () => {
    const onChange = vi.fn()
    render(<RotaryField {...defaultProps} onChange={onChange} />)
    fireEvent.click(screen.getByText('375 ms'))
    const input = screen.getByRole('textbox', { name: 'Time value' })
    expect(input).toBeInTheDocument()
    expect(input).toHaveValue('375')
  })

  it('commits edited value on Enter', () => {
    const onChange = vi.fn()
    render(<RotaryField {...defaultProps} onChange={onChange} />)
    // Enter edit mode
    fireEvent.click(screen.getByText('375 ms'))
    const input = screen.getByRole('textbox', { name: 'Time value' })
    fireEvent.change(input, { target: { value: '500' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(500)
  })

  it('cancels edit on Escape', () => {
    const onChange = vi.fn()
    render(<RotaryField {...defaultProps} onChange={onChange} />)
    fireEvent.click(screen.getByText('375 ms'))
    const input = screen.getByRole('textbox', { name: 'Time value' })
    fireEvent.keyDown(input, { key: 'Escape' })
    // Should exit edit mode without calling onChange
    expect(onChange).not.toHaveBeenCalled()
    // Value display should be back
    expect(screen.getByText('375 ms')).toBeInTheDocument()
  })

  it('commits edited value on blur', () => {
    const onChange = vi.fn()
    render(<RotaryField {...defaultProps} onChange={onChange} />)
    fireEvent.click(screen.getByText('375 ms'))
    const input = screen.getByRole('textbox', { name: 'Time value' })
    fireEvent.change(input, { target: { value: '800' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith(800)
  })

  it('ignores non-left button pointer down', () => {
    render(<RotaryField {...defaultProps} />)
    const slider = screen.getByRole('slider', { name: 'Time' })
    fireEvent.pointerDown(slider, { button: 1, pointerId: 1 })
  })

  it('triggers pointerDown and pointerUp without crashing', () => {
    render(<RotaryField {...defaultProps} />)
    const slider = screen.getByRole('slider', { name: 'Time' })

    fireEvent.pointerDown(slider, { button: 0, pointerId: 1, clientY: 200 })
    fireEvent.pointerMove(slider, { pointerId: 1, clientY: 100 })
    fireEvent.pointerUp(slider, { pointerId: 1 })
  })

  it('does not move on pointer move without prior pointer down', () => {
    const onChange = vi.fn()
    render(<RotaryField {...defaultProps} onChange={onChange} />)
    const slider = screen.getByRole('slider', { name: 'Time' })

    fireEvent.pointerMove(slider, { pointerId: 2, clientY: 100 })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('handles shiftKey in key down for fine adjustment', () => {
    const onChange = vi.fn()
    render(<RotaryField {...defaultProps} onChange={onChange} />)
    const slider = screen.getByRole('slider', { name: 'Time' })

    fireEvent.keyDown(slider, { key: 'ArrowUp', shiftKey: true })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

})
