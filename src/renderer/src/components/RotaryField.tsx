import { useEffect, useId, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { clamp } from '../lib/sample-utils'
import { Tooltip } from './ui/Tooltip'

type RotaryDialMode = 'unipolar' | 'bipolar'

export function RotaryDial({
  value,
  defaultValue = 0,
  mode = 'unipolar',
  className = ''
}: {
  value: number
  defaultValue?: number
  mode?: RotaryDialMode
  className?: string
}) {
  const normalizedValue = clamp(value, 0, 1)
  const normalizedDefault = clamp(defaultValue, 0, 1)
  const pointerAngle = -135 + normalizedValue * 270
  const defaultAngle = -135 + normalizedDefault * 270
  const bipolarLength = Math.abs(normalizedValue - 0.5) * 270
  const activeArcLength = mode === 'bipolar' ? bipolarLength : normalizedValue * 270
  const activeArcStart = mode === 'bipolar'
    ? normalizedValue < 0.5 ? 135 - bipolarLength : 135
    : 0

  return (
    <svg
      className={`rotary-dial ${className}`.trim()}
      viewBox="0 0 64 64"
      aria-hidden="true"
      data-rotary-mode={mode}
    >
      <circle
        className="rotary-dial-track"
        cx="32"
        cy="32"
        r="25"
        pathLength="360"
        transform="rotate(135 32 32)"
      />
      <circle
        className="rotary-dial-value"
        cx="32"
        cy="32"
        r="25"
        pathLength="360"
        strokeDasharray={`${activeArcLength} ${360 - activeArcLength}`}
        strokeDashoffset={-activeArcStart}
        transform="rotate(135 32 32)"
      />
      <circle className="rotary-dial-cap" cx="32" cy="32" r="17" />
      {/* Paint after the cap so every theme keeps the default marker visible. */}
      <line
        className="rotary-dial-default-marker"
        x1="32"
        y1="5"
        x2="32"
        y2="9"
        transform={`rotate(${defaultAngle} 32 32)`}
      />
      <line
        className="rotary-dial-pointer"
        x1="32"
        y1="17"
        x2="32"
        y2="25"
        transform={`rotate(${pointerAngle} 32 32)`}
      />
      <circle className="rotary-dial-center" cx="32" cy="32" r="2" />
    </svg>
  )
}

export function ToggleField({ label, help, checked, onChange }: {
  label: string
  help: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="effect-toggle">
      <strong>{label}</strong>
      <input
        className="effect-toggle-input"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span className="effect-toggle-control" aria-hidden="true">
        <span className="effect-toggle-thumb" />
      </span>
      <span className="effect-toggle-state" aria-hidden="true">{checked ? 'On' : 'Off'}</span>
      <span className="effect-control-help">{help}</span>
    </label>
  )
}

export function RotaryControl({
  className,
  label,
  value,
  min,
  max,
  step,
  valueText,
  defaultValue,
  homeValue = min,
  endValue = max,
  dragAxis = 'vertical',
  ariaMultiplier = 1,
  describedBy,
  style,
  onChange,
  onGestureStart,
  onGestureEnd,
  onContextMenu,
  children
}: {
  className: string
  label: string
  value: number
  min: number
  max: number
  step: number
  valueText: string
  defaultValue: number
  homeValue?: number
  endValue?: number
  dragAxis?: 'horizontal' | 'vertical'
  ariaMultiplier?: number
  describedBy?: string
  style?: CSSProperties
  onChange: (value: number) => void
  onGestureStart?: () => void
  onGestureEnd?: () => void
  onContextMenu?: (event: MouseEvent<HTMLElement>) => void
  children?: React.ReactNode
}) {
  const controlRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ coordinate: number; value: number } | null>(null)
  const quantize = (next: number, quantum = step) =>
    clamp(Math.round(next / quantum) * quantum, min, max)
  const coordinate = (event: React.PointerEvent<HTMLElement>) =>
    dragAxis === 'vertical' ? event.clientY : event.clientX
  const direction = dragAxis === 'vertical' ? -1 : 1

  useEffect(() => {
    const control = controlRef.current
    if (!control) return

    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) return
      event.preventDefault()
      const quantum = event.shiftKey ? step / 10 : step
      const increment = event.deltaY < 0 ? quantum : -quantum
      onChange(clamp(Math.round((value + increment) / quantum) * quantum, min, max))
    }

    control.addEventListener('wheel', handleWheel, { passive: false })
    return () => control.removeEventListener('wheel', handleWheel)
  }, [max, min, onChange, step, value])

  return (
    <div
      ref={controlRef}
      className={className}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min * ariaMultiplier}
      aria-valuemax={max * ariaMultiplier}
      aria-valuenow={value * ariaMultiplier}
      aria-valuetext={valueText}
      aria-describedby={describedBy}
      style={style}
      onDoubleClick={() => onChange(defaultValue)}
      onContextMenu={onContextMenu}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        dragRef.current = { coordinate: coordinate(event), value }
        onGestureStart?.()
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (!dragRef.current) return
        const delta = (coordinate(event) - dragRef.current.coordinate) * direction
        const next = dragRef.current.value + delta * ((max - min) / 150) * (event.shiftKey ? 0.1 : 1)
        onChange(quantize(next, event.shiftKey ? step / 10 : step))
      }}
      onPointerUp={(event) => {
        const gestureActive = dragRef.current !== null
        dragRef.current = null
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
        if (gestureActive) onGestureEnd?.()
      }}
      onPointerCancel={() => {
        const gestureActive = dragRef.current !== null
        dragRef.current = null
        if (gestureActive) onGestureEnd?.()
      }}
      onKeyDown={(event) => {
        let next: number | null = null
        const increment = step * (event.shiftKey ? 0.1 : 1)
        if (event.key === 'ArrowUp' || event.key === 'ArrowRight') next = value + increment
        if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') next = value - increment
        if (event.key === 'Home') next = homeValue
        if (event.key === 'End') next = endValue
        if (next !== null) {
          event.preventDefault()
          onChange(quantize(next, event.shiftKey ? step / 10 : step))
        }
      }}
    >
      {children}
    </div>
  )
}

