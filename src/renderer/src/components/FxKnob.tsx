// The FX editor knob, owned in one place.
//
// Both Return editors need a rotary control whose scale can be perceptual
// (log), which the shared `RotaryControl` does not support: it quantizes
// linearly against raw min/max, so a 20 Hz - 2 kHz sweep is unusable on a
// linear drag. Each editor used to carry its own ~110-line copy of this
// control, kept in step by hand. They had already drifted.
//
// This module is that control. The interaction contract — drag weighting,
// wheel sensitivity, Shift for fine steps, the six keyboard bindings,
// double-click to default — is therefore stated once, so identical gestures
// cannot behave differently across FX.
//
// Each editor keeps its own CSS namespace (`ef-`, `af-`), passed as
// `classPrefix`, so the two skins stay independent while the behavior does not.
import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { clamp } from '../lib/sample-utils'

/** Drag weighting: vertical dominates, horizontal assists. */
const HORIZONTAL_DRAG_WEIGHT = 0.55
const DRAG_SENSITIVITY = 0.006
const FINE_DRAG_SENSITIVITY = 0.0012
const WHEEL_SENSITIVITY = 0.04
const FINE_WHEEL_SENSITIVITY = 0.01
/** Shift divides the step by this much for fine adjustment. */
const FINE_STEP_DIVISOR = 10
/** PageUp/PageDown move this many steps. */
const PAGE_STEP_MULTIPLIER = 10
/** Sweep of the knob arc, centred on 12 o'clock. */
const ARC_DEGREES = 270
const ARC_START_DEGREES = -135
/** Log curves cannot reach zero; this is the floor they map from. */
const LOG_FLOOR = 1e-4

export interface FxKnobSpec {
  min: number
  max: number
  step: number
  /** Perceptual skew for wide-range (frequency/time) controls. */
  curve?: 'log'
  defaultValue: number
  format: (value: number) => string
  /** Tint hint. `shimmer` is Aetherform-only; unknown tones render untinted. */
  tone?: 'warm' | 'cool' | 'shimmer'
}

export function toNormalized(spec: FxKnobSpec, value: number): number {
  const bounded = clamp(value, spec.min, spec.max)
  if (spec.curve === 'log') {
    const low = Math.log(Math.max(LOG_FLOOR, spec.min))
    const high = Math.log(spec.max)
    return (Math.log(Math.max(LOG_FLOOR, bounded)) - low) / (high - low)
  }
  return (bounded - spec.min) / (spec.max - spec.min)
}

export function quantize(spec: FxKnobSpec, value: number, step = spec.step): number {
  const stepped = Math.round((value - spec.min) / step) * step + spec.min
  const decimals = step < 1 ? (String(step).split('.')[1]?.length ?? 0) : 0
  return clamp(Number(stepped.toFixed(decimals + 2)), spec.min, spec.max)
}

export function fromNormalized(spec: FxKnobSpec, normalized: number, step = spec.step): number {
  const bounded = clamp(normalized, 0, 1)
  const value = spec.curve === 'log'
    ? Math.exp(
        Math.log(Math.max(LOG_FLOOR, spec.min)) +
        bounded * (Math.log(spec.max) - Math.log(Math.max(LOG_FLOOR, spec.min)))
      )
    : spec.min + bounded * (spec.max - spec.min)
  return quantize(spec, value, step)
}

export interface FxKnobProps {
  id: string
  spec: FxKnobSpec
  label: string
  value: number
  onChange: (value: number) => void
  /** CSS namespace for this editor's skin, e.g. `ef` or `af`. */
  classPrefix: string
  /**
   * Brackets a continuous gesture so the host can batch it into one edit.
   * Optional: an editor that does not batch simply omits them.
   */
  onGestureStart?: () => void
  onGestureEnd?: () => void
}

const noop = (): void => {}

