import { useCallback, useRef, useState } from 'react'
import type { PlaybackReturnSnapshot } from '../engine/playback-engine'
import {
  createEmptyReturnModule,
  getReturnEffect,
  returnEffectDescriptors,
  type AetherformReverbModule,
  type EchoformDelayModule,
  type ReturnModule
} from '../engine/return-effects'
import EchoformDelayModal from './EchoformDelayModal'
import AetherformReverbModal from './AetherformReverbModal'
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
  onSetBpm?: (bpm: number) => void
  onSet: (bus: PlaybackReturnSnapshot) => void
  onPreview: (bus: PlaybackReturnSnapshot) => void
  /**
   * Momentary Clear Tail command for this Return bus. The host always supplies
   * it; whether an editor exposes Clear Tail is decided by the effect
   * descriptor's `supportsClearTail`, not by this prop's presence.
   */
  onClearTail?: (index: number) => void
  onGestureStart: () => void
  onGestureEnd: () => void
}

const LIMITER_TOOLTIP = 'Limiter\nCaps this FX Return at −1 dBFS using stereo-linked peak limiting. Filled = engaged (default). Red = bypassed, so the return runs uncapped. Click to toggle. This does not limit the Master output.'

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

function moduleDisplayName(module: ReturnModule): string {
  if (module.type === 'empty') return 'Empty'
  return getReturnEffect(module.type)?.label ?? 'Empty'
}

function moduleSummary(module: ReturnModule, mix: number): string {
  if (module.type === 'echoform-delay') {
    return `${module.mode === 'sync' ? module.divisionL : `${Math.round(module.timeMsL)} ms`} · Feedback ${Math.round(module.feedback)}% · ${module.character} · Mix ${Math.round(mix * 100)}%`
  }
  if (module.type === 'aetherform-reverb') {
    const decay = module.decaySeconds < 10
      ? module.decaySeconds.toFixed(1)
      : String(Math.round(module.decaySeconds))
    const shimmer = module.shimmerEnabled ? ` · Shimmer +${module.shimmerIntervalSemitones}` : ''
    return `${module.spaceModel} · ${decay} s · ${module.character}${shimmer} · Mix ${Math.round(mix * 100)}%`
  }
  return 'No effect assigned'
}

type EditingState =
  | { kind: 'echoform-delay'; module: EchoformDelayModule; powered: boolean }
  | { kind: 'aetherform-reverb'; module: AetherformReverbModule; powered: boolean }

