import { createEvent, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MASTER_BUS_PARAMS } from '../engine/masterbus/params'
import { defaultMasterBusState, type MasterBusState } from '../engine/masterbus/presets'
import MasterBusStrip, { type MasterBusStripProps, type MasterBusUiMeters } from './MasterBusStrip'

function neutralMeters(overrides: Partial<MasterBusUiMeters> = {}): MasterBusUiMeters {
  return {
    vuDb: -18,
    peakL: false,
    peakR: false,
    compGrDb: 0,
    limGrDb: 0,
    momentaryLufs: -14.3,
    integratedLufs: -14,
    truePeakDbtp: -1.3,
    overLatched: false,
    ...overrides
  }
}

function renderStrip(overrides: Partial<MasterBusStripProps> = {}) {
  const props: MasterBusStripProps = {
    state: defaultMasterBusState(),
    meters: neutralMeters(),
    onSetParam: vi.fn(),
    onGestureStart: vi.fn(),
    onGestureEnd: vi.fn(),
    onTogglePower: vi.fn(),
    onReorder: vi.fn(),
    onApplyPreset: vi.fn(),
    onResetOver: vi.fn(),
    ...overrides
  }
  return { ...render(<MasterBusStrip {...props} />), props }
}

describe('MasterBusStrip', () => {
  it('renders 13 slots with live ordinals and pinned meters at both ends', () => {
    renderStrip()
    const modules = document.querySelectorAll('.mbs-module')
    expect(modules).toHaveLength(13)
    const ordinals = [...document.querySelectorAll('.mbs-ordinal')].map((el) => el.textContent)
    expect(ordinals).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13'])
    // Gain Stage is pinned at slot 01, Input Meter at 02, Output Meter at 13.
    expect(modules[0].getAttribute('aria-label')).toBe('GAIN STAGE')
    expect(modules[1].getAttribute('aria-label')).toBe('Input meter')
    expect(modules[12].getAttribute('aria-label')).toBe('Output meter')
    expect(modules[1].className).toContain('mbs-module-meter')
    expect(modules[12].className).toContain('mbs-module-meter')
  })

  it('renders the downstream processors in state.order after the pinned Gain Stage', () => {
    const state = defaultMasterBusState()
    state.order = ['tube', 'clip', ...state.order.filter((id) => id !== 'clip' && id !== 'tube')]
    renderStrip({ state })
    const labels = [...document.querySelectorAll('.mbs-module')].map((el) => el.getAttribute('aria-label'))
    // Gain Stage is always pinned at slot 01 regardless of state.order position.
    expect(labels[0]).toBe('GAIN STAGE')
    expect(labels[2]).toBe('TUBE SAT')
  })

  it('uses clear complementary names for the master EQ modules', () => {
    renderStrip()
    expect(screen.getByRole('region', { name: 'TRIM EQ' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'LIFT EQ' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'SUB EQ' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'ADD EQ' })).toBeNull()
  })

  it('renders one slider per continuous registry entry with the registry range', () => {
    renderStrip()
    const continuous = MASTER_BUS_PARAMS.filter((def) => !def.isSwitch)
    expect(screen.getAllByRole('slider')).toHaveLength(continuous.length)

    const trim = screen.getByRole('slider', { name: 'GAIN STAGE TRIM' })
    expect(trim).toHaveAttribute('aria-valuemin', '-24')
    expect(trim).toHaveAttribute('aria-valuemax', '24')
    expect(trim).toHaveAttribute('aria-valuetext', '0.0 dB')

    const ratio = screen.getByRole('slider', { name: 'BUS COMP RATIO' })
    expect(ratio).toHaveAttribute('aria-valuemin', '1.5')
    expect(ratio).toHaveAttribute('aria-valuemax', '10')
    expect(ratio).toHaveAttribute('aria-valuetext', '2.0:1')
  })

  it('shows an explicit + on positive bipolar values', () => {
    const state = defaultMasterBusState()
    state.params['gain.trim'] = 3.5
    renderStrip({ state })
    expect(screen.getByRole('slider', { name: 'GAIN STAGE TRIM' }))
      .toHaveAttribute('aria-valuetext', '+3.5 dB')
  })

  it('reflects power state on the LED and toggles through onTogglePower', () => {
    const { props } = renderStrip()
    const power = screen.getByRole('button', { name: 'Power: TUBE SAT' })
    expect(power).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(power)
    expect(props.onTogglePower).toHaveBeenCalledWith('tube')
  })

  it('does not expose a power control or reorder grip for the Gain Stage', () => {
    renderStrip()
    expect(screen.queryByRole('button', { name: 'Power: GAIN STAGE' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Move GAIN STAGE/ })).toBeNull()
    expect(screen.getByRole('slider', { name: 'GAIN STAGE TRIM' })).toBeEnabled()
  })

  it('swaps with the right neighbor on ArrowRight and clamps at the rack start', () => {
    const { props } = renderStrip()
    const clipGrip = screen.getByRole('button', { name: 'Move SOFT CLIP. Use left and right arrow keys.' })
    fireEvent.keyDown(clipGrip, { key: 'ArrowRight' })
    expect(props.onReorder).toHaveBeenCalledWith([
      'tube', 'clip', 'subeq', 'comp', 'max', 'addeq', 'tape', 'width', 'mbc', 'lim'
    ])

    // Soft Clip is the first reorderable processor; it cannot move left past
    // the pinned Gain Stage and Input Meter.
    fireEvent.keyDown(clipGrip, { key: 'ArrowLeft' })
    expect(props.onReorder).toHaveBeenCalledTimes(1)
  })

  it('marks the active preset chip and applies presets on click', () => {
    const { props } = renderStrip()
    expect(screen.getByRole('button', { name: 'Cheat Sheet' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Loud' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Loud' }))
    expect(props.onApplyPreset).toHaveBeenCalledWith('Loud')
  })

  it('shows no active chip when preset is null', () => {
    const state: MasterBusState = { ...defaultMasterBusState(), preset: null }
    renderStrip({ state })
    expect(document.querySelector('.mbs-chip-active')).toBeNull()
  })

  it('lights GR LEDs against the documented thresholds', () => {
    renderStrip({ meters: neutralMeters({ compGrDb: 1.6, limGrDb: 0 }) })
    const comp = screen.getByRole('region', { name: 'BUS COMP' })
    expect(comp.querySelectorAll('.mbs-gr-led')).toHaveLength(6)
    expect(comp.querySelectorAll('.mbs-gr-led-lit')).toHaveLength(3)
    const lim = screen.getByRole('region', { name: 'LIMITER' })
    expect(lim.querySelectorAll('.mbs-gr-led-lit')).toHaveLength(0)
  })

  it('lights the OVER lamp from overLatched and resets it on click', () => {
    const { props, rerender } = renderStrip()
    const over = screen.getByRole('button', { name: 'TP OVER' })
    expect(over.className).not.toContain('mbs-over-led-lit')

    rerender(
      <MasterBusStrip {...props} meters={neutralMeters({ overLatched: true })} />
    )
    expect(screen.getByRole('button', { name: 'TP OVER' }).className).toContain('mbs-over-led-lit')
    fireEvent.click(screen.getByRole('button', { name: 'TP OVER' }))
    expect(props.onResetOver).toHaveBeenCalledTimes(1)
  })

  it('renders null LUFS and TP as dimmed placeholders, never NaN', () => {
    renderStrip({
      meters: neutralMeters({ momentaryLufs: null, integratedLufs: null, truePeakDbtp: null })
    })
    const read = document.querySelector('.mbs-big-read')!
    expect(read.className).toContain('mbs-big-read-dim')
    expect(read.textContent).toContain('--')
    expect(document.querySelector('.mbs-tp-read')!.textContent).toBe('TP -- dB')
    expect(document.body.textContent).not.toContain('NaN')
  })

  it('dims a bypassed module and disables its controls', () => {
    const state = defaultMasterBusState()
    state.power.tube = false
    renderStrip({ state })
    const tube = screen.getByRole('region', { name: 'TUBE SAT' })
    expect(tube.className).toContain('mbs-module-off')
    expect(screen.queryByRole('slider', { name: 'TUBE SAT DRIVE' })).toBeNull()
    expect(screen.queryByRole('slider', { name: 'TUBE SAT MIX' })).toBeNull()
    // Powered modules still expose their sliders.
    expect(screen.getByRole('slider', { name: 'TAPE SAT DRIVE' })).toBeInTheDocument()
  })

  it('disables the speed switch when Tape is bypassed', () => {
    const state = defaultMasterBusState()
    state.power.tape = false
    renderStrip({ state })
    expect(screen.getByRole('switch', { name: 'TAPE SAT SPEED' })).toBeDisabled()
  })

  it('toggles the tape speed switch between 15 and 30 IPS', () => {
    const { props } = renderStrip()
    const sw = screen.getByRole('switch', { name: 'TAPE SAT SPEED' })
    expect(sw).toHaveAttribute('aria-checked', 'true')
    expect(sw).toHaveTextContent('30 IPS')
    fireEvent.click(sw)
    expect(props.onSetParam).toHaveBeenCalledWith('tape.ips', 0)

    const state = defaultMasterBusState()
    state.params['tape.ips'] = 0
    const onSetParam = vi.fn()
    renderStrip({ state, onSetParam })
    const fifteen = screen.getAllByRole('switch', { name: 'TAPE SAT SPEED' })[1]
    expect(fifteen).toHaveAttribute('aria-checked', 'false')
    expect(fifteen).toHaveTextContent('15 IPS')
    fireEvent.click(fifteen)
    expect(onSetParam).toHaveBeenCalledWith('tape.ips', 1)
  })

  it('routes knob edits and gestures through the callbacks', () => {
    const { props } = renderStrip()
    const trim = screen.getByRole('slider', { name: 'GAIN STAGE TRIM' })
    fireEvent.keyDown(trim, { key: 'ArrowUp' })
    expect(props.onSetParam).toHaveBeenCalledWith('gain.trim', 0.1)
  })

  it('ignores grip keys other than left and right', () => {
    const { props } = renderStrip()
    const grip = screen.getByRole('button', { name: 'Move SOFT CLIP. Use left and right arrow keys.' })
    fireEvent.keyDown(grip, { key: 'ArrowUp' })
    fireEvent.keyDown(grip, { key: 'Enter' })
    expect(props.onReorder).not.toHaveBeenCalled()
  })

  describe('drag reorder', () => {
    // jsdom does not implement DataTransfer, so supply the minimal surface the
    // handlers touch and stub the geometry the midpoint rule reads.
    function dataTransfer() {
      return { setData: vi.fn(), effectAllowed: '', dropEffect: '' }
    }
    function moduleAt(label: string): HTMLElement {
      return screen.getByRole('region', { name: label })
    }
    /** Drag starts on the module's grip button, not the section itself. */
    function gripOf(label: string): HTMLElement {
      return screen.getByRole('button', { name: `Move ${label}. Use left and right arrow keys.` })
    }
    // jsdom's DragEvent does not implement the MouseEvent coordinates, so an
    // event init `clientX` is dropped and reads back as undefined — which makes
    // the midpoint comparison always false and the "before" branch unreachable.
    // Build the event and define clientX on it directly. Layout is zero-sized
    // here, so the midpoint is x=0: negative lands left of it, positive right.
    function dragOver(el: HTMLElement, half: 'left' | 'right', dt: ReturnType<typeof dataTransfer>) {
      const event = createEvent.dragOver(el, { dataTransfer: dt })
      Object.defineProperty(event, 'clientX', { value: half === 'left' ? -1 : 1 })
      fireEvent(el, event)
    }

    it('drops a module before the hovered target when the pointer is left of centre', () => {
      const { props } = renderStrip()
      const dt = dataTransfer()

      // Default downstream order: clip, tube, ... Dragging tube onto the left
      // half of clip inserts it at index 0, still after the pinned slots.
      fireEvent.dragStart(gripOf('TUBE SAT'), { dataTransfer: dt })
      expect(dt.setData).toHaveBeenCalled()
      dragOver(moduleAt('SOFT CLIP'), 'left', dt)
      fireEvent.drop(moduleAt('SOFT CLIP'), { dataTransfer: dt })

      expect(props.onReorder).toHaveBeenCalledWith([
        'tube', 'clip', 'subeq', 'comp', 'max', 'addeq', 'tape', 'width', 'mbc', 'lim'
      ])
    })

    it('drops after the hovered target when the pointer is right of centre', () => {
      const { props } = renderStrip()
      const dt = dataTransfer()

      // Dragging clip (1) onto the right half of tube (2) inserts it after tube.
      fireEvent.dragStart(gripOf('SOFT CLIP'), { dataTransfer: dt })
      dragOver(moduleAt('TUBE SAT'), 'right', dt)
      fireEvent.drop(moduleAt('TUBE SAT'), { dataTransfer: dt })

      expect(props.onReorder).toHaveBeenCalledWith([
        'tube', 'clip', 'subeq', 'comp', 'max', 'addeq', 'tape', 'width', 'mbc', 'lim'
      ])
    })

    it('shows a drop indicator while dragging and marks the dragged module', () => {
      renderStrip()
      const dt = dataTransfer()
      expect(document.querySelector('.mbs-drop-ind')).toBeNull()
      fireEvent.dragStart(gripOf('SOFT CLIP'), { dataTransfer: dt })
      expect(moduleAt('SOFT CLIP').className).toContain('mbs-module-dragging')
      dragOver(moduleAt('TUBE SAT'), 'left', dt)
      expect(document.querySelector('.mbs-drop-ind')).not.toBeNull()

      fireEvent.dragEnd(gripOf('SOFT CLIP'))
      expect(document.querySelector('.mbs-drop-ind')).toBeNull()
      expect(moduleAt('SOFT CLIP').className).not.toContain('mbs-module-dragging')
    })

    it('does not reorder when the module is dropped back on itself', () => {
      const { props } = renderStrip()
      const dt = dataTransfer()
      const clip = moduleAt('SOFT CLIP')

      fireEvent.dragStart(gripOf('SOFT CLIP'), { dataTransfer: dt })
      // Left half of its own slot resolves to its current index: a no-op move.
      dragOver(clip, 'left', dt)
      fireEvent.drop(clip, { dataTransfer: dt })
      expect(props.onReorder).not.toHaveBeenCalled()
    })

    it('ignores a drop with no drag in progress and a dragOver without a drag', () => {
      const { props } = renderStrip()
      const dt = dataTransfer()
      const tube = moduleAt('TUBE SAT')

      fireEvent.dragOver(tube, { dataTransfer: dt, clientX: 10 })
      fireEvent.drop(tube, { dataTransfer: dt })
      expect(props.onReorder).not.toHaveBeenCalled()
      expect(document.querySelector('.mbs-drop-ind')).toBeNull()
    })
  })

  describe('rack scrolling', () => {
    it('scrolls horizontally on shift+wheel and ignores an unmodified wheel', () => {
      renderStrip()
      const rack = screen.getByRole('region', { name: 'Master bus rack' })
      expect(rack.scrollLeft).toBe(0)
      fireEvent.wheel(rack, { deltaY: 120 })
      expect(rack.scrollLeft).toBe(0)
      fireEvent.wheel(rack, { deltaY: 120, shiftKey: true })
      expect(rack.scrollLeft).toBe(120)
      // A shift+wheel with no vertical delta is not a scroll gesture.
      fireEvent.wheel(rack, { deltaY: 0, shiftKey: true })
      expect(rack.scrollLeft).toBe(120)
    })

    it('scrolls with arrow keys only when the rack itself has focus', () => {
      renderStrip()
      const rack = screen.getByRole('region', { name: 'Master bus rack' })
      fireEvent.keyDown(rack, { key: 'ArrowRight' })
      expect(rack.scrollLeft).toBe(80)
      fireEvent.keyDown(rack, { key: 'ArrowLeft' })
      expect(rack.scrollLeft).toBe(0)
      // Non-arrow keys are left to the browser.
      fireEvent.keyDown(rack, { key: 'Home' })
      expect(rack.scrollLeft).toBe(0)
      // A key from a descendant control must not scroll the rack.
      fireEvent.keyDown(screen.getByRole('slider', { name: 'GAIN STAGE TRIM' }), { key: 'ArrowRight' })
      expect(rack.scrollLeft).toBe(0)
    })
  })

  describe('meter readouts', () => {
    it('shows -- for a non-finite input level and lights both peak LEDs', () => {
      renderStrip({ meters: neutralMeters({ vuDb: Number.NEGATIVE_INFINITY, peakL: true, peakR: true }) })
      const input = screen.getByRole('region', { name: 'Input meter' })
      expect(input.querySelector('.mbs-in-db')!.textContent).toBe('--')
      expect(input.querySelectorAll('.mbs-pk-led-lit')).toHaveLength(2)
      expect(document.body.textContent).not.toContain('NaN')
    })

    it('renders a finite input level and unlit peak LEDs', () => {
      renderStrip({ meters: neutralMeters({ vuDb: -6.25 }) })
      const input = screen.getByRole('region', { name: 'Input meter' })
      expect(input.querySelector('.mbs-in-db')!.textContent).toBe('-6.3 dBFS')
      expect(input.querySelectorAll('.mbs-pk-led-lit')).toHaveLength(0)
    })

    it('marks the LUFS and true-peak bars hot only past their thresholds', () => {
      renderStrip({ meters: neutralMeters({ integratedLufs: -30, truePeakDbtp: -20 }) })
      expect(document.querySelectorAll('.mbs-fill-hot')).toHaveLength(0)

      renderStrip({ meters: neutralMeters({ integratedLufs: -5, truePeakDbtp: -0.1 }) })
      expect(document.querySelectorAll('.mbs-fill-hot').length).toBeGreaterThan(0)
    })
  })
})
