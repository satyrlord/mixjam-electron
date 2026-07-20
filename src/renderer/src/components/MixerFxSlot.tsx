import { useRef, useState } from 'react'
import type { PlaybackReturnSnapshot } from '../engine/playback-engine'
import {
  createDefaultDelayReturnModule,
  createDefaultOpusDelayReturnModule,
  createEmptyReturnModule,
  type DelayReturnModule,
  type OpusDelayModule
} from '../engine/return-effects'
import DelayModal from './DelayModal'
import OpusDelayModal from './OpusDelayModal'
import { slotAccentStyle } from './mixer-accent'
import { RotaryControl, RotaryDial } from './RotaryField'
import { Tooltip } from './ui/Tooltip'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRoot,
  DropdownMenuTrigger
} from './ui/DropdownMenu'

interface MixerFxSlotProps {
  bus: PlaybackReturnSnapshot
  bpm?: number
  onSet: (bus: PlaybackReturnSnapshot) => void
  onPreview: (bus: PlaybackReturnSnapshot) => void
  onGestureStart: () => void
  onGestureEnd: () => void
}

const LIMITER_TOOLTIP = 'Limiter\nCaps this FX Return at −1 dBFS using stereo-linked peak limiting. Enabled by default. Click to bypass. This does not limit the Master output.'

function EditCog() {
  return (
    <svg
      className="mixer-fx-edit-icon"
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" />
    </svg>
  )
}

