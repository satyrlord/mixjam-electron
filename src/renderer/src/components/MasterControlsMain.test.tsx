import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MasterControlsMain from './MasterControlsMain'
import { emptyMasterMeterSnapshot } from '../engine/master-meter'

describe('MasterControlsMain', () => {
  const defaultProps = {
    masterGain: 0.8,
    masterMeter: emptyMasterMeterSnapshot(-3),
    onSetMasterGain: vi.fn(),
    onResetMasterMeter: vi.fn()
  } as const

  it('groups Master Volume and Output Level in one module', () => {
    render(<MasterControlsMain {...defaultProps} />)
    expect(screen.getByText('Master Controls')).toBeInTheDocument()
    const masterModule = screen.getByText('Master Volume').closest('.master-controls-module')
    expect(masterModule).toContainElement(screen.getByText('Output Level'))
    expect(masterModule).toContainElement(screen.getByRole('slider', { name: 'Master Volume' }))
    expect(masterModule).toContainElement(screen.getByRole('meter', { name: 'Output Level' }))
  })

  it('displays master volume as percentage', () => {
    render(<MasterControlsMain {...defaultProps} />)
    expect(screen.getByText('80%')).toBeInTheDocument()
  })

  it('labels the RMS fallback as dBFS', () => {
    render(<MasterControlsMain {...defaultProps} />)
    expect(screen.getAllByText('-3.0 dBFS').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('meter', { name: 'Output Level' })).toHaveAttribute('aria-valuemin', '-100')
  })

  it('shows standards-based M/S/I/TP units and resets the integration session', () => {
    const onResetMasterMeter = vi.fn()
    render(<MasterControlsMain
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
    const resetButton = screen.getByRole('button', { name: 'Reset loudness measurement' })
    expect(resetButton).toHaveTextContent('')
    expect(resetButton.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(resetButton.querySelector('svg')).toHaveAttribute('focusable', 'false')
    fireEvent.click(resetButton)
    expect(onResetMasterMeter).toHaveBeenCalledOnce()
  })

  it('displays master volume at 100% correctly', () => {
    render(<MasterControlsMain {...defaultProps} masterGain={1} />)
    expect(screen.getAllByText('100%').length).toBeGreaterThanOrEqual(1)
  })

  it('displays master volume at 0% correctly', () => {
    render(<MasterControlsMain {...defaultProps} masterGain={0} />)
    expect(screen.getAllByText('0%').length).toBeGreaterThanOrEqual(1)
  })

  it('updates Master Volume through its fader', () => {
    const onSetMasterGain = vi.fn()
    render(<MasterControlsMain {...defaultProps} onSetMasterGain={onSetMasterGain} />)

    fireEvent.keyDown(screen.getByRole('slider', { name: 'Master Volume' }), {
      key: 'ArrowUp'
    })

    expect(onSetMasterGain).toHaveBeenCalledWith(0.81)
  })

  it('does not render Clip Edge Fades in Master', () => {
    render(<MasterControlsMain {...defaultProps} />)
    expect(screen.queryByText('Clip Edge Fades')).not.toBeInTheDocument()
  })
})