export default function FxKnob({
  id,
  spec,
  label,
  value,
  onChange,
  classPrefix,
  onGestureStart = noop,
  onGestureEnd = noop
}: FxKnobProps) {
  const dragRef = useRef<{ startY: number; startX: number; startNorm: number } | null>(null)
  const knobRef = useRef<HTMLDivElement | null>(null)
  const normalized = toNormalized(spec, value)
  const angle = ARC_START_DEGREES + normalized * ARC_DEGREES
  const fillDeg = normalized * ARC_DEGREES

  const commit = (next: number, step = spec.step): void =>
    onChange(clamp(quantize(spec, next, step), spec.min, spec.max))

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { startY: event.clientY, startX: event.clientX, startNorm: normalized }
    onGestureStart()
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (!dragRef.current) return
    const vertical = dragRef.current.startY - event.clientY
    const horizontal = event.clientX - dragRef.current.startX
    const movement = vertical + horizontal * HORIZONTAL_DRAG_WEIGHT
    const fineStep = event.shiftKey ? spec.step / FINE_STEP_DIVISOR : spec.step
    const sensitivity = event.shiftKey ? FINE_DRAG_SENSITIVITY : DRAG_SENSITIVITY
    commit(fromNormalized(spec, dragRef.current.startNorm + movement * sensitivity, fineStep), fineStep)
  }

  const endDrag = (event: PointerEvent<HTMLDivElement>): void => {
    if (!dragRef.current) return
    dragRef.current = null
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* ignore */ }
    onGestureEnd()
  }

  // Registered manually rather than via onWheel: React's wheel listener is
  // passive, so it cannot preventDefault and the scroll would leak to the
  // dialog body. Same approach as the shared RotaryControl.
  useEffect(() => {
    const knob = knobRef.current
    if (!knob) return
    const handleWheel = (event: WheelEvent): void => {
      if (event.deltaY === 0) return
      event.preventDefault()
      const fineStep = event.shiftKey ? spec.step / FINE_STEP_DIVISOR : spec.step
      const sensitivity = event.shiftKey ? FINE_WHEEL_SENSITIVITY : WHEEL_SENSITIVITY
      const direction = event.deltaY < 0 ? 1 : -1
      onGestureStart()
      onChange(
        clamp(
          quantize(spec, fromNormalized(spec, normalized + direction * sensitivity, fineStep), fineStep),
          spec.min,
          spec.max
        )
      )
      onGestureEnd()
    }
    knob.addEventListener('wheel', handleWheel, { passive: false })
    return () => knob.removeEventListener('wheel', handleWheel)
  }, [spec, normalized, onChange, onGestureStart, onGestureEnd])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const fineStep = event.shiftKey ? spec.step / FINE_STEP_DIVISOR : spec.step
    let next: number | null = null
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') next = value + fineStep
    else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') next = value - fineStep
    else if (event.key === 'PageUp') next = value + fineStep * PAGE_STEP_MULTIPLIER
    else if (event.key === 'PageDown') next = value - fineStep * PAGE_STEP_MULTIPLIER
    else if (event.key === 'Home') next = spec.min
    else if (event.key === 'End') next = spec.max
    if (next === null) return
    event.preventDefault()
    onGestureStart()
    commit(next, fineStep)
    onGestureEnd()
  }

  const toneClass = spec.tone ? ` ${classPrefix}-knob-${spec.tone}` : ''

  return (
    <div className={`${classPrefix}-knob-row`}>
      <div
        id={id}
        ref={knobRef}
        className={`${classPrefix}-knob${toneClass}`}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={spec.min}
        aria-valuemax={spec.max}
        aria-valuenow={value}
        aria-valuetext={spec.format(value)}
        aria-orientation="vertical"
        style={{ '--knob-angle': `${angle}deg`, '--knob-fill': `${fillDeg}deg` } as React.CSSProperties}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => { onGestureStart(); commit(spec.defaultValue); onGestureEnd() }}
        onKeyDown={handleKeyDown}
      >
        <span className={`${classPrefix}-knob-pointer`} aria-hidden="true" />
      </div>
      <span className={`${classPrefix}-knob-label`} aria-hidden="true">{label}</span>
      <output className={`${classPrefix}-knob-value`}>{spec.format(value)}</output>
    </div>
  )
}
