import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SongControlsMain from './SongControlsMain'
import { emptyMasterMeterSnapshot } from '../engine/master-meter'

describe('SongControlsMain', () => {
  const defaultProps = {
    bpm: 140,
    masterGain: 0.8,
    masterMeter: emptyMasterMeterSnapshot(-3),
    onSetBpm: vi.fn(),
    onSetMasterGain: vi.fn(),
    onResetMasterMeter: vi.fn()
  } as const

  it('renders BPM, master volume, and output level sections', () => {
    render(<SongControlsMain {...defaultProps} />)
    expect(screen.getByText('Song Controls')).toBeInTheDocument()
    expect(screen.getAllByText('BPM').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Master Volume')).toBeInTheDocument()
    expect(screen.getByText('Output Level')).toBeInTheDocument()
  })

  it('displays the current BPM value', () => {
    render(<SongControlsMain {...defaultProps} />)
    const input = screen.getByRole('textbox', { name: 'BPM value' })
    expect(input).toHaveValue('140')
  })

  it('displays master volume as percentage', () => {
    render(<SongControlsMain {...defaultProps} />)
    expect(screen.getByText('80%')).toBeInTheDocument()
  })

  it('labels the RMS fallback as dBFS', () => {
    render(<SongControlsMain {...defaultProps} />)
    expect(screen.getAllByText('-3.0 dBFS').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('meter', { name: 'Output Level' })).toHaveAttribute('aria-valuemin', '-100')
  })

  it('shows standards-based M/S/I/TP units and resets the integration session', () => {
    const onResetMasterMeter = vi.fn()
    render(<SongControlsMain
      {...defaultProps}
      masterMeter={{
        available: true,
        rmsDbfs: -12,
        momentaryLufs: -18.2,
        shortTermLufs: -19.1,
        integratedLufs: -20.3,
        truePeakDbtp: -1.4,
        loudnessRangeLu: 5.2
      }}
      onResetMasterMeter={onResetMasterMeter}
    />)

    expect(screen.getAllByText('-18.2 LUFS').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('-19.1 LUFS')).toBeInTheDocument()
    expect(screen.getByText('-20.3 LUFS')).toBeInTheDocument()
    expect(screen.getByText('-1.4 dBTP')).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: 'Output Level' })).toHaveAttribute('aria-valuetext', '-18.2 LUFS')
    expect(screen.getByRole('meter', { name: 'Output Level' })).toHaveAttribute('aria-valuemin', '-60')
    fireEvent.click(screen.getByRole('button', { name: 'Reset loudness measurement' }))
    expect(onResetMasterMeter).toHaveBeenCalledOnce()
  })

  it('commits BPM on blur when valid', () => {
    const onSetBpm = vi.fn()
    render(<SongControlsMain {...defaultProps} onSetBpm={onSetBpm} />)
    const input = screen.getByRole('textbox', { name: 'BPM value' })
    fireEvent.change(input, { target: { value: '150' } })
    fireEvent.blur(input)
    expect(onSetBpm).toHaveBeenCalledWith(150)
  })

  it('reverts BPM on blur when input is not an integer', () => {
    const onSetBpm = vi.fn()
    render(<SongControlsMain {...defaultProps} onSetBpm={onSetBpm} />)
    const input = screen.getByRole('textbox', { name: 'BPM value' })
    fireEvent.change(input, { target: { value: 'abc' } })
    fireEvent.blur(input)
    expect(onSetBpm).not.toHaveBeenCalled()
    expect(input).toHaveValue('140')
  })

  it('reverts BPM on blur when input is out of range (below 50)', () => {
    const onSetBpm = vi.fn()
    render(<SongControlsMain {...defaultProps} onSetBpm={onSetBpm} />)
    const input = screen.getByRole('textbox', { name: 'BPM value' })
    fireEvent.change(input, { target: { value: '30' } })
    fireEvent.blur(input)
    expect(onSetBpm).not.toHaveBeenCalled()
    expect(input).toHaveValue('140')
  })

  it('reverts BPM on blur when input is out of range (above 200)', () => {
    const onSetBpm = vi.fn()
    render(<SongControlsMain {...defaultProps} onSetBpm={onSetBpm} />)
    const input = screen.getByRole('textbox', { name: 'BPM value' })
    fireEvent.change(input, { target: { value: '250' } })
    fireEvent.blur(input)
    expect(onSetBpm).not.toHaveBeenCalled()
    expect(input).toHaveValue('140')
  })

  it('commits BPM on Enter key', () => {
    const onSetBpm = vi.fn()
    render(<SongControlsMain {...defaultProps} onSetBpm={onSetBpm} />)
    const input = screen.getByRole('textbox', { name: 'BPM value' })
    fireEvent.change(input, { target: { value: '128' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.blur(input)
    expect(onSetBpm).toHaveBeenCalledWith(128)
  })

  it('reverts BPM draft on Escape key', () => {
    const onSetBpm = vi.fn()
    render(<SongControlsMain {...defaultProps} onSetBpm={onSetBpm} />)
    const input = screen.getByRole('textbox', { name: 'BPM value' })
    fireEvent.change(input, { target: { value: '99' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input).toHaveValue('140')
    expect(onSetBpm).not.toHaveBeenCalled()
  })

  it('syncs BPM draft when external bpm prop changes', () => {
    const onSetBpm = vi.fn()
    const { rerender } = render(<SongControlsMain {...defaultProps} onSetBpm={onSetBpm} />)
    rerender(<SongControlsMain {...defaultProps} bpm={160} onSetBpm={onSetBpm} />)
    expect(screen.getByRole('textbox', { name: 'BPM value' })).toHaveValue('160')
  })

  it('displays master volume at 100% correctly', () => {
    render(<SongControlsMain {...defaultProps} masterGain={1} />)
    expect(screen.getAllByText('100%').length).toBeGreaterThanOrEqual(1)
  })

  it('displays master volume at 0% correctly', () => {
    render(<SongControlsMain {...defaultProps} masterGain={0} />)
    expect(screen.getAllByText('0%').length).toBeGreaterThanOrEqual(1)
  })

  it('does not commit non-integer BPM on blur', () => {
    const onSetBpm = vi.fn()
    render(<SongControlsMain {...defaultProps} onSetBpm={onSetBpm} />)
    const input = screen.getByRole('textbox', { name: 'BPM value' })
    fireEvent.change(input, { target: { value: '140.5' } })
    fireEvent.blur(input)
    expect(onSetBpm).not.toHaveBeenCalled()
    expect(input).toHaveValue('140')
  })
})
