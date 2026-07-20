import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { VerticalFader } from './VerticalControls'

describe('VerticalFader', () => {
  it('supports an overlaid meter, tooltip, wheel steps, and one gesture lifecycle', () => {
    const onChange = vi.fn()
    const onGestureStart = vi.fn()
    const onGestureEnd = vi.fn()
    render(
      <VerticalFader
        ariaLabel="Test level"
        value={0.5}
        min={0}
        max={1}
        step={0.1}
        valueText="50%"
        onChange={onChange}
        onGestureStart={onGestureStart}
        onGestureEnd={onGestureEnd}
        tooltip="Test tooltip"
        unityValue={0.8}
        meterDb={-6}
        maxLabel="Max"
        minLabel="Min"
        wheelStep
        showDragValue
      />
    )

    const slider = screen.getByRole('slider', { name: 'Test level' })
    expect(slider).toHaveClass('linear-slider-thumb')
    expect(slider.closest('.linear-slider')).toHaveAttribute('data-orientation', 'vertical')
    expect(slider.querySelector('.linear-slider-handle')).toBeInTheDocument()
    expect(document.querySelector('.vertical-meter-fill')).toHaveStyle({
      background: 'var(--meter-yellow)'
    })
    expect(document.querySelector('.vertical-meter-peak')).toBeNull()
    expect(screen.getByText('Max')).toBeInTheDocument()
    expect(screen.getByText('Min')).toBeInTheDocument()

    fireEvent.wheel(slider, { deltaY: -1 })
    fireEvent.wheel(slider, { deltaY: 1 })
    expect(onChange.mock.calls).toEqual([[0.6], [0.4]])

    fireEvent.pointerDown(slider, { button: 0 })
    expect(screen.getByText('50%')).toBeInTheDocument()
    fireEvent.pointerUp(slider)
    fireEvent.pointerUp(slider)
    expect(onGestureStart).toHaveBeenCalledOnce()
    expect(onGestureEnd).toHaveBeenCalledOnce()
  })

  it('ignores non-primary pointer gestures', () => {
    const onGestureStart = vi.fn()
    render(
      <VerticalFader
        ariaLabel="Test level"
        value={0.5}
        min={0}
        max={1}
        step={0.1}
        valueText="50%"
        onChange={vi.fn()}
        onGestureStart={onGestureStart}
      />
    )

    fireEvent.pointerDown(screen.getByRole('slider', { name: 'Test level' }), { button: 1 })
    expect(onGestureStart).not.toHaveBeenCalled()
  })
})