export default function MixerFxSlot({
  bus,
  bpm = 120,
  onSetBpm,
  onSet,
  onPreview,
  onClearTail,
  onGestureStart,
  onGestureEnd
}: MixerFxSlotProps) {
  const [editing, setEditing] = useState<EditingState | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const module = bus.module

  // The editor syncs the live DSP from an effect keyed on this callback. An
  // inline arrow would change identity on every render of this component, and
  // the transport's 10 Hz elapsed-time tick re-renders the whole Mixer chain
  // during playback — which re-fired the effect ~20x/s and pushed redundant
  // worklet state messages and AudioParam writes for unchanged values. Read
  // `bus` through a ref so the callback stays stable for the editor's lifetime.
  const busRef = useRef(bus)
  busRef.current = bus
  const previewFromEditor = useCallback(
    (next: ReturnModule, nextPowered: boolean, nextMix: number) => {
      onPreview({
        ...busRef.current,
        module: next,
        powered: nextPowered,
        returnLevel: nextMix
      })
    },
    [onPreview]
  )
  const slot = bus.index + 1
  const hasEffect = module.type !== 'empty'
  const moduleName = moduleDisplayName(module)
  const bypassed = hasEffect && !bus.powered
  const triggerName = `FX ${slot} ${moduleName}${bypassed ? ' bypassed' : ''}`
  // The FX-slot Mix knob and the editor Mix are ONE parameter: the bus return
  // level. Effect modules always render 100% wet; returnLevel is the single Mix.
  const mix = bus.returnLevel

  // Menu entries come from the effect registry, so a new effect appears here
  // with no edit. Choosing an effect reuses the slot's module when the type
  // already matches, otherwise builds that effect's default. The modal to open
  // is selected per type below (each editor is its own component).
  const chooseEffect = (type: ReturnModule['type']) => {
    const descriptor = returnEffectDescriptors().find((d) => d.type === type)
    if (!descriptor) return
    const next = module.type === type ? { ...module } : descriptor.createDefault(`fx-${slot}`)
    onPreview({ ...bus, module: next, powered: bus.powered })
    if (next.type === 'echoform-delay') {
      setEditing({ kind: 'echoform-delay', module: next, powered: bus.powered })
    } else if (next.type === 'aetherform-reverb') {
      setEditing({ kind: 'aetherform-reverb', module: next, powered: bus.powered })
    }
  }

  // Edit reopens the editor matching the module in the slot. An Empty slot has
  // no module to edit, so Edit opens the effect picker instead of silently
  // defaulting to an effect.
  const edit = () => {
    if (module.type === 'empty') setMenuOpen(true)
    else chooseEffect(module.type)
  }

  const saveModule = (next: ReturnModule, powered: boolean, returnLevel: number) => {
    onSet({ ...bus, module: next, powered, returnLevel })
    setEditing(null)
  }

  const cancel = () => {
    onPreview(bus)
    setEditing(null)
  }

  const clear = () => {
    onSet({ ...bus, module: createEmptyReturnModule(`fx-${slot}`) })
  }

  const summary = moduleSummary(module, mix)

  return (
    <div className="mixer-fx-slot-wrap" style={slotAccentStyle(slot)}>
      <section
        className={`mixer-fx-card${bypassed ? ' mixer-fx-card-bypassed' : ''}`}
        aria-label={`FX Return ${slot}`}
      >
        <div className="mixer-fx-head">
          <DropdownMenuRoot open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button ref={triggerRef} type="button" className="mixer-fx-slot" aria-label={triggerName}>
                <span className="mixer-fx-num" aria-hidden="true">{String(slot).padStart(2, '0')}</span>
                <span className="mixer-fx-name">{moduleName}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="mixer-fx-menu" align="start">
              {returnEffectDescriptors().map((descriptor) => (
                <DropdownMenuItem key={descriptor.type} onSelect={() => chooseEffect(descriptor.type)}>
                  {descriptor.label}...
                </DropdownMenuItem>
              ))}
              {module.type !== 'empty' && (
                <DropdownMenuItem onSelect={clear}>Clear slot</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenuRoot>
          {hasEffect ? (
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
            onClick={edit}
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
            >
              <span className="mixer-limiter-glyph" aria-hidden="true">L</span>
            </button>
          </Tooltip>
          <div className="mixer-fx-mix">
            <span className="mixer-fx-mix-label" aria-hidden="true">Mix</span>
            <Tooltip content={`${moduleName}, Return ${slot}: ${Math.round(mix * 100)}%`}>
              <span className="mixer-return-level-wrap">
                <RotaryControl
                  className="mixer-return-level"
                  label={`FX Return ${slot} Mix`}
                  value={mix}
                  min={0}
                  max={1}
                  step={0.01}
                  valueText={`${Math.round(mix * 100)}%`}
                  defaultValue={1}
                  ariaMultiplier={100}
                  onGestureStart={onGestureStart}
                  onGestureEnd={onGestureEnd}
                  onChange={(nextMix) => onSet({ ...bus, returnLevel: nextMix })}
                >
                  <RotaryDial
                    className="mixer-compact-rotary"
                    value={mix}
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
      {editing?.kind === 'echoform-delay' && (
        <EchoformDelayModal
          value={editing.module}
          powered={editing.powered}
          mix={bus.returnLevel}
          bpm={bpm}
          onSetBpm={onSetBpm}
          slot={slot}
          onCancel={cancel}
          onSave={saveModule}
          onRestoreFocus={() => triggerRef.current?.focus()}
          onPreview={previewFromEditor}
        />
      )}
      {editing?.kind === 'aetherform-reverb' && (
        <AetherformReverbModal
          value={editing.module}
          powered={editing.powered}
          mix={bus.returnLevel}
          slot={slot}
          onCancel={cancel}
          onSave={saveModule}
          // Clear Tail is exposed only when the effect declares the capability
          // in the registry, not merely because the host wired the command.
          onClearTail={
            getReturnEffect(editing.kind)?.supportsClearTail && onClearTail
              ? () => onClearTail(bus.index)
              : undefined
          }
          onRestoreFocus={() => triggerRef.current?.focus()}
          onPreview={previewFromEditor}
        />
      )}
    </div>
  )
}
