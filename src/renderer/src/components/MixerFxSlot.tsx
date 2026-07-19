import { useRef, useState } from 'react'
import type { PlaybackReturnSnapshot } from '../engine/playback-engine'
import {
  createDefaultDelayReturnModule,
  createEmptyReturnModule,
  type DelayReturnModule
} from '../engine/return-effects'
import DelayModal from './DelayModal'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRoot,
  DropdownMenuTrigger
} from './ui/DropdownMenu'

interface MixerFxSlotProps {
  slot: number
  bus: PlaybackReturnSnapshot
  onSet: (bus: PlaybackReturnSnapshot) => void
  onPreview: (bus: PlaybackReturnSnapshot) => void
}

export default function MixerFxSlot({ slot, bus, onSet, onPreview }: MixerFxSlotProps) {
  const [editing, setEditing] = useState<{ module: DelayReturnModule; powered: boolean } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const module = bus.module

  const chooseDelay = () => {
    const next = module.type === 'delay'
      ? { ...module }
      : createDefaultDelayReturnModule(`fx-${slot}`)
    const nextBus = {
      index: slot - 1,
      module: next,
      powered: bus.powered,
      returnLevel: bus.returnLevel,
      limiterEnabled: bus.limiterEnabled
    }
    onPreview(nextBus)
    setEditing({ module: next, powered: bus.powered })
  }

  const save = (next: DelayReturnModule, powered: boolean) => {
    onSet({
      index: slot - 1,
      module: next,
      powered,
      returnLevel: bus.returnLevel,
      limiterEnabled: bus.limiterEnabled
    })
    setEditing(null)
  }

  const cancel = () => {
    onPreview(bus)
    setEditing(null)
  }

  const clear = () => {
    onSet({
      index: slot - 1,
      module: createEmptyReturnModule(`fx-${slot}`),
      powered: bus.powered,
      returnLevel: bus.returnLevel,
      limiterEnabled: bus.limiterEnabled
    })
  }

  const summary = module.type === 'delay'
    ? `${module.mode === 'free' ? `${Math.round(module.timeMs)} ms` : module.noteDivision} · Feedback ${Math.round(module.feedback)}% · Tape ${Math.round(module.tapeDistortion)}% · Ping-Pong ${module.pingPong ? 'On' : 'Off'}`
    : 'No effect assigned'

  return (
    <div className="mixer-fx-slot-wrap">
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
      {editing && (
        <DelayModal
          value={editing.module}
          powered={editing.powered}
          onCancel={cancel}
          onSave={save}
          onRestoreFocus={() => triggerRef.current?.focus()}
          onPreview={(next, nextPowered) => onPreview({
            index: slot - 1,
            module: next,
            powered: nextPowered,
            returnLevel: bus.returnLevel,
            limiterEnabled: bus.limiterEnabled
          })}
        />
      )}
    </div>
  )
}
