import { fireEvent, render, screen } from '@testing-library/react'
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
    expect(modules[0].getAttribute('aria-label')).toBe('Input meter')
    expect(modules[12].getAttribute('aria-label')).toBe('Output meter')
    expect(modules[0].className).toContain('mbs-module-meter')
    expect(modules[12].className).toContain('mbs-module-meter')
  })

  it('renders the processors in state.order', () => {
    const state = defaultMasterBusState()
    state.order = ['clip', 'gain', ...state.order.filter((id) => id !== 'clip' && id !== 'gain')]
    renderStrip({ state })
    const labels = [...document.querySelectorAll('.mbs-module')].map((el) => el.getAttribute('aria-label'))
    expect(labels[1]).toBe('SOFT CLIP')
    expect(labels[2]).toBe('GAIN STAGE')
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

  it('swaps with the right neighbor on ArrowRight and clamps at the rack start', () => {
    const { props } = renderStrip()
    const clipGrip = screen.getByRole('button', { name: 'Move SOFT CLIP. Use left and right arrow keys.' })
    fireEvent.keyDown(clipGrip, { key: 'ArrowRight' })
    expect(props.onReorder).toHaveBeenCalledWith([
      'gain', 'tube', 'clip', 'subeq', 'comp', 'max', 'addeq', 'tape', 'width', 'mbc', 'lim'
    ])

    const gainGrip = screen.getByRole('button', { name: 'Move GAIN STAGE. Use left and right arrow keys.' })
    fireEvent.keyDown(gainGrip, { key: 'ArrowLeft' })
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
})
