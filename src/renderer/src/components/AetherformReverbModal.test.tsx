import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultAetherformReverbReturnModule, type AetherformReverbModule } from '../engine/return-effects'
import AetherformReverbModal from './AetherformReverbModal'

function defaultModule(overrides: Partial<AetherformReverbModule> = {}): AetherformReverbModule {
  return { ...createDefaultAetherformReverbReturnModule('fx-1'), ...overrides }
}

function renderModal(
  module = defaultModule(),
  opts: { mix?: number; powered?: boolean; slot?: number } = {}
) {
  const onCancel = vi.fn()
  const onSave = vi.fn()
  const onPreview = vi.fn()
  const onClearTail = vi.fn()
  const onRestoreFocus = vi.fn()
  render(
    <AetherformReverbModal
      value={module}
      powered={opts.powered ?? true}
      mix={opts.mix ?? 0.88}
      slot={opts.slot ?? 1}
      onCancel={onCancel}
      onSave={onSave}
      onPreview={onPreview}
      onClearTail={onClearTail}
      onRestoreFocus={onRestoreFocus}
    />
  )
  return { onCancel, onSave, onPreview, onClearTail, onRestoreFocus }
}

describe('AetherformReverbModal', () => {
  it('renders the header identity with the real slot number', () => {
    renderModal(defaultModule(), { slot: 3 })
    expect(screen.getByRole('dialog', { name: 'Aetherform Reverb' })).toBeInTheDocument()
    expect(screen.getByText('RV')).toBeInTheDocument()
    expect(screen.getByText('FX Return 03')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Aetherform Reverb' })).toBeInTheDocument()
  })

  it('closes (saves) from the close button', () => {
    const { onSave } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Close Aetherform Reverb editor' }))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('cancels on Escape', () => {
    const { onCancel } = renderModal()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('connects the modal title through aria-labelledby', () => {
    renderModal()
    const dialog = screen.getByRole('dialog', { name: 'Aetherform Reverb' })
    const heading = within(dialog).getByRole('heading', { name: 'Aetherform Reverb' })
    expect(dialog).toHaveAttribute('aria-labelledby', heading.id)
  })

  it('previews live on every parameter change', () => {
    const { onPreview } = renderModal()
    const decay = screen.getByRole('slider', { name: 'Decay' })
    fireEvent.keyDown(decay, { key: 'ArrowUp' })
    expect(onPreview).toHaveBeenCalled()
    const last = onPreview.mock.calls.at(-1)!
    expect(last[0].decaySeconds).toBeCloseTo(2.9, 5)
  })

  it('exposes the Drive knob and previews drive changes', () => {
    const { onPreview } = renderModal(defaultModule({ drivePercent: 0 }))
    const drive = screen.getByRole('slider', { name: 'Drive' })
    expect(drive).toHaveAttribute('aria-valuenow', '0')
    fireEvent.keyDown(drive, { key: 'ArrowUp' })
    expect(onPreview.mock.calls.at(-1)![0].drivePercent).toBe(1)
  })

  it('supports arrow, PageUp/PageDown, Home, and End on knobs', () => {
    const { onPreview } = renderModal(defaultModule({ sizePercent: 50 }))
    const size = screen.getByRole('slider', { name: 'Size' })
    fireEvent.keyDown(size, { key: 'ArrowUp' })
    expect(onPreview.mock.calls.at(-1)![0].sizePercent).toBe(51)
    fireEvent.keyDown(size, { key: 'PageUp' })
    expect(onPreview.mock.calls.at(-1)![0].sizePercent).toBe(61)
    fireEvent.keyDown(size, { key: 'PageDown' })
    expect(onPreview.mock.calls.at(-1)![0].sizePercent).toBe(51)
    fireEvent.keyDown(size, { key: 'Home' })
    expect(onPreview.mock.calls.at(-1)![0].sizePercent).toBe(5)
    fireEvent.keyDown(size, { key: 'End' })
    expect(onPreview.mock.calls.at(-1)![0].sizePercent).toBe(100)
  })

  it('applies Shift for fine adjustment', () => {
    const { onPreview } = renderModal(defaultModule({ outputDb: 0 }))
    const output = screen.getByRole('slider', { name: 'Level' })
    fireEvent.keyDown(output, { key: 'ArrowUp', shiftKey: true })
    expect(onPreview.mock.calls.at(-1)![0].outputDb).toBeCloseTo(0.01, 5)
  })

  it('resets a knob to its default on double-click', () => {
    const { onPreview } = renderModal(defaultModule({ preDelayMs: 200 }))
    const preDelay = screen.getByRole('slider', { name: 'Pre-delay' })
    fireEvent.doubleClick(preDelay)
    expect(onPreview.mock.calls.at(-1)![0].preDelayMs).toBe(24)
  })

  it('drags a knob vertically to change its value', () => {
    const { onPreview } = renderModal(defaultModule({ sizePercent: 50 }))
    const size = screen.getByRole('slider', { name: 'Size' })
    fireEvent.pointerDown(size, { button: 0, clientX: 0, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(size, { clientX: 0, clientY: 40, pointerId: 1 })
    fireEvent.pointerUp(size, { pointerId: 1 })
    expect(onPreview.mock.calls.at(-1)![0].sizePercent).toBeGreaterThan(50)
  })

  it('adjusts a knob with a non-passive wheel listener', () => {
    renderModal(defaultModule({ sizePercent: 50 }))
    const size = screen.getByRole('slider', { name: 'Size' })
    const event = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })
    act(() => { size.dispatchEvent(event) })
    expect(Number(size.getAttribute('aria-valuenow'))).toBeGreaterThan(50)
    expect(event.defaultPrevented).toBe(true)
  })

  it('exposes ARIA slider attributes that update with value', () => {
    renderModal(defaultModule({ widthPercent: 148 }))
    const width = screen.getByRole('slider', { name: 'Width' })
    expect(width).toHaveAttribute('aria-valuemin', '0')
    expect(width).toHaveAttribute('aria-valuemax', '200')
    expect(width).toHaveAttribute('aria-valuenow', '148')
    expect(width).toHaveAttribute('aria-valuetext', '148%')
    expect(width).toHaveAttribute('aria-orientation', 'vertical')
  })

  it('selects the space model through a labelled combobox', () => {
    const { onPreview } = renderModal()
    const model = screen.getByRole('combobox', { name: 'Reverb space model' })
    fireEvent.change(model, { target: { value: 'hall' } })
    expect(onPreview.mock.calls.at(-1)![0].spaceModel).toBe('hall')
  })

  it('selects the character as a single-selection group with descriptions', () => {
    const { onPreview } = renderModal(defaultModule({ character: 'vintage' }))
    expect(screen.getByText('Rounded reflections with a gently darkened tail.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Bloom' }))
    expect(onPreview.mock.calls.at(-1)![0].character).toBe('bloom')
    expect(screen.getByRole('button', { name: 'Bloom' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Vintage' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Soft onset with a wide tail that opens as it decays.')).toBeInTheDocument()
  })

  it('shows the early/late readout as Balanced, Late, or Early', () => {
    renderModal(defaultModule({ lateBalancePercent: 72 }))
    expect(screen.getAllByText('72% Late').length).toBeGreaterThan(0)
    const slider = screen.getByRole('slider', { name: 'Early and late reverb balance' })
    expect(slider).toHaveAttribute('aria-valuetext', '72% Late')
  })

  it('renders the Balanced and Early readouts for the other balance ranges', () => {
    renderModal(defaultModule({ lateBalancePercent: 50 }))
    expect(screen.getByRole('slider', { name: 'Early and late reverb balance' }))
      .toHaveAttribute('aria-valuetext', 'Balanced')
  })

  it('shows the complementary Early percentage below 50', () => {
    renderModal(defaultModule({ lateBalancePercent: 30 }))
    expect(screen.getByRole('slider', { name: 'Early and late reverb balance' }))
      .toHaveAttribute('aria-valuetext', '70% Early')
  })

  it('toggles early reflections, shimmer, freeze, and bypass with aria-pressed', () => {
    const { onPreview } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Early reflections' }))
    expect(onPreview.mock.calls.at(-1)![0].earlyReflectionsEnabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: /^Shimmer/ }))
    expect(onPreview.mock.calls.at(-1)![0].shimmerEnabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /Freeze/ }))
    expect(onPreview.mock.calls.at(-1)![0].freeze).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Bypass' }))
    expect(onPreview.mock.calls.at(-1)![0].bypass).toBe(true)
  })

  it('keeps the retained shimmer amount and interval when shimmer is toggled off', () => {
    const { onPreview } = renderModal(defaultModule({
      shimmerEnabled: true, shimmerAmountPercent: 42, shimmerIntervalSemitones: 19
    }))
    fireEvent.click(screen.getByRole('button', { name: /^Shimmer/ }))
    const after = onPreview.mock.calls.at(-1)![0]
    expect(after.shimmerEnabled).toBe(false)
    expect(after.shimmerAmountPercent).toBe(42)
    expect(after.shimmerIntervalSemitones).toBe(19)
  })

  it('offers all four shimmer intervals through a labelled selector', () => {
    const { onPreview } = renderModal()
    const interval = screen.getByRole('combobox', { name: 'Shimmer pitch interval' })
    const options = within(interval).getAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual(
      ['+7 Fifth', '+12 Octave', '+19 Oct + fifth', '+24 Two oct']
    )
    fireEvent.change(interval, { target: { value: '24' } })
    expect(onPreview.mock.calls.at(-1)![0].shimmerIntervalSemitones).toBe(24)
  })

  it('sends a single Clear Tail command without touching parameters or preset', () => {
    const { onClearTail, onPreview } = renderModal()
    expect(screen.getByRole('button', { name: 'Preset' })).toHaveTextContent('Warm Chamber')
    const previewCallsBefore = onPreview.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: /Clear tail/ }))
    expect(onClearTail).toHaveBeenCalledTimes(1)
    // Clear Tail is momentary: no draft change, no preset change.
    expect(onPreview.mock.calls.length).toBe(previewCallsBefore)
    expect(screen.getByRole('button', { name: 'Preset' })).toHaveTextContent('Warm Chamber')
  })

  it('keeps the FX-slot Mix and editor Mix synchronized', () => {
    const { onSave } = renderModal(defaultModule(), { mix: 0.88 })
    const mix = screen.getByRole('slider', { name: 'Mix' })
    expect(mix).toHaveAttribute('aria-valuenow', '88')
    fireEvent.keyDown(mix, { key: 'ArrowUp' })
    fireEvent.click(screen.getByRole('button', { name: 'Close Aetherform Reverb editor' }))
    const [, , savedMix] = onSave.mock.calls.at(-1)!
    expect(savedMix).toBeCloseTo(0.89, 5)
  })

  it('names presets with the radio role that carries a checked state', async () => {
    renderModal()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Preset' }), { key: 'Enter' })
    await screen.findByRole('menuitemradio', { name: 'Shimmer Cloud' })
    const items = screen.getAllByRole('menuitemradio')
    expect(items).toHaveLength(7)
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0)
    for (const item of items) expect(item).toHaveAttribute('aria-checked')
  })

  it('applies a preset atomically, clears bypass, and updates Mix', async () => {
    const { onPreview } = renderModal(defaultModule({ bypass: true }))
    fireEvent.keyDown(screen.getByRole('button', { name: 'Preset' }), { key: 'Enter' })
    const item = await screen.findByRole('menuitemradio', { name: 'Shimmer Cloud' })
    fireEvent.click(item)
    const call = onPreview.mock.calls.at(-1)!
    const applied = call[0]
    expect(applied.spaceModel).toBe('hall')
    expect(applied.character).toBe('bloom')
    expect(applied.decaySeconds).toBe(12.4)
    expect(applied.shimmerEnabled).toBe(true)
    expect(applied.shimmerAmountPercent).toBe(72)
    expect(applied.earlyReflectionsEnabled).toBe(false)
    expect(applied.bypass).toBe(false)
    expect(call[2]).toBeCloseTo(0.98, 5)
  })

  it('switches the preset selector to Custom after a manual edit', () => {
    renderModal(defaultModule(), { mix: 0.88 })
    expect(screen.getByRole('button', { name: 'Preset' })).toHaveTextContent('Warm Chamber')
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Decay' }), { key: 'ArrowUp' })
    expect(screen.getByRole('button', { name: 'Preset' })).toHaveTextContent('Custom')
  })

  it('shows a live footer state string including shimmer', () => {
    renderModal(defaultModule({
      shimmerEnabled: true, shimmerIntervalSemitones: 19, freeze: true, character: 'bloom', spaceModel: 'hall'
    }))
    expect(screen.getByText('Held / Hall / Bloom / Shimmer +19')).toBeInTheDocument()
  })

  it('shows the bypassed footer state', () => {
    renderModal(defaultModule({ bypass: true, spaceModel: 'plate', character: 'natural' }))
    expect(screen.getByText('Bypassed / Plate / Natural')).toBeInTheDocument()
  })

  it('gives the visualizer an accessible description of the field', () => {
    renderModal(defaultModule({
      preDelayMs: 24, decaySeconds: 2.8, sizePercent: 68, diffusionPercent: 78,
      densityPercent: 84, shimmerEnabled: true, shimmerAmountPercent: 24, shimmerIntervalSemitones: 12
    }))
    const plot = screen.getByRole('img')
    const label = plot.getAttribute('aria-label') ?? ''
    expect(label).toContain('Chamber reverb decay visualization')
    expect(label).toContain('Pre-delay 24 milliseconds')
    expect(label).toContain('Decay 2.8 seconds')
    expect(label).toContain('Size 68 percent')
    expect(label).toContain('Diffusion 78 percent')
    expect(label).toContain('Density 84 percent')
    expect(label).toContain('Early reflections enabled')
    expect(label).toContain('enabled at 24 percent with a plus 12 semitone interval')
  })

  it('renders shimmer nodes only when shimmer is active', () => {
    renderModal(defaultModule({ shimmerEnabled: false }))
    expect(document.querySelector('.af-shimmer-node')).toBeNull()
  })

  it('renders shimmer nodes when shimmer is on with a non-zero amount', () => {
    renderModal(defaultModule({ shimmerEnabled: true, shimmerAmountPercent: 60 }))
    expect(document.querySelectorAll('.af-shimmer-node').length).toBeGreaterThan(0)
    expect(screen.getByText('Shimmer +12 / 60%')).toBeInTheDocument()
  })

  it('removes early nodes when early reflections are disabled', () => {
    renderModal(defaultModule({ earlyReflectionsEnabled: false }))
    expect(document.querySelector('.af-field-node-early')).toBeNull()
    expect(document.querySelectorAll('.af-field-node').length).toBeGreaterThan(0)
  })
})

describe('AetherformReverbModal — reduced motion', () => {
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
    expect(document.querySelector('.af-field-playhead')).toBeNull()
  })
})
