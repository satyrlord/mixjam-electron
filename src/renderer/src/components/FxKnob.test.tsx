import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import FxKnob, { fromNormalized, quantize, toNormalized, type FxKnobSpec } from './FxKnob'

const LINEAR: FxKnobSpec = {
  min: 0, max: 100, step: 1, defaultValue: 50, format: (value) => `${value}%`
}
const LOG: FxKnobSpec = {
  min: 20, max: 20000, step: 1, curve: 'log', defaultValue: 1000, format: (value) => `${value} Hz`
}

describe('value mapping', () => {
  it('maps a linear spec across its full range', () => {
    expect(toNormalized(LINEAR, 0)).toBe(0)
    expect(toNormalized(LINEAR, 50)).toBeCloseTo(0.5)
    expect(toNormalized(LINEAR, 100)).toBe(1)
    expect(fromNormalized(LINEAR, 0)).toBe(0)
    expect(fromNormalized(LINEAR, 1)).toBe(100)
  })

  it('clamps out-of-range input rather than extrapolating', () => {
    expect(toNormalized(LINEAR, -50)).toBe(0)
    expect(toNormalized(LINEAR, 500)).toBe(1)
    expect(fromNormalized(LINEAR, -1)).toBe(0)
    expect(fromNormalized(LINEAR, 2)).toBe(100)
  })

  it('places a log spec geometrically, not linearly', () => {
    // The midpoint of a 20 Hz - 20 kHz sweep is ~632 Hz, not 10 kHz. This is
    // the whole reason these editors do not use the shared RotaryControl.
    const middle = fromNormalized(LOG, 0.5)
    expect(middle).toBeGreaterThan(600)
    expect(middle).toBeLessThan(700)
    expect(toNormalized(LOG, 20)).toBeCloseTo(0)
    expect(toNormalized(LOG, 20000)).toBeCloseTo(1)
  })

  it('round-trips a value through normalize and back', () => {
    for (const value of [20, 100, 440, 5000, 20000]) {
      expect(fromNormalized(LOG, toNormalized(LOG, value))).toBeCloseTo(value, 0)
    }
  })

  it('quantizes to the step without floating-point dust', () => {
    const fine: FxKnobSpec = { ...LINEAR, min: -24, max: 12, step: 0.1, defaultValue: 0 }
    expect(quantize(fine, 1.0500000000000003)).toBeCloseTo(1.1, 5)
    expect(quantize(fine, -23.97)).toBeCloseTo(-24, 5)
    expect(quantize(fine, 100)).toBe(12)
  })
})

describe('the knob control', () => {
  function renderKnob(
    spec: FxKnobSpec = LINEAR,
    value = 50
  ): { onChange: ReturnType<typeof vi.fn>; knob: HTMLElement } {
    const onChange = vi.fn()
    render(
      <FxKnob
        id="test-knob"
        classPrefix="ef"
        spec={spec}
        label="Feedback"
        value={value}
        onChange={onChange}
      />
    )
    return { onChange, knob: screen.getByRole('slider', { name: 'Feedback' }) }
  }

  it('exposes its range and formatted value to assistive technology', () => {
    const { knob } = renderKnob()
    expect(knob).toHaveAttribute('aria-valuemin', '0')
    expect(knob).toHaveAttribute('aria-valuemax', '100')
    expect(knob).toHaveAttribute('aria-valuenow', '50')
    expect(knob).toHaveAttribute('aria-valuetext', '50%')
  })

  it('namespaces its classes so each editor keeps its own skin', () => {
    const { knob } = renderKnob()
    expect(knob).toHaveClass('ef-knob')
  })

  it.each([
    ['ArrowUp', 51],
    ['ArrowRight', 51],
    ['ArrowDown', 49],
    ['ArrowLeft', 49],
    ['PageUp', 60],
    ['PageDown', 40],
    ['Home', 0],
    ['End', 100]
  ])('%s moves the value to %d', (key, expected) => {
    const { onChange, knob } = renderKnob()
    fireEvent.keyDown(knob, { key })
    expect(onChange).toHaveBeenCalledWith(expected)
  })

  it('Shift makes the arrow step ten times finer', () => {
    const fine: FxKnobSpec = { ...LINEAR, step: 1 }
    const { onChange, knob } = renderKnob(fine, 50)
    fireEvent.keyDown(knob, { key: 'ArrowUp', shiftKey: true })
    expect(onChange).toHaveBeenCalledWith(50.1)
  })

  it('ignores keys it does not bind', () => {
    const { onChange, knob } = renderKnob()
    fireEvent.keyDown(knob, { key: 'a' })
    fireEvent.keyDown(knob, { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('double-click restores the default', () => {
    const { onChange, knob } = renderKnob(LINEAR, 12)
    fireEvent.doubleClick(knob)
    expect(onChange).toHaveBeenCalledWith(50)
  })

  it('brackets a keyboard edit with gesture callbacks when given them', () => {
    const onGestureStart = vi.fn()
    const onGestureEnd = vi.fn()
    const onChange = vi.fn()
    render(
      <FxKnob
        id="k" classPrefix="ef" spec={LINEAR} label="Feedback" value={50}
        onChange={onChange} onGestureStart={onGestureStart} onGestureEnd={onGestureEnd}
      />
    )
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Feedback' }), { key: 'ArrowUp' })
    expect(onGestureStart).toHaveBeenCalledTimes(1)
    expect(onGestureEnd).toHaveBeenCalledTimes(1)
  })

  it('works without gesture callbacks', () => {
    const { onChange, knob } = renderKnob()
    expect(() => fireEvent.keyDown(knob, { key: 'ArrowUp' })).not.toThrow()
    expect(onChange).toHaveBeenCalledWith(51)
  })

  it('never emits a value outside the spec range', () => {
    const { onChange, knob } = renderKnob(LINEAR, 100)
    fireEvent.keyDown(knob, { key: 'ArrowUp' })
    fireEvent.keyDown(knob, { key: 'PageUp' })
    for (const [value] of onChange.mock.calls) {
      expect(value).toBeGreaterThanOrEqual(LINEAR.min)
      expect(value).toBeLessThanOrEqual(LINEAR.max)
    }
  })
})
