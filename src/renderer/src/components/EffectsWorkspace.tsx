import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  EFFECT_PRESETS,
  applyEffectPreset,
  createDefaultEffect,
  effectGlyph,
  effectName,
  effectPresetName,
  type EffectSlot,
  type EffectType,
  type NoteDivision
} from '../engine/effects'
import type { ChannelState } from '../project/project-state'
import { RotaryField, ToggleField } from './RotaryField'
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuRoot, DropdownMenuTrigger } from './ui/DropdownMenu'

interface EffectsWorkspaceProps {
  channels: ChannelState[]
  selectedChannelIndex: number | null
  selectedEffectId: string | null
  effectReductions: ReadonlyMap<string, number>
  canRestoreChannel?: boolean
  onOpenMixer?: () => void
  onRestoreChannel?: () => void
  onSelectChannel: (channelIndex: number) => void
  onSelectEffect: (effectId: string | null) => void
  onAdd: (channelIndex: number, type: EffectType) => EffectSlot | null
  onUpdate: (channelIndex: number, effect: EffectSlot) => void
  onToggleBypass: (channelIndex: number, effectId: string) => void
  onRemove: (channelIndex: number, effectId: string) => void
  onRestore: (channelIndex: number, effect: EffectSlot, index: number) => boolean
  onMove: (channelIndex: number, effectId: string, toIndex: number) => void
}

interface RemovedEffect {
  channelIndex: number
  effect: EffectSlot
  index: number
}

const EFFECT_DESCRIPTIONS: Record<EffectType, string> = {
  delay: 'Create repeating echoes that add rhythm and depth.',
  reverb: 'Place the sound in a room, studio, or large hall.',
  compressor: 'Even out loud and quiet moments for a steadier mix.'
}

const EFFECT_CHAIN_SCROLL_INSET_PX = 12

