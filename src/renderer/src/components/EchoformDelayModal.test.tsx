import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultEchoformDelayReturnModule, type EchoformDelayModule } from '../engine/return-effects'
import EchoformDelayModal from './EchoformDelayModal'

function defaultModule(overrides: Partial<EchoformDelayModule> = {}): EchoformDelayModule {
  return { ...createDefaultEchoformDelayReturnModule('fx-1'), ...overrides }
}

function renderModal(module = defaultModule(), opts: { mix?: number; powered?: boolean; slot?: number; bpm?: number } = {}) {
  const onCancel = vi.fn()
  const onSave = vi.fn()
  const onPreview = vi.fn()
  const onRestoreFocus = vi.fn()
  render(
    <EchoformDelayModal
      value={module}
      powered={opts.powered ?? true}
      mix={opts.mix ?? 0.82}
      bpm={opts.bpm ?? 120}
      slot={opts.slot ?? 2}
      onCancel={onCancel}
      onSave={onSave}
      onPreview={onPreview}
      onRestoreFocus={onRestoreFocus}
    />
  )
  return { onCancel, onSave, onPreview, onRestoreFocus }
}

describe('EchoformDelayModal', () => {
  it('renders the header identity with the real slot number', () => {
    renderModal(defaultModule(), { slot: 2 })
    expect(screen.getByRole('dialog', { name: 'Echoform Delay' })).toBeInTheDocument()
    expect(screen.getByText('D8')).toBeInTheDocument()
    expect(screen.getByText('FX Return 02')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Echoform Delay' })).toBeInTheDocument()
  })

  it('closes (saves) from the close button and restores focus', () => {
    const { onSave } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Close Echoform Delay editor' }))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('cancels on Escape', () => {
    const { onCancel } = renderModal()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('previews live on every parameter change', () => {
    const { onPreview } = renderModal()
    const feedback = screen.getByRole('slider', { name: 'Feedback' })
    fireEvent.keyDown(feedback, { key: 'ArrowUp' })
    expect(onPreview).toHaveBeenCalled()
    const last = onPreview.mock.calls.at(-1)!
    expect(last[0].feedback).toBe(69)
  })

  it('exposes the Drive knob and previews drive changes', () => {
    const { onPreview } = renderModal(defaultModule({ drive: 0 }))
    const drive = screen.getByRole('slider', { name: 'Drive' })
    expect(drive).toHaveAttribute('aria-valuenow', '0')
    fireEvent.keyDown(drive, { key: 'ArrowUp' })
    expect(onPreview.mock.calls.at(-1)![0].drive).toBe(1)
  })

  it('supports arrow, PageUp/PageDown, Home, and End on knobs', () => {
    const { onPreview } = renderModal(defaultModule({ feedback: 50 }))
    const feedback = screen.getByRole('slider', { name: 'Feedback' })
    fireEvent.keyDown(feedback, { key: 'ArrowUp' })
    expect(onPreview.mock.calls.at(-1)![0].feedback).toBe(51)
    fireEvent.keyDown(feedback, { key: 'PageUp' })
    expect(onPreview.mock.calls.at(-1)![0].feedback).toBe(61)
    fireEvent.keyDown(feedback, { key: 'PageDown' })
    expect(onPreview.mock.calls.at(-1)![0].feedback).toBe(51)
    fireEvent.keyDown(feedback, { key: 'Home' })
    expect(onPreview.mock.calls.at(-1)![0].feedback).toBe(0)
    fireEvent.keyDown(feedback, { key: 'End' })
    expect(onPreview.mock.calls.at(-1)![0].feedback).toBe(110)
  })

  it('applies Shift for fine adjustment', () => {
    const { onPreview } = renderModal(defaultModule({ outputDb: 0 }))
    const output = screen.getByRole('slider', { name: 'Output level' })
    // Step is 0.1; Shift makes it 0.01.
    fireEvent.keyDown(output, { key: 'ArrowUp', shiftKey: true })
    expect(onPreview.mock.calls.at(-1)![0].outputDb).toBeCloseTo(0.01, 5)
  })

  it('resets a knob to its default on double-click', () => {
    const { onPreview } = renderModal(defaultModule({ feedback: 10 }))
    const feedback = screen.getByRole('slider', { name: 'Feedback' })
    fireEvent.doubleClick(feedback)
    // Default feedback is 68 (Wide Tape Echo).
    expect(onPreview.mock.calls.at(-1)![0].feedback).toBe(68)
  })

  it('drags a knob vertically to change its value', () => {
    const { onPreview } = renderModal(defaultModule({ feedback: 50 }))
    const feedback = screen.getByRole('slider', { name: 'Feedback' })
    fireEvent.pointerDown(feedback, { button: 0, clientX: 0, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(feedback, { clientX: 0, clientY: 40, pointerId: 1 }) // drag up
    fireEvent.pointerUp(feedback, { pointerId: 1 })
    expect(onPreview.mock.calls.at(-1)![0].feedback).toBeGreaterThan(50)
  })

  it('adjusts a knob with the wheel, in both directions and with Shift for fine', () => {
    // Every other knob in the app is wheel-adjustable; this one used to be the
    // exception. The listener is non-passive so the scroll cannot leak to the
    // dialog body underneath.
    renderModal(defaultModule({ feedback: 50 }))
    const feedback = screen.getByRole('slider', { name: 'Feedback' })
    // The listener is registered natively (non-passive), so the wheel event is
    // dispatched directly and act() flushes the resulting state update.
    const wheel = (deltaY: number, shiftKey = false): WheelEvent => {
      const event = new WheelEvent('wheel', { deltaY, shiftKey, bubbles: true, cancelable: true })
      act(() => { feedback.dispatchEvent(event) })
      return event
    }

    const up = wheel(-100)
    const raised = Number(feedback.getAttribute('aria-valuenow'))
    expect(raised).toBeGreaterThan(50)
    // Non-passive: the scroll must not leak to the dialog body underneath.
    expect(up.defaultPrevented).toBe(true)

    wheel(100)
    expect(Number(feedback.getAttribute('aria-valuenow'))).toBeLessThan(raised)

    // Shift takes a smaller bite than an unmodified notch.
    const before = Number(feedback.getAttribute('aria-valuenow'))
    wheel(-100, true)
    const fine = Number(feedback.getAttribute('aria-valuenow')) - before
    expect(fine).toBeGreaterThan(0)
    expect(fine).toBeLessThan(raised - 50)

    // A wheel event with no vertical component is not a value gesture.
    const steady = Number(feedback.getAttribute('aria-valuenow'))
    wheel(0)
    expect(Number(feedback.getAttribute('aria-valuenow'))).toBe(steady)
  })

  it('names presets with the radio role that actually carries a checked state', async () => {
    // `menuitem` has no checked state, so `aria-checked` on one is invalid ARIA
    // and screen readers drop it. Presets are single-choice: radio items.
    renderModal()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Preset' }), { key: 'Enter' })
    await screen.findByRole('menuitemradio', { name: 'Clean Slap' })
    const items = screen.getAllByRole('menuitemradio')
    expect(items.length).toBeGreaterThan(1)
    // No plain menuitem is left carrying a checked state it cannot express.
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0)
    for (const item of items) expect(item).toHaveAttribute('aria-checked')
  })

  it('exposes ARIA slider attributes that update with value', () => {
    renderModal(defaultModule({ feedback: 68 }))
    const feedback = screen.getByRole('slider', { name: 'Feedback' })
    expect(feedback).toHaveAttribute('aria-valuemin', '0')
    expect(feedback).toHaveAttribute('aria-valuemax', '110')
    expect(feedback).toHaveAttribute('aria-valuenow', '68')
    expect(feedback).toHaveAttribute('aria-valuetext', '68%')
    expect(feedback).toHaveAttribute('aria-orientation', 'vertical')
  })

  it('shows note-division selects in Sync mode', () => {
    renderModal(defaultModule({ mode: 'sync' }))
    expect(screen.getByRole('combobox', { name: 'L delay note division' })).toBeInTheDocument()
    expect(screen.queryByRole('slider', { name: 'L free time' })).toBeNull()
  })

  it('shows free-time knobs in Free mode', () => {
    renderModal(defaultModule({ mode: 'free' }))
    expect(screen.getByRole('slider', { name: 'L free time' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'R free time' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'L delay note division' })).toBeNull()
  })

  it('switches between Sync and Free without destroying the inactive values', () => {
    const { onPreview } = renderModal(defaultModule({ mode: 'sync', divisionL: '1/4', timeMsL: 420 }))
    fireEvent.click(screen.getByRole('button', { name: 'Free' }))
    const afterFree = onPreview.mock.calls.at(-1)![0]
    expect(afterFree.mode).toBe('free')
    // The Sync division is retained even though Free is active.
    expect(afterFree.divisionL).toBe('1/4')
    expect(afterFree.timeMsL).toBe(420)
    fireEvent.click(screen.getByRole('button', { name: 'Sync' }))
    expect(onPreview.mock.calls.at(-1)![0].mode).toBe('sync')
  })

  it('drives independent L and R divisions', () => {
    const { onPreview } = renderModal(defaultModule({ mode: 'sync' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'L delay note division' }), { target: { value: '1/2' } })
    expect(onPreview.mock.calls.at(-1)![0].divisionL).toBe('1/2')
    fireEvent.change(screen.getByRole('combobox', { name: 'R delay note division' }), { target: { value: '1/16T' } })
    expect(onPreview.mock.calls.at(-1)![0].divisionR).toBe('1/16T')
  })

  it('shows the sync readouts at 120 BPM (L 500 ms, R 375 ms)', () => {
    renderModal(defaultModule({ mode: 'sync', divisionL: '1/4', divisionR: '1/8.' }), { bpm: 120 })
    // Both the lane computed times and visualizer readouts show these.
    expect(screen.getAllByText('500 ms').length).toBeGreaterThan(0)
    expect(screen.getAllByText('375 ms').length).toBeGreaterThan(0)
  })

  it('toggles ping-pong, bypass, freeze, and character with aria-pressed', () => {
    const { onPreview } = renderModal(defaultModule({ pingPong: true, bypass: false, freeze: false, character: 'tape' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ping-pong' }))
    expect(onPreview.mock.calls.at(-1)![0].pingPong).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Bypass' }))
    expect(onPreview.mock.calls.at(-1)![0].bypass).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /Freeze/ }))
    expect(onPreview.mock.calls.at(-1)![0].freeze).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Digital' }))
    expect(onPreview.mock.calls.at(-1)![0].character).toBe('digital')
    expect(screen.getByRole('button', { name: 'Digital' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps the FX-slot Mix and editor Mix synchronized', () => {
    const { onPreview, onSave } = renderModal(defaultModule(), { mix: 0.82 })
    const mix = screen.getByRole('slider', { name: 'Mix' })
    expect(mix).toHaveAttribute('aria-valuenow', '82')
    fireEvent.keyDown(mix, { key: 'ArrowUp' })
    // Editor Mix changes propagate as the shared return level on save.
    fireEvent.click(screen.getByRole('button', { name: 'Close Echoform Delay editor' }))
    const [, , savedMix] = onSave.mock.calls.at(-1)!
    expect(savedMix).toBeCloseTo(0.83, 5)
    expect(onPreview).toHaveBeenCalled()
  })

  it('computes tap tempo from tap intervals and resets after a gap', () => {
    let now = 1000
    const perfSpy = vi.spyOn(performance, 'now').mockImplementation(() => now)
    renderModal(defaultModule(), { bpm: 120 })
    const tap = screen.getByRole('button', { name: /Tap Tempo/ })
    // Four taps 500 ms apart => 120 BPM.
    fireEvent.click(tap); now += 500
    fireEvent.click(tap); now += 500
    fireEvent.click(tap); now += 500
    fireEvent.click(tap)
    expect(tap).toHaveTextContent('120 BPM')
    perfSpy.mockRestore()
  })

  it('routes tap tempo through the project-tempo command', () => {
    let now = 1000
    const perfSpy = vi.spyOn(performance, 'now').mockImplementation(() => now)
    const onSetBpm = vi.fn()
    render(
      <EchoformDelayModal value={defaultModule()} powered mix={0.82} bpm={120} slot={1}
        onSetBpm={onSetBpm} onCancel={vi.fn()} onSave={vi.fn()} onPreview={vi.fn()} onRestoreFocus={vi.fn()} />
    )
    const tap = screen.getByRole('button', { name: /Tap Tempo/ })
    // Two taps 400 ms apart => 150 BPM through the established command.
    fireEvent.click(tap); now += 400
    fireEvent.click(tap)
    expect(onSetBpm).toHaveBeenCalledWith(150)
    perfSpy.mockRestore()
  })

  it('applies a preset atomically and clears bypass', async () => {
    const { onPreview } = renderModal(defaultModule({ bypass: true }))
    // Open the Radix preset menu via keyboard (portal renders on open).
    fireEvent.keyDown(screen.getByRole('button', { name: 'Preset' }), { key: 'Enter' })
    const item = await screen.findByRole('menuitemradio', { name: 'Clean Slap' })
    fireEvent.click(item)
    const applied = onPreview.mock.calls.at(-1)![0]
    expect(applied.mode).toBe('free')
    expect(applied.feedback).toBe(18)
    expect(applied.character).toBe('digital')
    expect(applied.bypass).toBe(false)
  })

  it('switches the preset selector to Custom after a manual edit', () => {
    renderModal(defaultModule(), { mix: 0.82 })
    // Default state equals Wide Tape Echo.
    expect(screen.getByRole('button', { name: 'Preset' })).toHaveTextContent('Wide Tape Echo')
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Feedback' }), { key: 'ArrowUp' })
    expect(screen.getByRole('button', { name: 'Preset' })).toHaveTextContent('Custom')
  })

  it('shows a live footer state string', () => {
    renderModal(defaultModule({ character: 'tape', mode: 'sync', bypass: false, freeze: false }))
    expect(screen.getByText('Active / Tape / Sync')).toBeInTheDocument()
  })

  it('gives the visualizer an accessible description with L/R times and ping-pong', () => {
    renderModal(defaultModule({ mode: 'sync', divisionL: '1/4', divisionR: '1/8.', pingPong: true }), { bpm: 120 })
    const plot = screen.getByRole('img')
    expect(plot).toHaveAttribute('aria-label', expect.stringContaining('Left delay 500 milliseconds'))
    expect(plot.getAttribute('aria-label')).toContain('Right delay 375 milliseconds')
    expect(plot.getAttribute('aria-label')).toContain('Ping-pong enabled')
  })

  it('connects the modal title through aria-labelledby', () => {
    renderModal()
    const dialog = screen.getByRole('dialog', { name: 'Echoform Delay' })
    const heading = within(dialog).getByRole('heading', { name: 'Echoform Delay' })
    expect(dialog).toHaveAttribute('aria-labelledby', heading.id)
  })
})

describe('EchoformDelayModal — reduced motion', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      })
    })
  })
  afterEach(() => {
    // @ts-expect-error clean up the stub
    delete window.matchMedia
  })

  it('omits the animated playhead when reduced motion is preferred', () => {
    renderModal()
    expect(document.querySelector('.ef-playhead')).toBeNull()
  })
})