export default function MixerFxSlot({
  bus,
  bpm = 120,
  onSet,
  onPreview,
  onGestureStart,
  onGestureEnd
}: MixerFxSlotProps) {
  const [editing, setEditing] = useState<
    | { kind: 'delay'; module: DelayReturnModule; powered: boolean }
    | { kind: 'opus-delay'; module: OpusDelayModule; powered: boolean }
    | null
  >(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const module = bus.module
  const slot = bus.index + 1
  const moduleName = module.type === 'delay'
    ? 'Delay'
    : module.type === 'opus-delay' ? 'Opus Delay' : 'Empty'
  const bypassed = (module.type === 'delay' || module.type === 'opus-delay') && !bus.powered
  const triggerName = `FX ${slot} ${moduleName}${bypassed ? ' bypassed' : ''}`

  const chooseDelay = () => {
    const next = module.type === 'delay'
      ? { ...module }
      : createDefaultDelayReturnModule(`fx-${slot}`)
    const nextBus = { ...bus, module: next }
    onPreview(nextBus)
    setEditing({ kind: 'delay', module: next, powered: bus.powered })
  }

  const chooseOpusDelay = () => {
    const next = module.type === 'opus-delay'
      ? { ...module }
      : createDefaultOpusDelayReturnModule(`fx-${slot}`)
    onPreview({ ...bus, module: next, returnLevel: next.mix / 100 })
    setEditing({ kind: 'opus-delay', module: next, powered: bus.powered })
  }

  const saveDelay = (next: DelayReturnModule, powered: boolean) => {
    onSet({ ...bus, module: next, powered })
    setEditing(null)
  }

  const saveOpusDelay = (next: OpusDelayModule, powered: boolean) => {
    const returnLevel = Math.max(0, Math.min(1, next.mix / 100))
    onSet({
      ...bus,
      module: { ...next, mix: returnLevel * 100 },
      powered,
      returnLevel
    })
    setEditing(null)
  }

  const cancel = () => {
    onPreview(bus)
    setEditing(null)
  }

  const clear = () => {
    onSet({ ...bus, module: createEmptyReturnModule(`fx-${slot}`) })
  }

  const summary = module.type === 'delay'
    ? `${module.mode === 'free' ? `${Math.round(module.timeMs)} ms` : module.noteDivision} · Feedback ${Math.round(module.feedback)}% · Tape ${Math.round(module.tapeDistortion)}% · Ping-Pong ${module.pingPong ? 'On' : 'Off'}`
    : module.type === 'opus-delay'
      ? `${module.mode === 'free' ? `${Math.round(module.timeMsL)} ms` : module.divisionL} · Feedback ${Math.round(module.feedback)}% · ${module.character} · Mix ${Math.round(module.mix)}%`
    : 'No effect assigned'

  const returnLevel = module.type === 'opus-delay' ? module.mix / 100 : bus.returnLevel
  const openEditor = module.type === 'opus-delay' ? chooseOpusDelay : chooseDelay

  return (
    <div className="mixer-fx-slot-wrap" style={slotAccentStyle(slot)}>
      <section
        className={`mixer-fx-card${bypassed ? ' mixer-fx-card-bypassed' : ''}`}
        aria-label={`FX Return ${slot}`}
      >
        <div className="mixer-fx-head">
          <DropdownMenuRoot>
            <DropdownMenuTrigger asChild>
              <button ref={triggerRef} type="button" className="mixer-fx-slot" aria-label={triggerName}>
                <span className="mixer-fx-num" aria-hidden="true">{String(slot).padStart(2, '0')}</span>
                <span className="mixer-fx-name">{moduleName}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="mixer-fx-menu" align="start">
              <DropdownMenuItem onSelect={chooseDelay}>Delay...</DropdownMenuItem>
              <DropdownMenuItem onSelect={chooseOpusDelay}>Opus Delay...</DropdownMenuItem>
              {module.type !== 'empty' && (
                <DropdownMenuItem onSelect={clear}>Clear slot</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenuRoot>
          {module.type === 'delay' || module.type === 'opus-delay' ? (
            <button
              type="button"
              className="mixer-fx-led"
              aria-label={`Power FX ${slot}`}
              aria-pressed={bus.powered}
              onClick={() => onSet({ ...bus, powered: !bus.powered })}
            />
          ) : (
            <span className="mixer-fx-led mixer-fx-led-off" aria-hidden="true" />
          )}
        </div>

        <div className="mixer-fx-body">
          <button
            type="button"
            className="mixer-fx-edit"
            aria-label={`Edit parameters for FX ${slot}`}
            onClick={openEditor}
          >
            <EditCog />
            <span>Edit</span>
          </button>
          <Tooltip content={<span className="mixer-limiter-tooltip">{LIMITER_TOOLTIP}</span>}>
            <button
              type="button"
              className="mixer-limiter-toggle"
              aria-label={`Limiter for FX Return ${slot}`}
              aria-pressed={bus.limiterEnabled}
              onClick={() => onSet({ ...bus, limiterEnabled: !bus.limiterEnabled })}
            >L</button>
          </Tooltip>
          <div className="mixer-fx-mix">
            <span className="mixer-fx-mix-label" aria-hidden="true">Mix</span>
            <Tooltip content={`${moduleName}, Return ${slot}: ${Math.round(returnLevel * 100)}%`}>
              <span className="mixer-return-level-wrap">
                <RotaryControl
                  className="mixer-return-level"
                  label={`FX Return ${slot} level`}
                  value={returnLevel}
                  min={0}
                  max={1}
                  step={0.01}
                  valueText={`${Math.round(returnLevel * 100)}%`}
                  defaultValue={1}
                  ariaMultiplier={100}
                  onGestureStart={onGestureStart}
                  onGestureEnd={onGestureEnd}
                  onChange={(nextReturnLevel) => {
                    if (module.type === 'opus-delay') {
                      onSet({
                        ...bus,
                        returnLevel: nextReturnLevel,
                        module: { ...module, mix: nextReturnLevel * 100 }
                      })
                    } else {
                      onSet({ ...bus, returnLevel: nextReturnLevel })
                    }
                  }}
                >
                  <RotaryDial
                    className="mixer-compact-rotary"
                    value={returnLevel}
                    defaultValue={1}
                  />
                </RotaryControl>
              </span>
            </Tooltip>
          </div>
        </div>

        <div className="mixer-fx-foot">
          <span className="mixer-fx-summary">{summary}</span>
        </div>
      </section>
      {editing && (
        editing.kind === 'delay' ? (
          <DelayModal
            value={editing.module}
            powered={editing.powered}
            onCancel={cancel}
            onSave={saveDelay}
            onRestoreFocus={() => triggerRef.current?.focus()}
            onPreview={(next, nextPowered) => onPreview({
              ...bus,
              module: next,
              powered: nextPowered
            })}
          />
        ) : (
          <OpusDelayModal
            value={editing.module}
            powered={editing.powered}
            bpm={bpm}
            slot={slot}
            onCancel={cancel}
            onSave={saveOpusDelay}
            onRestoreFocus={() => triggerRef.current?.focus()}
            onPreview={(next, nextPowered) => onPreview({
              ...bus,
              module: next,
              powered: nextPowered,
              returnLevel: next.mix / 100
            })}
          />
        )
      )}
    </div>
  )
}
