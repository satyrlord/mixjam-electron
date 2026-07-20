import { useEffect, useRef, useState } from 'react'
import {
  createDefaultDelayReturnModule,
  type DelayReturnModule
} from '../engine/return-effects'
import { DialogContent, DialogRoot, DialogTitle } from './ui/Dialog'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRoot,
  DropdownMenuTrigger
} from './ui/DropdownMenu'
import { LinearSlider } from './ui/Slider'

type ResetKey = 'timeMs' | 'feedback' | 'tapeDistortion' | 'mode' | 'noteDivision' | 'pingPong'
type NumericKey = 'timeMs' | 'feedback' | 'tapeDistortion'
const NOTE_DIVISIONS: DelayReturnModule['noteDivision'][] = ['1/4', '1/8', '1/16', '1/8T', '1/16T']

interface DelayModalProps {
  value: DelayReturnModule
  powered: boolean
  onCancel: () => void
  onSave: (value: DelayReturnModule, powered: boolean) => void
  onPreview?: (value: DelayReturnModule, powered: boolean) => void
  onRestoreFocus?: () => void
}

function maximumFor(key: NumericKey): number {
  if (key === 'timeMs') return 2000
  return key === 'feedback' ? 75 : 100
}

function defaultFor(key: NumericKey): number {
  if (key === 'timeMs') return 375
  return key === 'feedback' ? 35 : 0
}

function valueText(key: NumericKey, value: number): string {
  return `${Math.round(value)}${key === 'timeMs' ? ' ms' : '%'}`
}