export function RotaryField({
  label,
  help,
  value,
  defaultValue,
  min,
  max,
  step,
  suffix = '',
  percent = false,
  onChange
}: {
  label: string
  help: string
  value: number
  defaultValue: number
  min: number
  max: number
  step: number
  suffix?: string
  percent?: boolean
  onChange: (value: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const interactionHintId = useId()
  const quantize = (next: number, quantum = step) =>
    clamp(Math.round(next / quantum) * quantum, min, max)
  const displayValue = percent
    ? Math.round(value * 100)
    : Number(value.toFixed(step < 1 ? 1 : 0))
  const unit = percent ? '%' : suffix
  const normalizedValue = max === min ? 0 : clamp((value - min) / (max - min), 0, 1)
  const normalizedDefault = max === min ? 0 : clamp((defaultValue - min) / (max - min), 0, 1)
  const interactionHint = `Adjust ${label}: drag up or down or use the mouse wheel. Hold Shift for fine control. Use arrow keys to step, Home or End for the range limits, and double-click to reset.`
  const commit = () => {
    const parsed = Number(draft)
    if (Number.isFinite(parsed)) onChange(quantize(percent ? parsed / 100 : parsed))
    setEditing(false)
  }
  return (
    <div className="rotary-field">
      <strong>{label}</strong>
      <Tooltip content={interactionHint}>
        <span className="rotary-tooltip-trigger">
          <RotaryControl
            className="rotary-control"
            label={label}
            value={value}
            min={min}
            max={max}
            step={step}
            valueText={`${displayValue}${unit}`}
            defaultValue={defaultValue}
            ariaMultiplier={percent ? 100 : 1}
            describedBy={interactionHintId}
            onChange={onChange}
          >
            <RotaryDial value={normalizedValue} defaultValue={normalizedDefault} />
          </RotaryControl>
        </span>
      </Tooltip>
      <span id={interactionHintId} className="fx-visually-hidden">{interactionHint}</span>
      {editing ? (
        <input
          className="rotary-value-input"
          autoFocus
          value={draft}
          aria-label={`${label} value`}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit()
            if (event.key === 'Escape') setEditing(false)
          }}
        />
      ) : (
        <button
          type="button"
          className="rotary-value"
          onClick={() => {
            setDraft(String(displayValue))
            setEditing(true)
          }}
        >
          {displayValue}
          {unit}
        </button>
      )}
      <span className="effect-control-help">{help}</span>
    </div>
  )
}
