import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { effectGlyph, effectName, type EffectSlot, type EffectType, type NoteDivision } from '../engine/effects'

interface ChannelEffectsProps {
  channelIndex: number
  effects: EffectSlot[]
  onAdd: (channelIndex: number, type: EffectType) => void
  onUpdate: (channelIndex: number, effect: EffectSlot) => void
  onToggleBypass: (channelIndex: number, effectId: string) => void
  onRemove: (channelIndex: number, effectId: string) => void
  onMove: (channelIndex: number, effectId: string, toIndex: number) => void
}

export default function ChannelEffects(props: ChannelEffectsProps) {
  const { channelIndex, effects, onAdd, onUpdate, onToggleBypass, onRemove, onMove } = props
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Dismiss the editor when this component unmounts (e.g. channel removed
  // while the effect editor portal is still open).
  useEffect(() => () => setSelectedId(null), [])

  const selected = effects.find((effect) => effect.id === selectedId)

  return (
    <div className="channel-effects" aria-label={`Channel ${channelIndex + 1} effects`}>
      <div className="channel-effect-chain">
        {effects.map((effect, index) => (
          <button
            key={effect.id}
            type="button"
            draggable
            className={`channel-effect-slot${effect.bypassed ? ' channel-effect-slot-bypassed' : ''}`}
            aria-label={`${effectName(effect.type)} effect on channel ${channelIndex + 1}`}
            aria-pressed={selectedId === effect.id}
            title={effectName(effect.type)}
            onClick={() => setSelectedId(effect.id)}
            onDragStart={(event) => event.dataTransfer.setData('text/mixjam-effect-id', effect.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              const effectId = event.dataTransfer.getData('text/mixjam-effect-id')
              if (effectId) onMove(channelIndex, effectId, index)
            }}
          >
            {effectGlyph(effect.type)}
          </button>
        ))}
      </div>
      <select
        className="channel-effect-add"
        aria-label={`Add effect to channel ${channelIndex + 1}`}
        value=""
        disabled={effects.length >= 4}
        onChange={(event) => {
          if (event.currentTarget.value) onAdd(channelIndex, event.currentTarget.value as EffectType)
        }}
      >
        <option value="">+</option>
        <option value="delay">Delay</option>
        <option value="reverb">Reverb</option>
        <option value="compressor">Compressor</option>
      </select>
      {selected && createPortal(
        <div className="effect-editor-backdrop" onMouseDown={() => setSelectedId(null)}>
          <section
            className="effect-editor"
            role="dialog"
            aria-modal="true"
            aria-label={`${effectName(selected.type)} settings for channel ${channelIndex + 1}`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="effect-editor-head">
              <strong>{effectName(selected.type)} · Channel {channelIndex + 1}</strong>
              <button type="button" aria-label="Close effect settings" onClick={() => setSelectedId(null)}>×</button>
            </header>
            <EffectParameters effect={selected} onChange={(effect) => onUpdate(channelIndex, effect)} />
            <footer className="effect-editor-actions">
              <button type="button" aria-pressed={selected.bypassed} onClick={() => onToggleBypass(channelIndex, selected.id)}>
                {selected.bypassed ? 'Enable' : 'Bypass'}
              </button>
              <button type="button" disabled={effects.indexOf(selected) === 0} onClick={() => onMove(channelIndex, selected.id, effects.indexOf(selected) - 1)}>
                Move left
              </button>
              <button type="button" disabled={effects.indexOf(selected) === effects.length - 1} onClick={() => onMove(channelIndex, selected.id, effects.indexOf(selected) + 1)}>
                Move right
              </button>
              <button type="button" onClick={() => { onRemove(channelIndex, selected.id); setSelectedId(null) }}>Remove</button>
            </footer>
          </section>
        </div>,
        document.body
      )}
    </div>
  )
}

function RangeField({ label, value, min, max, step, suffix = '', onChange }: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix?: string
  onChange: (value: number) => void
}) {
  return (
    <label className="effect-parameter">
      <span>{label}</span>
      <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.currentTarget.value))} />
      <output>{value}{suffix}</output>
    </label>
  )
}

function EffectParameters({ effect, onChange }: { effect: EffectSlot; onChange: (effect: EffectSlot) => void }) {
  if (effect.type === 'delay') {
    return <div className="effect-parameters">
      <RangeField label="Time" value={effect.timeMs} min={0} max={2000} step={1} suffix=" ms" onChange={(timeMs) => onChange({ ...effect, timeMs })} />
      <RangeField label="Feedback" value={effect.feedback} min={0} max={1} step={0.01} onChange={(feedback) => onChange({ ...effect, feedback })} />
      <RangeField label="Mix" value={effect.mix} min={0} max={1} step={0.01} onChange={(mix) => onChange({ ...effect, mix })} />
      <label><input type="checkbox" checked={effect.pingPong} onChange={(event) => onChange({ ...effect, pingPong: event.currentTarget.checked })} /> Ping-pong</label>
      <label><input type="checkbox" checked={effect.tempoSync} onChange={(event) => onChange({ ...effect, tempoSync: event.currentTarget.checked })} /> Tempo sync</label>
      <label>Note division <select aria-label="Note division" value={effect.noteDivision} onChange={(event) => onChange({ ...effect, noteDivision: event.currentTarget.value as NoteDivision })}>
        {['1/4', '1/8', '1/16', '1/8T', '1/16T'].map((division) => <option key={division}>{division}</option>)}
      </select></label>
    </div>
  }
  if (effect.type === 'reverb') {
    return <div className="effect-parameters">
      <RangeField label="Room size" value={effect.roomSize} min={0} max={1} step={0.01} onChange={(roomSize) => onChange({ ...effect, roomSize })} />
      <RangeField label="Decay" value={effect.decay} min={0} max={1} step={0.01} onChange={(decay) => onChange({ ...effect, decay })} />
      <RangeField label="Mix" value={effect.mix} min={0} max={1} step={0.01} onChange={(mix) => onChange({ ...effect, mix })} />
    </div>
  }
  if (effect.type === 'compressor') {
    return <div className="effect-parameters">
      <RangeField label="Threshold" value={effect.threshold} min={-60} max={0} step={1} suffix=" dB" onChange={(threshold) => onChange({ ...effect, threshold })} />
      <RangeField label="Ratio" value={effect.ratio} min={1} max={20} step={0.1} onChange={(ratio) => onChange({ ...effect, ratio })} />
      <RangeField label="Attack" value={effect.attackMs} min={0} max={200} step={1} suffix=" ms" onChange={(attackMs) => onChange({ ...effect, attackMs })} />
      <RangeField label="Release" value={effect.releaseMs} min={5} max={3000} step={5} suffix=" ms" onChange={(releaseMs) => onChange({ ...effect, releaseMs })} />
      <RangeField label="Makeup gain" value={effect.makeupGain} min={0} max={24} step={0.5} suffix=" dB" onChange={(makeupGain) => onChange({ ...effect, makeupGain })} />
    </div>
  }
  const _exhaustive: never = effect
  return _exhaustive
}