export default function EffectsWorkspace(props: EffectsWorkspaceProps) {
  const {
    channels, selectedChannelIndex, selectedEffectId, effectReductions,
    canRestoreChannel = false,
    onOpenMixer = () => undefined,
    onRestoreChannel = () => undefined,
    onSelectChannel, onSelectEffect, onAdd, onUpdate, onToggleBypass, onRemove,
    onRestore, onMove
  } = props
  const channel = channels.find((candidate) => candidate.channelIndex === selectedChannelIndex)
  const selected = channel?.effects.find((effect) => effect.id === selectedEffectId) ?? null
  const [removed, setRemoved] = useState<RemovedEffect | null>(null)
  const [undoMessage, setUndoMessage] = useState('')
  const chainRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!removed) return
    const timer = window.setTimeout(() => setRemoved(null), 6000)
    return () => window.clearTimeout(timer)
  }, [removed])

  useEffect(() => {
    if (!channel) {
      if (selectedEffectId !== null) onSelectEffect(null)
      return
    }
    if (selectedEffectId && channel.effects.some((effect) => effect.id === selectedEffectId)) return
    onSelectEffect(channel.effects[0]?.id ?? null)
  }, [channel, selectedEffectId, onSelectEffect])

  useLayoutEffect(() => {
    if (!selectedEffectId) return
    const chain = chainRef.current
    const selectedCard = Array.from(chain?.querySelectorAll<HTMLElement>('[data-effect-id]') ?? [])
      .find((card) => card.dataset.effectId === selectedEffectId)
    if (!chain || !selectedCard) return

    const chainRect = chain.getBoundingClientRect()
    const cardRect = selectedCard.getBoundingClientRect()
    const visibleLeft = chainRect.left + EFFECT_CHAIN_SCROLL_INSET_PX
    const visibleRight = chainRect.right - EFFECT_CHAIN_SCROLL_INSET_PX
    if (cardRect.left >= visibleLeft && cardRect.right <= visibleRight) return

    const nextLeft = cardRect.left < visibleLeft
      ? Math.max(0, chain.scrollLeft + cardRect.left - visibleLeft)
      : Math.max(0, chain.scrollLeft + cardRect.right - visibleRight)
    if (typeof chain.scrollTo === 'function') chain.scrollTo({ left: nextLeft, behavior: 'smooth' })
    else chain.scrollLeft = nextLeft
  }, [selectedEffectId, channel?.effects])

  if (!channel) {
    return <section className="effects-workspace effects-workspace-empty" aria-label="Audio effects">
      <h2>No mixer channels</h2>
      <p>Restore a channel in the mixer before adding audio effects.</p>
      <div className="effects-recovery-actions">
        {canRestoreChannel && <button type="button" className="effects-recovery-primary" onClick={onRestoreChannel}>Restore a channel</button>}
        <button type="button" className="effect-actions" onClick={onOpenMixer}>Open Mixer</button>
      </div>
    </section>
  }

  const removeSelected = () => {
    if (!selected) return
    const index = channel.effects.indexOf(selected)
    const nextId = channel.effects[index + 1]?.id ?? channel.effects[index - 1]?.id ?? null
    setRemoved({ channelIndex: channel.channelIndex, effect: { ...selected }, index })
    setUndoMessage('')
    onRemove(channel.channelIndex, selected.id)
    onSelectEffect(nextId)
  }

  const resetSelected = () => {
    if (!selected) return
    const defaults = createDefaultEffect(selected.type)
    onUpdate(channel.channelIndex, { ...defaults, id: selected.id, bypassed: selected.bypassed } as EffectSlot)
  }

  return <section className="effects-workspace" aria-label={`Channel ${channel.channelIndex + 1} effects`}>
    <header className="effects-workspace-head">
      <div>
        <span className="effects-eyebrow">Signal chain</span>
        <h2>Channel {channel.channelIndex + 1} effects</h2>
      </div>
      <label className="effects-channel-selector">
        Channel
        <select
          aria-label="FX channel"
          value={channel.channelIndex}
          onChange={(event) => onSelectChannel(Number(event.currentTarget.value))}
        >
          {channels.map((candidate) => (
            <option key={candidate.channelIndex} value={candidate.channelIndex}>
              Channel {candidate.channelIndex + 1}
            </option>
          ))}
        </select>
      </label>
      <span className="effects-slot-count">{channel.effects.length} of 4 used</span>
    </header>

    {channel.effects.length > 0 && <div ref={chainRef} className="effects-chain" aria-label="Ordered FX chain">
        {channel.effects.map((effect, index) => <Fragment key={effect.id}>
          <EffectCard
            effect={effect}
            index={index}
            count={channel.effects.length}
            selected={effect.id === selectedEffectId}
            onSelect={() => onSelectEffect(effect.id)}
            onToggleBypass={() => onToggleBypass(channel.channelIndex, effect.id)}
            onMove={(toIndex) => onMove(channel.channelIndex, effect.id, toIndex)}
            onDropEffect={(effectId, toIndex) => onMove(channel.channelIndex, effectId, toIndex)}
          />
          <SignalConnector />
        </Fragment>)}
        <AddEffect
          disabled={channel.effects.length >= 4}
          onAdd={(type) => {
            const effect = onAdd(channel.channelIndex, type)
            if (effect) onSelectEffect(effect.id)
          }}
        />
      </div>}

    {selected ? <EffectEditor
      effect={selected}
      reductionDb={effectReductions.get(selected.id) ?? 0}
      onChange={(effect) => onUpdate(channel.channelIndex, effect)}
      onReset={resetSelected}
      onRemove={removeSelected}
    /> : <div className="effects-empty-chain">
      <strong>Build a signal chain</strong>
      <p>Add an effect to begin. Audio flows from left to right, and order changes the sound.</p>
      <AddEffect
        disabled={false}
        onAdd={(type) => {
          const effect = onAdd(channel.channelIndex, type)
          if (effect) onSelectEffect(effect.id)
        }}
      />
    </div>}

    {removed && <div className="effect-undo-toast" role="status" aria-live="polite">
      <span>{effectName(removed.effect.type)} removed</span>
      <button type="button" onClick={() => {
        const restored = onRestore(removed.channelIndex, removed.effect, removed.index)
        setUndoMessage(restored ? `${effectName(removed.effect.type)} restored` : 'Could not restore: the channel is unavailable or full')
        if (restored) onSelectEffect(removed.effect.id)
        setRemoved(null)
      }}>Undo</button>
    </div>}
    {undoMessage && <div className="effect-undo-message" role="status" aria-live="polite">{undoMessage}</div>}
  </section>
}

