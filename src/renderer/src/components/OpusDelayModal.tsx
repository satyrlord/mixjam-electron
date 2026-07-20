import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import {
  applyOpusDelayPreset,
  createDefaultOpusDelayReturnModule,
  OPUS_DELAY_PRESET_NAMES,
  type OpusDelayModule,
  type OpusDelayPresetName
} from '../engine/return-effects'
import { OPUS_DELAY_DIVISIONS, type OpusDelayDivision } from '../engine/opus-delay-types'
import { BlockingDialogContent, DialogRoot, DialogTitle } from './ui/Dialog'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRoot,
  DropdownMenuTrigger
} from './ui/DropdownMenu'
import { RotaryDial } from './RotaryField'

type NumericKey =
  | 'timeMsL'
  | 'timeMsR'
  | 'feedback'
  | 'width'
  | 'lowCut'
  | 'highCut'
  | 'modRate'
  | 'modDepth'
  | 'duckAmount'
  | 'duckRelease'
  | 'mix'
  | 'outputDb'

type ResetKey = NumericKey | 'mode' | 'divisionL' | 'divisionR' | 'link' | 'pingPong' | 'character' | 'freeze' | 'bypass'

interface NumericConfig {
  min: number
  max: number
  step: number
  curve?: 'log'
  format: (value: number) => string
  cool?: boolean
  hot?: boolean
}

interface OpusDelayModalProps {
  value: OpusDelayModule
  powered: boolean
  bpm: number
  slot: number
  onCancel: () => void
  onSave: (value: OpusDelayModule, powered: boolean) => void
  onPreview?: (value: OpusDelayModule, powered: boolean) => void
  onRestoreFocus?: () => void
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value))

