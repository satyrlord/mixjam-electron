import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LinearSlider } from './Slider'

describe('LinearSlider', () => {
  it('owns the canonical rail, range, hit target, and painted handle in both orientations', () => {
    const { rerender } = render(
      <LinearSlider
        value={40}
        min={0}
        max={100}
        onValueChange={vi.fn()}
        ariaLabel="Shared value"
      />
    )

    const slider = () => screen.getByRole('slider', { name: 'Shared value' })
    expect(slider()).toHaveClass('linear-slider-thumb')
    expect(slider().closest('.linear-slider')).toHaveAttribute('data-orientation', 'horizontal')
    expect(slider().closest('.linear-slider')).toContainElement(
      document.querySelector('.linear-slider-track')
    )
    expect(document.querySelector('.linear-slider-range')).toBeInTheDocument()
    expect(slider()).toContainElement(document.querySelector('.linear-slider-handle'))

    rerender(
      <LinearSlider
        orientation="vertical"
        value={40}
        min={0}
        max={100}
        onValueChange={vi.fn()}
        ariaLabel="Shared value"
      />
    )
    expect(slider().closest('.linear-slider')).toHaveAttribute('data-orientation', 'vertical')
  })
})