export default function DelayModal({
  value,
  powered,
  onCancel,
  onSave,
  onPreview,
  onRestoreFocus
}: DelayModalProps) {
  const [draft, setDraft] = useState(value)
  const [powerOn, setPowerOn] = useState(powered)
  const dialogRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef(onRestoreFocus)
  restoreFocusRef.current = onRestoreFocus

  useEffect(() => {
    document.body.dataset.mixjamModalBlocking = '1'
    return () => {
      delete document.body.dataset.mixjamModalBlocking
      restoreFocusRef.current?.()
    }
  }, [])

  useEffect(() => {
    onPreview?.(draft, powerOn)
  }, [draft, onPreview, powerOn])

  const resetKey = (key: ResetKey) => setDraft((current) => {
    if (key === 'timeMs' || key === 'feedback' || key === 'tapeDistortion') {
      return { ...current, [key]: defaultFor(key) }
    }
    if (key === 'mode') return { ...current, mode: 'free' }
    if (key === 'noteDivision') return { ...current, noteDivision: '1/8' }
    return { ...current, pingPong: false }
  })

  const resetAll = () => {
    setDraft(createDefaultDelayReturnModule(value.id))
    setPowerOn(true)
  }

  const updateNumeric = (key: NumericKey, next: number) => {
    setDraft((current) => ({
      ...current,
      [key]: Math.max(0, Math.min(maximumFor(key), next))
    }))
  }

  const handleNumericKey = (
    event: React.KeyboardEvent<HTMLSpanElement>,
    key: NumericKey,
    step: number
  ) => {
    let next: number | undefined
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = maximumFor(key)
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = draft[key] - step
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = draft[key] + step
    if (next === undefined) return
    event.preventDefault()
    updateNumeric(key, next)
  }

  const cycleDivision = (direction: -1 | 1) => setDraft((current) => {
    const index = NOTE_DIVISIONS.indexOf(current.noteDivision)
    return {
      ...current,
      noteDivision: NOTE_DIVISIONS[(index + direction + NOTE_DIVISIONS.length) % NOTE_DIVISIONS.length]!
    }
  })

  const handleChoiceKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    update: (direction: -1 | 1) => void
  ) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowDown' &&
        event.key !== 'ArrowRight' && event.key !== 'ArrowUp') return
    event.preventDefault()
    update(event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 1)
  }

  const handleModalKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation()
    const target = event.target as HTMLElement
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
      return
    }
    if (event.key === ' ' && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault()
      setPowerOn((on) => !on)
      return
    }
    if (event.key === 'Backspace' && event.ctrlKey) {
      event.preventDefault()
      resetAll()
      return
    }
    if (event.key === 'Backspace') {
      const key = target.closest<HTMLElement>('[data-reset-key]')?.dataset.resetKey as ResetKey | undefined
      if (key) {
        event.preventDefault()
        resetKey(key)
      }
      return
    }
    if (event.key === 'Enter' && target.closest('button,[role="menuitem"]') === null) {
      event.preventDefault()
      onSave(draft, powerOn)
    }
  }

  const numericFields: readonly [NumericKey, string, number][] = [
    ['timeMs', 'Free time', 10],
    ['feedback', 'Feedback', 1],
    ['tapeDistortion', 'Tape Distortion', 1]
  ]

  return (
    <DialogRoot open modal>
      <DialogContent
        ref={dialogRef}
        className="fx-modal"
        aria-label="Delay parameters"
        onKeyDown={handleModalKeyDown}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          dialogRef.current?.focus()
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
        }}
        tabIndex={-1}
      >
        <div className="fx-modal-head">
          <DialogTitle asChild><h2>Delay</h2></DialogTitle>
          <span className="fx-power-status">Power {powerOn ? 'On' : 'Off'}</span>
        </div>

        <div className="fx-choice-field">
          <span className="fx-field-label">Mode</span>
          <div className="fx-segment" role="group" aria-label="Delay mode">
            {(['free', 'sync'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                data-reset-key="mode"
                aria-pressed={draft.mode === mode}
                onClick={() => setDraft((current) => ({ ...current, mode }))}
                onKeyDown={(event) => handleChoiceKey(event, (direction) => {
                  setDraft((current) => ({ ...current, mode: direction < 0 ? 'free' : 'sync' }))
                })}
              >
                {mode === 'free' ? 'Free' : 'Sync'}
              </button>
            ))}
          </div>
        </div>

        {numericFields.map(([key, label, step]) => (
          <label className="fx-slider-field" key={key}>
            <span className="fx-field-label">{label}</span>
            <LinearSlider
              className="fx-slider"
              value={draft[key]}
              min={0}
              max={maximumFor(key)}
              step={step}
              onValueChange={(next) => updateNumeric(key, next)}
              ariaLabel={label}
              ariaValueText={valueText(key, draft[key])}
              resetKey={key}
              thumbProps={{
                onKeyDown: (event) => handleNumericKey(event, key, step)
              }}
            />
            <output className="fx-slider-value">{valueText(key, draft[key])}</output>
          </label>
        ))}

        <div className="fx-choice-field">
          <span className="fx-field-label">Sync division</span>
          <DropdownMenuRoot>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="fx-division-trigger"
                data-reset-key="noteDivision"
                aria-label="Sync division"
                onKeyDown={(event) => handleChoiceKey(event, cycleDivision)}
              >
                {draft.noteDivision}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="fx-division-menu" align="start">
              {NOTE_DIVISIONS.map((division) => (
                <DropdownMenuItem
                  key={division}
                  aria-checked={draft.noteDivision === division}
                  onSelect={() => setDraft((current) => ({ ...current, noteDivision: division }))}
                >
                  {division}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenuRoot>
        </div>

        <div className="fx-choice-field">
          <span className="fx-field-label">Ping-Pong</span>
          <div className="fx-segment" role="group" aria-label="Ping-Pong">
            {([false, true] as const).map((enabled) => (
              <button
                key={String(enabled)}
                type="button"
                data-reset-key="pingPong"
                aria-pressed={draft.pingPong === enabled}
                onClick={() => setDraft((current) => ({ ...current, pingPong: enabled }))}
                onKeyDown={(event) => handleChoiceKey(event, (direction) => {
                  setDraft((current) => ({ ...current, pingPong: direction > 0 }))
                })}
              >
                {enabled ? 'On' : 'Off'}
              </button>
            ))}
          </div>
        </div>

        <div className="fx-modal-actions">
          <button type="button" onClick={resetAll}>Reset</button>
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" onClick={() => onSave(draft, powerOn)}>OK</button>
        </div>
      </DialogContent>
    </DialogRoot>
  )
}