const formatMilliseconds = (value: number): string =>
  value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`

const formatPercent = (value: number): string => `${Math.round(value)}%`

const formatFrequency = (value: number): string =>
  value >= 1000 ? `${(value / 1000).toFixed(1)} kHz` : `${Math.round(value)} Hz`

const formatRate = (value: number): string => `${value.toFixed(2)} Hz`

const formatDb = (value: number): string => `${value > 0 ? '+' : ''}${value.toFixed(1)} dB`

const NUMERIC_CONFIG: Record<NumericKey, NumericConfig> = {
  timeMsL: { min: 0, max: 2000, step: 1, curve: 'log', format: formatMilliseconds, cool: false },
  timeMsR: { min: 0, max: 2000, step: 1, curve: 'log', format: formatMilliseconds, cool: false },
  feedback: { min: 0, max: 100, step: 1, format: formatPercent, hot: true },
  width: { min: 0, max: 100, step: 1, format: formatPercent, cool: true },
  lowCut: { min: 20, max: 2000, step: 1, curve: 'log', format: formatFrequency, cool: true },
  highCut: { min: 200, max: 20000, step: 1, curve: 'log', format: formatFrequency, cool: true },
  modRate: { min: 0.02, max: 10, step: 0.01, curve: 'log', format: formatRate, cool: true },
  modDepth: { min: 0, max: 100, step: 1, format: formatPercent, cool: true },
  duckAmount: { min: 0, max: 100, step: 1, format: formatPercent, cool: false },
  duckRelease: { min: 20, max: 1000, step: 1, curve: 'log', format: formatMilliseconds, cool: false },
  mix: { min: 0, max: 100, step: 1, format: formatPercent, cool: false },
  outputDb: { min: -24, max: 6, step: 0.1, format: formatDb, cool: false }
}

function normalizedValue(value: number, config: NumericConfig): number {
  if (!config.curve) return (value - config.min) / (config.max - config.min)
  if (value <= config.min) return 0
  const effectiveMinimum = Math.max(config.min, 0.001)
  return Math.log(value / effectiveMinimum) / Math.log(config.max / effectiveMinimum)
}

function valueFromNormalized(normalized: number, config: NumericConfig): number {
  const t = clamp(normalized, 0, 1)
  if (!config.curve) return config.min + (config.max - config.min) * t
  if (t <= 0) return config.min
  const effectiveMinimum = Math.max(config.min, 0.001)
  return effectiveMinimum * (config.max / effectiveMinimum) ** t
}

function quantize(value: number, config: NumericConfig): number {
  const places = config.step < 1 ? 2 : 0
  const rounded = Math.round(value / config.step) * config.step
  return clamp(Number(rounded.toFixed(places)), config.min, config.max)
}

function OpusKnob({
  label,
  value,
  config,
  defaultValue,
  onChange,
  resetKey
}: {
  label: string
  value: number
  config: NumericConfig
  defaultValue: number
  onChange: (value: number) => void
  resetKey: ResetKey
}) {
  const knobRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startY: number; startNormalized: number } | null>(null)
  const helpId = `opus-delay-help-${resetKey}`
  const normalized = clamp(normalizedValue(value, config), 0, 1)
  const defaultNormalized = clamp(normalizedValue(defaultValue, config), 0, 1)
  const setNormalized = (next: number) => onChange(quantize(valueFromNormalized(next, config), config))

  useEffect(() => {
    const element = knobRef.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) return
      event.preventDefault()
      const step = event.shiftKey ? 0.004 : 0.02
      setNormalized(normalized + (event.deltaY < 0 ? step : -step))
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  })

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    dragRef.current = { startY: event.clientY, startNormalized: normalized }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const travel = event.shiftKey ? 900 : 200
    setNormalized(drag.startNormalized + (drag.startY - event.clientY) / travel)
  }

  const endPointer = (event: PointerEvent<HTMLDivElement>) => {
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.004 : 0.02
    if (event.key === 'Home') {
      event.preventDefault()
      setNormalized(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setNormalized(1)
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      event.preventDefault()
      setNormalized(normalized + step)
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      event.preventDefault()
      setNormalized(normalized - step)
    }
  }

  return (
    <div
      ref={knobRef}
      className={`opus-delay-knob${config.cool ? ' opus-delay-knob-cool' : ''}${config.hot ? ' opus-delay-knob-hot' : ''}`}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={config.min}
      aria-valuemax={config.max}
      aria-valuenow={value}
      aria-valuetext={config.format(value)}
      aria-describedby={helpId}
      data-reset-key={resetKey}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={() => { dragRef.current = null }}
      onDoubleClick={() => onChange(defaultValue)}
      onKeyDown={onKeyDown}
    >
      <RotaryDial value={normalized} defaultValue={defaultNormalized} className="opus-delay-dial" />
      <span className="opus-delay-knob-value">{config.format(value)}</span>
      <span className="opus-delay-knob-label">{label}</span>
      <span id={helpId} className="fx-visually-hidden">
        Drag vertically, hold Shift for fine control, use the mouse wheel or arrow keys, and double-click to reset.
      </span>
    </div>
  )
}

function RadioGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  className = ''
}: {
  label: string
  value: T
  options: readonly T[]
  onChange: (value: T) => void
  className?: string
}) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([])
  const selectedIndex = Math.max(0, options.indexOf(value))
  return (
    <div className={`opus-delay-segment ${className}`.trim()} role="radiogroup" aria-label={label}>
      {options.map((option, index) => (
        <button
          key={option}
          ref={(element) => { buttonRefs.current[index] = element }}
          type="button"
          role="radio"
          aria-checked={option === value}
          tabIndex={index === selectedIndex ? 0 : -1}
          onClick={() => onChange(option)}
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
            event.preventDefault()
            const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
            const nextIndex = (selectedIndex + direction + options.length) % options.length
            const next = options[nextIndex]
            if (!next) return
            onChange(next)
            buttonRefs.current[nextIndex]?.focus()
          }}
        >
          {option[0]!.toUpperCase() + option.slice(1)}
        </button>
      ))}
    </div>
  )
}

function DivisionGroup({
  label,
  value,
  onChange
}: {
  label: string
  value: OpusDelayDivision
  onChange: (value: OpusDelayDivision) => void
}) {
  const selectedIndex = OPUS_DELAY_DIVISIONS.indexOf(value)
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([])
  return (
    <div className="opus-delay-division-lane">
      <span className="opus-delay-lane-label">{label}</span>
      <div className="opus-delay-chips" role="radiogroup" aria-label={`${label} delay division`}>
        {OPUS_DELAY_DIVISIONS.map((division, index) => (
          <button
            key={division}
            ref={(element) => { buttonRefs.current[index] = element }}
            type="button"
            role="radio"
            aria-checked={division === value}
            tabIndex={index === selectedIndex ? 0 : -1}
            onClick={() => onChange(division)}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
              event.preventDefault()
              const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
              const nextIndex = (selectedIndex + direction + OPUS_DELAY_DIVISIONS.length) % OPUS_DELAY_DIVISIONS.length
              const next = OPUS_DELAY_DIVISIONS[nextIndex]
              if (!next) return
              onChange(next)
              buttonRefs.current[nextIndex]?.focus()
            }}
          >
            {division}
          </button>
        ))}
      </div>
    </div>
  )
}

function TogglePill({
  label,
  pressed,
  onChange,
  cool = false,
  warm = false,
  resetKey
}: {
  label: string
  pressed: boolean
  onChange: (pressed: boolean) => void
  cool?: boolean
  warm?: boolean
  resetKey: ResetKey
}) {
  return (
    <button
      type="button"
      className={`opus-delay-pill${cool ? ' opus-delay-pill-cool' : ''}${warm ? ' opus-delay-pill-warm' : ''}`}
      aria-pressed={pressed}
      data-reset-key={resetKey}
      onClick={() => onChange(!pressed)}
    >
      <span className="opus-delay-pill-dot" aria-hidden="true" />
      {label}
    </button>
  )
}

export default function OpusDelayModal({
  value,
  powered,
  bpm,
  slot,
  onCancel,
  onSave,
  onPreview,
  onRestoreFocus
}: OpusDelayModalProps) {
  const [draft, setDraft] = useState(value)
  const [preset, setPreset] = useState<OpusDelayPresetName>('Init')
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    onPreview?.(draft, powered)
  }, [draft, onPreview, powered])

  const updateNumeric = (key: NumericKey, next: number) => {
    const config = NUMERIC_CONFIG[key]
    setDraft((current) => ({ ...current, [key]: quantize(next, config) }))
  }

  const resetKey = (key: ResetKey) => {
    if (key in NUMERIC_CONFIG) {
      const numericKey = key as NumericKey
      const defaults = createDefaultOpusDelayReturnModule(value.id)
      updateNumeric(numericKey, defaults[numericKey])
      return
    }
    setDraft((current) => {
      const defaults = createDefaultOpusDelayReturnModule(value.id)
      if (key === 'mode') return { ...current, mode: defaults.mode }
      if (key === 'divisionL') return { ...current, divisionL: defaults.divisionL }
      if (key === 'divisionR') return { ...current, divisionR: defaults.divisionR }
      if (key === 'link') return { ...current, link: defaults.link }
      if (key === 'pingPong') return { ...current, pingPong: defaults.pingPong }
      if (key === 'character') return { ...current, character: defaults.character }
      if (key === 'freeze') return { ...current, freeze: defaults.freeze }
      return { ...current, bypass: defaults.bypass }
    })
  }

  const resetAll = () => {
    setDraft(createDefaultOpusDelayReturnModule(value.id))
    setPreset('Init')
  }

  const choosePreset = (name: OpusDelayPresetName) => {
    setPreset(name)
    setDraft((current) => applyOpusDelayPreset(current, name))
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation()
    const target = event.target as HTMLElement
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
      return
    }
    if (event.key === ' ' && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault()
      setDraft((current) => ({ ...current, bypass: !current.bypass }))
      return
    }
    if (event.key === 'Backspace') {
      if (event.ctrlKey) {
        event.preventDefault()
        resetAll()
        return
      }
      const key = target.closest<HTMLElement>('[data-reset-key]')?.dataset.resetKey as ResetKey | undefined
      if (key) {
        event.preventDefault()
        resetKey(key)
      }
      return
    }
    if (event.key === 'Enter' && target.closest('button,[role="radio"]') === null) {
      event.preventDefault()
      onSave(draft, powered)
    }
  }

  const knob = (key: NumericKey, label: string, defaultValue: number) => (
    <OpusKnob
      key={key}
      label={label}
      value={draft[key]}
      config={NUMERIC_CONFIG[key]}
      defaultValue={defaultValue}
      resetKey={key}
      onChange={(next) => updateNumeric(key, next)}
    />
  )

  return (
    <DialogRoot open modal>
      <BlockingDialogContent
        ref={dialogRef}
        className="opus-delay-modal"
        aria-label="Opus Delay parameters"
        restoreFocus={onRestoreFocus}
        onKeyDown={handleKeyDown}
        onEscapeKeyDown={(event) => {
          event.preventDefault()
          onCancel()
        }}
        onPointerDownOutside={() => onCancel()}
        onInteractOutside={() => onCancel()}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          dialogRef.current?.focus()
        }}
        tabIndex={-1}
      >
        <header className="opus-delay-head">
          <div className="opus-delay-wordmark" aria-label="Opus Delay">
            <span className="opus-delay-wordmark-ghost opus-delay-wordmark-g3" aria-hidden="true">OPUS DELAY</span>
            <span className="opus-delay-wordmark-ghost opus-delay-wordmark-g2" aria-hidden="true">OPUS DELAY</span>
            <span className="opus-delay-wordmark-ghost opus-delay-wordmark-g1" aria-hidden="true">OPUS DELAY</span>
            <DialogTitle asChild><h2 className="opus-delay-wordmark-word">OPUS DELAY</h2></DialogTitle>
          </div>
          <span className="opus-delay-tag">RETURN FX</span>
          <span className="opus-delay-head-spacer" />
          <DropdownMenuRoot>
            <DropdownMenuTrigger asChild>
              <button type="button" className="opus-delay-preset" aria-label="Opus Delay preset">
                <span className="opus-delay-preset-lead">PRESET</span>
                <span>{preset}</span>
                <span aria-hidden="true">⌄</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="opus-delay-preset-menu" align="end">
              {OPUS_DELAY_PRESET_NAMES.map((name) => (
                <DropdownMenuItem
                  key={name}
                  aria-checked={preset === name}
                  onSelect={() => choosePreset(name)}
                >
                  {name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenuRoot>
          <button
            type="button"
            className="opus-delay-bypass"
            aria-label="Bypass Opus Delay"
            aria-pressed={draft.bypass}
            data-reset-key="bypass"
            onClick={() => setDraft((current) => ({ ...current, bypass: !current.bypass }))}
          >
            <span className="opus-delay-led" aria-hidden="true" />
            <span>{draft.bypass ? 'Byp' : 'On'}</span>
          </button>
          <button type="button" className="opus-delay-close" aria-label="Close Opus Delay editor" onClick={onCancel}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </header>

        <div className={`opus-delay-body${draft.bypass ? ' opus-delay-body-bypassed' : ''}`}>
          <section className="opus-delay-bay opus-delay-bay-time">
            <p className="opus-delay-eyebrow">Time</p>
            <div className="opus-delay-time-controls">
              <div className="opus-delay-row opus-delay-row-between">
                <RadioGroup
                  label="Time mode"
                  value={draft.mode}
                  options={['sync', 'free'] as const}
                  onChange={(mode) => setDraft((current) => ({ ...current, mode }))}
                />
                <TogglePill
                  label="Link L/R"
                  pressed={draft.link}
                  warm
                  resetKey="link"
                  onChange={(link) => setDraft((current) => ({ ...current, link }))}
                />
              </div>
              {draft.mode === 'sync' ? (
                <div className="opus-delay-divisions">
                  <DivisionGroup
                    label={draft.link ? 'Division' : 'Left'}
                    value={draft.divisionL}
                    onChange={(divisionL) => setDraft((current) => ({ ...current, divisionL }))}
                  />
                  {!draft.link && (
                    <DivisionGroup
                      label="Right"
                      value={draft.divisionR}
                      onChange={(divisionR) => setDraft((current) => ({ ...current, divisionR }))}
                    />
                  )}
                </div>
              ) : (
                <div className="opus-delay-knob-row opus-delay-time-knobs">
                  {knob('timeMsL', 'Time L', 350)}
                  {!draft.link && knob('timeMsR', 'Time R', 500)}
                </div>
              )}
              <div className="opus-delay-row opus-delay-row-between opus-delay-time-footer">
                <span className="opus-delay-host-bpm">HOST BPM <b>{bpm.toFixed(1)}</b></span>
                <TogglePill
                  label="Freeze"
                  pressed={draft.freeze}
                  warm
                  resetKey="freeze"
                  onChange={(freeze) => setDraft((current) => ({ ...current, freeze }))}
                />
              </div>
            </div>
          </section>

          <section className="opus-delay-bay opus-delay-bay-feedback">
            <p className="opus-delay-eyebrow">Feedback</p>
            <div className="opus-delay-knob-row">
              {knob('feedback', 'Feedback', 38)}
              {knob('width', 'Width', 62)}
            </div>
            <TogglePill
              label="Ping-Pong"
              pressed={draft.pingPong}
              cool
              resetKey="pingPong"
              onChange={(pingPong) => setDraft((current) => ({ ...current, pingPong }))}
            />
          </section>

          <section className="opus-delay-bay opus-delay-bay-tone">
            <p className="opus-delay-eyebrow">Tone</p>
            <div className="opus-delay-knob-row">
              {knob('lowCut', 'Low Cut', 120)}
              {knob('highCut', 'High Cut', 7500)}
            </div>
          </section>

          <section className="opus-delay-bay opus-delay-bay-modulation">
            <p className="opus-delay-eyebrow">Modulation</p>
            <div className="opus-delay-knob-row">
              {knob('modRate', 'Rate', 0.35)}
              {knob('modDepth', 'Depth', 18)}
            </div>
          </section>

          <section className="opus-delay-bay opus-delay-bay-character">
            <p className="opus-delay-eyebrow">Character</p>
            <RadioGroup
              label="Delay character"
              value={draft.character}
              options={['digital', 'analog', 'tape'] as const}
              className="opus-delay-character-segment"
              onChange={(character) => setDraft((current) => ({ ...current, character }))}
            />
          </section>

          <section className="opus-delay-bay opus-delay-bay-ducking">
            <p className="opus-delay-eyebrow">Ducking</p>
            <div className="opus-delay-knob-row">
              {knob('duckAmount', 'Amount', 0)}
              {knob('duckRelease', 'Release', 220)}
            </div>
          </section>

          <section className="opus-delay-bay opus-delay-bay-output">
            <p className="opus-delay-eyebrow">Output</p>
            <div className="opus-delay-knob-row">
              {knob('mix', 'Mix', 100)}
              {knob('outputDb', 'Output', 0)}
            </div>
          </section>
        </div>

        <footer className="opus-delay-foot">
          <span>{draft.mode === 'sync' ? 'SYNC' : 'FREE'}</span>
          <span className="opus-delay-foot-separator">/</span>
          <span>{draft.character.toUpperCase()}</span>
          <span className="opus-delay-foot-separator">/</span>
          <span>MIX {Math.round(draft.mix)}%</span>
          <span className="opus-delay-foot-right">RETURN · FX SLOT {slot}</span>
        </footer>

        <div className="opus-delay-actions">
          <button type="button" onClick={resetAll}>Reset</button>
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" onClick={() => onSave(draft, powered)}>OK</button>
        </div>
      </BlockingDialogContent>
    </DialogRoot>
  )
}