function EffectCard({ effect, index, count, selected, onSelect, onToggleBypass, onMove, onDropEffect }: {
  effect: EffectSlot
  index: number
  count: number
  selected: boolean
  onSelect: () => void
  onToggleBypass: () => void
  onMove: (index: number) => void
  onDropEffect: (effectId: string, index: number) => void
}) {
  const [dragOver, setDragOver] = useState(false)
  return <article
    className={`effect-card${selected ? ' effect-card-selected' : ''}${effect.bypassed ? ' effect-card-bypassed' : ''}${dragOver ? ' effect-card-dragover' : ''}`}
    data-effect-id={effect.id}
    draggable
    onDragStart={(event) => event.dataTransfer.setData('text/mixjam-effect-id', effect.id)}
    onDragOver={(event) => { event.preventDefault(); setDragOver(true) }}
    onDragLeave={() => setDragOver(false)}
    onDrop={(event) => { event.preventDefault(); setDragOver(false); const effectId = event.dataTransfer.getData('text/mixjam-effect-id'); if (effectId) onDropEffect(effectId, index) }}
  >
    <button
      type="button"
      className="effect-card-main"
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (!event.altKey) return
        if (event.key === 'ArrowLeft' && index > 0) { event.preventDefault(); onMove(index - 1) }
        if (event.key === 'ArrowRight' && index < count - 1) { event.preventDefault(); onMove(index + 1) }
      }}
    >
      <span className="effect-card-handle" aria-hidden="true">
        <svg viewBox="0 0 12 18">
          <circle cx="3" cy="3" r="1.25" />
          <circle cx="9" cy="3" r="1.25" />
          <circle cx="3" cy="9" r="1.25" />
          <circle cx="9" cy="9" r="1.25" />
          <circle cx="3" cy="15" r="1.25" />
          <circle cx="9" cy="15" r="1.25" />
        </svg>
      </span>
      <span className="effect-card-number">{index + 1}</span>
      <span className="effect-card-icon" aria-hidden="true">{effectGlyph(effect.type)}</span>
      <span className="effect-card-name">{effectName(effect.type)}</span>
    </button>
    <button
      type="button"
      className="effect-power"
      aria-label={`${effect.bypassed ? 'Enable' : 'Bypass'} ${effectName(effect.type)}`}
      aria-pressed={!effect.bypassed}
      onClick={onToggleBypass}
    >{effect.bypassed ? 'Bypassed' : 'Enabled'}</button>
    <DropdownMenuRoot>
      <DropdownMenuTrigger asChild>
        <button type="button" className="effect-card-menu-trigger" aria-label={`${effectName(effect.type)} order actions`}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="4" cy="10" r="1.5" />
            <circle cx="10" cy="10" r="1.5" />
            <circle cx="16" cy="10" r="1.5" />
          </svg>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={index === 0} onSelect={() => onMove(index - 1)}>Move left</DropdownMenuItem>
        <DropdownMenuItem disabled={index === count - 1} onSelect={() => onMove(index + 1)}>Move right</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuRoot>
  </article>
}

function SignalConnector() {
  return <span className="effect-chain-connector" aria-hidden="true">
    <svg viewBox="0 0 28 12">
      <path d="M1 6h22" />
      <path d="m18 2 5 4-5 4" />
    </svg>
  </span>
}

