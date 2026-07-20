import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import BpmControl from './BpmControl'

describe('BpmControl', () => {
  it.each([50, 200])('commits the valid BPM boundary %i', (value) => {
    const onSetBpm = vi.fn()
    render(<BpmControl bpm={120} onSetBpm={onSetBpm} />)

    const input = screen.getByRole('textbox', { name: 'BPM value' })
    fireEvent.change(input, { target: { value: String(value) } })
    fireEvent.blur(input)

    expect(onSetBpm).toHaveBeenCalledWith(value)
  })

  it.each(['49', '201', 'tempo', '120.5'])(
    'rejects invalid BPM input %s and restores the current value',
    (value) => {
      const onSetBpm = vi.fn()
      render(<BpmControl bpm={120} onSetBpm={onSetBpm} />)

      const input = screen.getByRole('textbox', { name: 'BPM value' })
      fireEvent.change(input, { target: { value } })
      fireEvent.blur(input)

      expect(onSetBpm).not.toHaveBeenCalled()
      expect(input).toHaveValue('120')
    }
  )

  it('commits a valid draft with Enter', () => {
    const onSetBpm = vi.fn()
    render(<BpmControl bpm={120} onSetBpm={onSetBpm} />)

    const input = screen.getByRole('textbox', { name: 'BPM value' })
    input.focus()
    fireEvent.change(input, { target: { value: '137' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSetBpm).toHaveBeenCalledWith(137)
  })

  it('restores the current value with Escape without committing', () => {
    const onSetBpm = vi.fn()
    render(<BpmControl bpm={120} onSetBpm={onSetBpm} />)

    const input = screen.getByRole('textbox', { name: 'BPM value' })
    fireEvent.change(input, { target: { value: '137' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(onSetBpm).not.toHaveBeenCalled()
    expect(input).toHaveValue('120')
  })

  it('synchronizes the draft and slider when the BPM prop changes', () => {
    const onSetBpm = vi.fn()
    const { rerender } = render(<BpmControl bpm={120} onSetBpm={onSetBpm} />)

    fireEvent.change(screen.getByRole('textbox', { name: 'BPM value' }), {
      target: { value: '137' }
    })
    rerender(<BpmControl bpm={145} onSetBpm={onSetBpm} />)

    expect(screen.getByRole('textbox', { name: 'BPM value' })).toHaveValue('145')
    expect(screen.getByRole('slider', { name: 'BPM' })).toHaveAttribute('aria-valuenow', '145')
  })

  it('updates BPM through the horizontal slider and supports both endpoints', () => {
    const onSetBpm = vi.fn()
    render(<BpmControl bpm={120} onSetBpm={onSetBpm} />)

    const slider = screen.getByRole('slider', { name: 'BPM' })
    expect(slider).toHaveAttribute('aria-orientation', 'horizontal')
    expect(slider).toHaveAttribute('aria-valuemin', '50')
    expect(slider).toHaveAttribute('aria-valuemax', '200')
    expect(slider).toHaveClass('linear-slider-thumb')
    expect(slider.closest('.linear-slider')).toHaveClass('bpm-control-slider')
    expect(slider.querySelector('.linear-slider-handle')).toBeInTheDocument()

    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    fireEvent.keyDown(slider, { key: 'Home' })
    fireEvent.keyDown(slider, { key: 'End' })

    expect(onSetBpm.mock.calls.map(([value]) => value)).toEqual([121, 50, 200])
  })

  it('uses the shared tooltip without a native title', async () => {
    render(<BpmControl bpm={120} onSetBpm={vi.fn()} />)

    const slider = screen.getByRole('slider', { name: 'BPM' })
    expect(slider).not.toHaveAttribute('title')
    fireEvent.focus(slider)

    expect(await screen.findByRole('tooltip')).toHaveTextContent('BPM (50-200)')
  })
})
