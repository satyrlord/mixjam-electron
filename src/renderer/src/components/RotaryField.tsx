import { useRef, useState } from 'react'
import { clamp } from '../lib/sample-utils'

export function ToggleField({ label, help, checked, onChange }: {
  label: string
  help: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="effect-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <strong>{label}</strong>
      <span>{help}</span>
    </label>
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
  const dragRef = useRef<{ y: number; value: number } | null>(null)
  const quantize = (next: number, quantum = step) =>
    clamp(Math.round(next / quantum) * quantum, min, max)
  const displayValue = percent
    ? Math.round(value * 100)
    : Number(value.toFixed(step < 1 ? 1 : 0))
  const unit = percent ? '%' : suffix
  const commit = () => {
    const parsed = Number(draft)
    if (Number.isFinite(parsed)) onChange(quantize(percent ? parsed / 100 : parsed))
    setEditing(false)
  }
  return (
    <div className="rotary-field">
      <strong>{label}</strong>
      <div
        className="rotary-control"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={percent ? min * 100 : min}
        aria-valuemax={percent ? max * 100 : max}
        aria-valuenow={percent ? value * 100 : value}
        aria-valuetext={`${displayValue}${unit}`}
        style={
          {
            '--rotary-angle': `${-135 + ((value - min) / (max - min)) * 270}deg`
          } as React.CSSProperties
        }
        onDoubleClick={() => onChange(defaultValue)}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          dragRef.current = { y: event.clientY, value }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          if (
            !dragRef.current ||
            !event.currentTarget.hasPointerCapture(event.pointerId)
          )
            return
          const sensitivity = (max - min) / 150
          const next =
            dragRef.current.value +
            (dragRef.current.y - event.clientY) *
              sensitivity *
              (event.shiftKey ? 0.1 : 1)
          onChange(quantize(next, event.shiftKey ? step / 10 : step))
        }}
        onPointerUp={(event) => {
          dragRef.current = null
          event.currentTarget.releasePointerCapture(event.pointerId)
        }}
        onKeyDown={(event) => {
          let next: number | null = null
          const increment = step * (event.shiftKey ? 0.1 : 1)
          if (event.key === 'ArrowUp' || event.key === 'ArrowRight')
            next = value + increment
          if (event.key === 'ArrowDown' || event.key === 'ArrowLeft')
            next = value - increment
          if (event.key === 'Home') next = min
          if (event.key === 'End') next = max
          if (next !== null) {
            event.preventDefault()
            onChange(quantize(next, event.shiftKey ? step / 10 : step))
          }
        }}
      >
        <i />
      </div>
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
      <span>{help}</span>
    </div>
  )
}