function AddEffect({ disabled, onAdd }: { disabled: boolean; onAdd: (type: EffectType) => void }) {
  if (disabled) return <div className="add-effect add-effect-disabled">4 of 4 effects used</div>
  return <DropdownMenuRoot>
    <DropdownMenuTrigger asChild>
      <button type="button" className="add-effect">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg>
        Add effect
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent className="add-effect-menu" align="start">
      {(['delay', 'reverb', 'compressor'] as const).map((type) => (
        <DropdownMenuItem key={type} onSelect={() => onAdd(type)} textValue={effectName(type)}>
          <strong>{effectName(type)}</strong>
          <span>{EFFECT_DESCRIPTIONS[type]}</span>
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenuRoot>
}

function EffectEditor({ effect, reductionDb, onChange, onReset, onRemove }: {
  effect: EffectSlot
  reductionDb: number
  onChange: (effect: EffectSlot) => void
  onReset: () => void
  onRemove: () => void
}) {
  const preset = effectPresetName(effect) ?? 'Custom'
  return <div className={`effect-detail effect-detail-${effect.type}${effect.bypassed ? ' effect-detail-bypassed' : ''}`}>
    <header className="effect-detail-head">
      <div>
        <div className="effect-detail-title">
          <h3>{effectName(effect.type)}</h3>
          <span className={`effect-detail-state${effect.bypassed ? ' effect-detail-state-bypassed' : ''}`}>
            {effect.bypassed ? 'Bypassed' : 'Enabled'}
          </span>
        </div>
        <p>{EFFECT_DESCRIPTIONS[effect.type]}</p>
      </div>
      <label className="effect-preset">Starting point
        <select value={preset} onChange={(event) => {
          if (event.currentTarget.value !== 'Custom') onChange(applyEffectPreset(effect, event.currentTarget.value))
        }}>
          {EFFECT_PRESETS[effect.type].map((candidate) => <option key={candidate.name}>{candidate.name}</option>)}
          {preset === 'Custom' && <option>Custom</option>}
        </select>
      </label>
      <DropdownMenuRoot>
        <DropdownMenuTrigger asChild>
          <button type="button" className="effect-actions" aria-label={`${effectName(effect.type)} actions`}>Actions</button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onReset}>Reset to factory settings</DropdownMenuItem>
          <DropdownMenuItem className="effect-remove" onSelect={onRemove}>Remove effect</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenuRoot>
    </header>
    <div className="effect-controls">{renderControls(effect, onChange, reductionDb)}</div>
  </div>
}

function renderControls(effect: EffectSlot, onChange: (effect: EffectSlot) => void, reductionDb: number) {
  if (effect.type === 'delay') return <>
    {effect.tempoSync ? <label className="effect-choice"><strong>Note division</strong>
      <select value={effect.noteDivision} onChange={(event) => onChange({ ...effect, noteDivision: event.currentTarget.value as NoteDivision })}>
        {['1/4', '1/8', '1/16', '1/8T', '1/16T'].map((division) => <option key={division}>{division}</option>)}
      </select><span className="effect-control-help">Sets each echo to a musical beat division.</span>
    </label> : <RotaryField label="Time" help="Controls how long the echo waits." value={effect.timeMs} defaultValue={375} min={0} max={2000} step={1} suffix=" ms" onChange={(timeMs) => onChange({ ...effect, timeMs })} />}
    <RotaryField label="Feedback" help="Controls how many echoes repeat." value={effect.feedback} defaultValue={0.35} min={0} max={1} step={0.01} percent onChange={(feedback) => onChange({ ...effect, feedback })} />
    <RotaryField label="Mix" help="Blends the echo with the original sound." value={effect.mix} defaultValue={0.3} min={0} max={1} step={0.01} percent onChange={(mix) => onChange({ ...effect, mix })} />
    <ToggleField label="Tempo sync" help="Locks echo timing to the song BPM." checked={effect.tempoSync} onChange={(tempoSync) => onChange({ ...effect, tempoSync })} />
    <ToggleField label="Ping-pong" help="Alternates echoes between left and right." checked={effect.pingPong} onChange={(pingPong) => onChange({ ...effect, pingPong })} />
  </>
  if (effect.type === 'reverb') return <>
    <RotaryField label="Room size" help="Changes the apparent size of the space." value={effect.roomSize} defaultValue={0.55} min={0} max={1} step={0.01} percent onChange={(roomSize) => onChange({ ...effect, roomSize })} />
    <RotaryField label="Decay" help="Controls how long the room tail lasts." value={effect.decay} defaultValue={0.45} min={0} max={1} step={0.01} percent onChange={(decay) => onChange({ ...effect, decay })} />
    <RotaryField label="Mix" help="Blends the room sound with the original." value={effect.mix} defaultValue={0.25} min={0} max={1} step={0.01} percent onChange={(mix) => onChange({ ...effect, mix })} />
  </>
  return <>
    <RotaryField label="Threshold" help="Sets the level where compression starts." value={effect.threshold} defaultValue={-24} min={-60} max={0} step={1} suffix=" dB" onChange={(threshold) => onChange({ ...effect, threshold })} />
    <RotaryField label="Ratio" help="Sets how strongly loud peaks are reduced." value={effect.ratio} defaultValue={4} min={1} max={20} step={0.1} suffix=":1" onChange={(ratio) => onChange({ ...effect, ratio })} />
    <RotaryField label="Attack" help="Sets how quickly compression begins." value={effect.attackMs} defaultValue={10} min={0} max={200} step={1} suffix=" ms" onChange={(attackMs) => onChange({ ...effect, attackMs })} />
    <RotaryField label="Release" help="Sets how quickly compression lets go." value={effect.releaseMs} defaultValue={250} min={5} max={3000} step={5} suffix=" ms" onChange={(releaseMs) => onChange({ ...effect, releaseMs })} />
    <RotaryField label="Makeup" help="Restores level after compression." value={effect.makeupGain} defaultValue={0} min={0} max={24} step={0.5} suffix=" dB" onChange={(makeupGain) => onChange({ ...effect, makeupGain })} />
    <div
      className="reduction-meter"
      role="meter"
      aria-label={`Gain reduction ${reductionDb.toFixed(1)} dB`}
      aria-valuemin={0}
      aria-valuemax={24}
      aria-valuenow={Number(reductionDb.toFixed(1))}
    >
      <div className="reduction-meter-head">
        <strong>Gain reduction</strong>
        <output>{reductionDb.toFixed(1)} dB</output>
      </div>
      <div className="reduction-meter-body" aria-hidden="true">
        <span className="reduction-meter-scale"><span>24</span><span>12</span><span>0 dB</span></span>
        <div className="reduction-meter-track"><i style={{ height: `${Math.min(100, reductionDb / 24 * 100)}%` }} /></div>
      </div>
      <small>Shows how much loud audio is being turned down.</small>
    </div>
  </>
}
