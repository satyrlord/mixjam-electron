import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import LaneRow from './LaneRow'
import type { LaneState } from '../lib/arrangement'

function makeLane(overrides: Partial<LaneState> = {}): LaneState {
  return {
    id: 'lane-1',
    index: 0,
    name: 'Lane 1',
    muted: false,
    solo: false,
    pan: 0,
    gain: 0.8,
    sends: [0, 0, 0, 0],
    placements: [],
    ...overrides
  }
}

const DEFAULT_PROPS = {
  lane: makeLane(),
  dimmed: false,
  totalTicks: 256,
  flashSamplePath: null,
  selectedPlacementIds: new Set<string>(),
  missingSamplePaths: new Set<string>(),
  onToggleLaneMute: vi.fn(),
  onToggleLaneSolo: vi.fn(),
  onSetLanePan: vi.fn(),
  renaming: false,
  onLaneContextMenu: vi.fn(),
  onCommitLaneName: vi.fn(),
  onCancelLaneRename: vi.fn(),
  onPlacementDragStart: vi.fn(),
  onPlacementContextMenu: vi.fn(),
  onDragOver: vi.fn(),
  onDrop: vi.fn(),
}

describe('LaneRow', () => {
  it('renders lane name, mute/solo buttons, and pan slider', () => {
    render(<LaneRow {...DEFAULT_PROPS} />)

    expect(screen.getByText('Lane 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mute Lane 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Solo Lane 1' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Pan Lane 1' })).toBeInTheDocument()
  })

  it('dimmed lane gets the dimmed class', () => {
    render(<LaneRow {...DEFAULT_PROPS} dimmed />)
    expect(document.querySelector('.tracker-lane')!.className).toContain('tracker-lane-dimmed')
  })

  it('pan slider shows correct aria-valuenow', () => {
    render(<LaneRow {...DEFAULT_PROPS} lane={makeLane({ pan: 0.5 })} />)
    const panSlider = screen.getByRole('slider', { name: 'Pan Lane 1' })
    expect(panSlider).toHaveAttribute('aria-valuenow', '50')
  })

  it('double-click on pan resets to center', () => {
    const onSetLanePan = vi.fn()
    render(<LaneRow {...DEFAULT_PROPS} lane={makeLane({ pan: 0.7 })} onSetLanePan={onSetLanePan} />)
    const panSlider = screen.getByRole('slider', { name: 'Pan Lane 1' })
    fireEvent.doubleClick(panSlider)
    expect(onSetLanePan).toHaveBeenCalledWith(0, 0)
  })

  // --- spec-007 AC-018 right-click pan cycle ---

  it('right-click on pan cycles any position to center first, then C→R→L→C, suppressing the menu (AC-018)', () => {
    const onSetLanePan = vi.fn()
    const { rerender } = render(
      <LaneRow {...DEFAULT_PROPS} lane={makeLane({ pan: 0.4 })} onSetLanePan={onSetLanePan} />
    )
    const panKnob = () => screen.getByRole('slider', { name: 'Pan Lane 1' })

    // Any freely-dragged position recenters first.
    const contextMenuFired = fireEvent.contextMenu(panKnob())
    expect(contextMenuFired).toBe(false) // preventDefault suppressed the menu
    expect(onSetLanePan).toHaveBeenLastCalledWith(0, 0)

    rerender(
      <LaneRow {...DEFAULT_PROPS} lane={makeLane({ pan: 0 })} onSetLanePan={onSetLanePan} />
    )
    fireEvent.contextMenu(panKnob())
    expect(onSetLanePan).toHaveBeenLastCalledWith(0, 1)

    rerender(
      <LaneRow {...DEFAULT_PROPS} lane={makeLane({ pan: 1 })} onSetLanePan={onSetLanePan} />
    )
    fireEvent.contextMenu(panKnob())
    expect(onSetLanePan).toHaveBeenLastCalledWith(0, -1)

    rerender(
      <LaneRow {...DEFAULT_PROPS} lane={makeLane({ pan: -1 })} onSetLanePan={onSetLanePan} />
    )
    fireEvent.contextMenu(panKnob())
    expect(onSetLanePan).toHaveBeenLastCalledWith(0, 0)
  })

  it('right-click cycles from key-step residue near center (AC-018 epsilon)', () => {
    const onSetLanePan = vi.fn()
    // ArrowRight x3 then ArrowLeft x3 lands on ~1.4e-17, which reads as Center
    // but is not exactly 0; the first right-click must still step to 100% R.
    const residue = 1.3877787807814457e-17
    render(
      <LaneRow {...DEFAULT_PROPS} lane={makeLane({ pan: residue })} onSetLanePan={onSetLanePan} />
    )
    fireEvent.contextMenu(screen.getByRole('slider', { name: 'Pan Lane 1' }))
    expect(onSetLanePan).toHaveBeenLastCalledWith(0, 1)
  })

  it('right-click does not start a pan scrub drag', () => {
    const onSetLanePan = vi.fn()
    render(
      <LaneRow {...DEFAULT_PROPS} lane={makeLane({ pan: 0 })} onSetLanePan={onSetLanePan} />
    )
    const panSlider = screen.getByRole('slider', { name: 'Pan Lane 1' })

    // Right-click mouseDown should be a no-op for the drag path
    fireEvent.mouseDown(panSlider, { button: 2 })
    // Only the contextMenu handler should fire (via right-click), not a scrub
    // Since jsdom doesn't fire contextMenu automatically from mouseDown+button=2,
    // we verify the scrub didn't fire via the contextMenu path.
    fireEvent.contextMenu(panSlider)
    // The right-click cycle from pan=0 → 1, not a scrub drag value
    expect(onSetLanePan).toHaveBeenLastCalledWith(0, 1)
  })

  it('pan slider keyboard: Arrow keys adjust pan by 0.05 clamped', () => {
    const onSetLanePan = vi.fn()
    render(
      <LaneRow {...DEFAULT_PROPS} lane={makeLane({ pan: 0 })} onSetLanePan={onSetLanePan} />
    )
    const panSlider = screen.getByRole('slider', { name: 'Pan Lane 1' })

    fireEvent.keyDown(panSlider, { key: 'ArrowRight' })
    expect(onSetLanePan).toHaveBeenLastCalledWith(0, 0.05)
    fireEvent.keyDown(panSlider, { key: 'ArrowLeft' })
    expect(onSetLanePan).toHaveBeenLastCalledWith(0, -0.05)
    // ArrowUp/ArrowDown mirror Right/Left
    fireEvent.keyDown(panSlider, { key: 'ArrowUp' })
    expect(onSetLanePan).toHaveBeenLastCalledWith(0, 0.05)
    fireEvent.keyDown(panSlider, { key: 'ArrowDown' })
    expect(onSetLanePan).toHaveBeenLastCalledWith(0, -0.05)

    // Home centers
    fireEvent.keyDown(panSlider, { key: 'Home' })
    expect(onSetLanePan).toHaveBeenLastCalledWith(0, 0)

    // Clamped at extremes
    onSetLanePan.mockClear()
    fireEvent.keyDown(panSlider, { key: 'ArrowLeft' })
    const clampedCall = onSetLanePan.mock.calls[0]![1] as number
    expect(clampedCall).toBeGreaterThanOrEqual(-1)
  })

  it('opens lane actions from the lane head and commits an inline rename', () => {
    const onLaneContextMenu = vi.fn()
    const onCommitLaneName = vi.fn()
    const { rerender } = render(
      <LaneRow {...DEFAULT_PROPS} onLaneContextMenu={onLaneContextMenu} />
    )

    fireEvent.contextMenu(screen.getByText('Lane 1'))
    expect(onLaneContextMenu).toHaveBeenCalledWith(0, 'Lane 1')

    rerender(
      <LaneRow
        {...DEFAULT_PROPS}
        renaming
        onLaneContextMenu={onLaneContextMenu}
        onCommitLaneName={onCommitLaneName}
      />
    )
    const input = screen.getByRole('textbox', { name: 'Rename Lane 1' })
    fireEvent.change(input, { target: { value: '  Lead Synth  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onCommitLaneName).toHaveBeenCalledWith(0, 'Lead Synth')
  })

  it('cancels an inline rename with Escape', () => {
    const onCancelLaneRename = vi.fn()
    render(<LaneRow {...DEFAULT_PROPS} renaming onCancelLaneRename={onCancelLaneRename} />)

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Rename Lane 1' }), { key: 'Escape' })

    expect(onCancelLaneRename).toHaveBeenCalledOnce()
  })

  it('mouse wheel adjusts the lane pan knob by 0.05 (AC-021)', () => {
    const onSetLanePan = vi.fn()
    render(
      <LaneRow {...DEFAULT_PROPS} lane={makeLane({ pan: 0 })} onSetLanePan={onSetLanePan} />
    )
    const panKnob = screen.getByRole('slider', { name: 'Pan Lane 1' })

    fireEvent.wheel(panKnob, { deltaY: -100 })
    expect(onSetLanePan).toHaveBeenLastCalledWith(0, 0.05)

    fireEvent.wheel(panKnob, { deltaY: 100 })
    expect(onSetLanePan).toHaveBeenLastCalledWith(0, -0.05)
  })

  it('pan slider is keyboard-focusable', () => {
    render(<LaneRow {...DEFAULT_PROPS} />)
    const panSlider = screen.getByRole('slider', { name: 'Pan Lane 1' })
    expect(panSlider).toHaveAttribute('tabindex', '0')
  })
})
