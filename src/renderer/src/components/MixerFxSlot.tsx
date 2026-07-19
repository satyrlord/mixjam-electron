import { useRef, useState } from 'react'
import type { PlaybackReturnSnapshot } from '../engine/playback-engine'
import {
  createDefaultDelayReturnModule,
  createEmptyReturnModule,
  type DelayReturnModule
} from '../engine/return-effects'
import DelayModal from './DelayModal'
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
  onSet: (bus: PlaybackReturnSnapshot) => void
  onPreview: (bus: PlaybackReturnSnapshot) => void
  onGestureStart: () => void
  onGestureEnd: () => void
}

const LIMITER_TOOLTIP = 'Limiter\nCaps this FX Return at −1 dBFS using stereo-linked peak limiting. Enabled by default. Click to bypass. This does not limit the Master output.'

export default function MixerFxSlot({
  bus,
  onSet,
  onPreview,
  onGestureStart,
  onGestureEnd
}: MixerFxSlotProps) {
  const [editing, setEditing] = useState<{ module: DelayReturnModule; powered: boolean } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const module = bus.module
  const slot = bus.index + 1

  const chooseDelay = () => {
    const next = module.type === 'delay'
      ? { ...module }
      : createDefaultDelayReturnModule(`fx-${slot}`)
    const nextBus = { ...bus, module: next }
    onPreview(nextBus)
    setEditing({ module: next, powered: bus.powered })
  }

  const save = (next: DelayReturnModule, powered: boolean) => {
    onSet({ ...bus, module: next, powered })
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
    : 'No effect assigned'

  return (
    <div className="mixer-fx-slot-wrap">
      <section className="mixer-fx-card" aria-label={`FX Return ${slot}`}>
        <div className="mixer-fx-module">
          <DropdownMenuRoot>
            <DropdownMenuTrigger asChild>
              <button ref={triggerRef} type="button" className="mixer-fx-slot" aria-label={`FX ${slot}`}>
                <span className="mixer-fx-slot-head"><strong>FX {slot}</strong><span>{module.type === 'delay' ? 'Delay' : 'Empty'}</span></span>
                <span className="mixer-fx-power-state">Power {bus.powered ? 'On' : 'Off'}</span>
                <span className="mixer-fx-summary">{summary}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="mixer-fx-menu" align="start">
              <DropdownMenuItem onSelect={chooseDelay}>Delay...</DropdownMenuItem>
              {module.type !== 'empty' && (
                <DropdownMenuItem onSelect={clear}>Clear slot</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenuRoot>
          {module.type === 'delay' && (
            <button
              type="button"
              className="mixer-fx-power"
              aria-label={`Power FX ${slot}`}
              aria-pressed={bus.powered}
              onClick={() => onSet({ ...bus, powered: !bus.powered })}
            >
              Power
            </button>
          )}
        </div>
        <div className="mixer-fx-return-row">
          <Tooltip content={`${module.type === 'delay' ? 'Delay' : 'Empty'}, Return ${slot}: ${Math.round(bus.returnLevel * 100)}%`}>
            <span className="mixer-return-level-wrap">
              <RotaryControl
                className="mixer-return-level"
                label={`FX Return ${slot} level`}
                value={bus.returnLevel}
                min={0}
                max={1}
                step={0.01}
                valueText={`${Math.round(bus.returnLevel * 100)}%`}
                defaultValue={1}
                ariaMultiplier={100}
                onGestureStart={onGestureStart}
                onGestureEnd={onGestureEnd}
                onChange={(returnLevel) => onSet({ ...bus, returnLevel })}
              >
                <RotaryDial
                  className="mixer-compact-rotary"
                  value={bus.returnLevel}
                  defaultValue={1}
                />
                <span className="mixer-return-name" aria-hidden="true">
                  Return {Math.round(bus.returnLevel * 100)}%
                </span>
              </RotaryControl>
            </span>
          </Tooltip>
          <Tooltip content={<span className="mixer-limiter-tooltip">{LIMITER_TOOLTIP}</span>}>
            <button
              type="button"
              className="mixer-limiter-toggle"
              aria-label={`Limiter for FX Return ${slot}`}
              aria-pressed={bus.limiterEnabled}
              onClick={() => onSet({ ...bus, limiterEnabled: !bus.limiterEnabled })}
            >L</button>
          </Tooltip>
        </div>
      </section>
      {editing && (
        <DelayModal
          value={editing.module}
          powered={editing.powered}
          onCancel={cancel}
          onSave={save}
          onRestoreFocus={() => triggerRef.current?.focus()}
          onPreview={(next, nextPowered) => onPreview({
            ...bus,
            module: next,
            powered: nextPowered
          })}
        />
      )}
    </div>
  )
}
