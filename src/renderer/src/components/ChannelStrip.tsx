import { useCallback, useEffect, useRef } from 'react'
import { clamp, nextPanCycle } from '../lib/sample-utils'
import ChannelEffects from './ChannelEffects'
import type { EffectSlot } from '../engine/effects'
import { VerticalFader } from './VerticalControls'

interface ChannelStripProps {
  channelIndex: number
  label: string
  gain: number
  pan: number
  muted: boolean
  solo: boolean
  levelDb: number
  peakDb: number
  effects: EffectSlot[]
  selected?: boolean
  onSetGain: (channelIndex: number, gain: number) => void
  onSetPan: (channelIndex: number, pan: number) => void
  onToggleMute: (channelIndex: number) => void
  onToggleSolo: (channelIndex: number) => void
  onRemove: (channelIndex: number) => void
  onSelect?: (channelIndex: number) => void
  onOpenEffects?: (channelIndex: number) => void
}

const PAN_KEY_STEP = 0.05

function panValueText(pan: number): string {
  const pct = Math.round(Math.abs(pan) * 100)
  if (pct === 0) return 'Center'
  return pan < 0 ? `${pct}% left` : `${pct}% right`
}

export default function ChannelStrip({
  channelIndex,
  label,
  gain,
  pan,
  muted,
  solo,
  levelDb,
  peakDb,
  effects,
  selected = false,
  onSetGain,
  onSetPan,
  onToggleMute,
  onToggleSolo,
  onRemove,
  onSelect = () => undefined,
  onOpenEffects = () => undefined
}: ChannelStripProps) {
  // Track active window listeners so they are torn down if the component
  // unmounts mid-drag (e.g. navigating Home while holding the mouse button).
  const dragCleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => () => dragCleanupRef.current?.(), [])

  const handlePanMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Ignore right/middle press — it must not start a scrub drag, or it races
      // the right-click cycle (AC-018) and audibly sweeps pan.
      if (e.button > 0) return
      e.preventDefault()
      const startX = e.clientX
      const startPan = pan
      const sensitivity = 0.008

      const onMove = (me: MouseEvent) => {
        const delta = (me.clientX - startX) * sensitivity
        onSetPan(channelIndex, clamp(startPan + delta, -1, 1))
      }

      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        dragCleanupRef.current = null
      }

      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
      dragCleanupRef.current = onUp
    },
    [channelIndex, pan, onSetPan]
  )

  const handlePanContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      onSetPan(channelIndex, nextPanCycle(pan))
    },
    [channelIndex, pan, onSetPan]
  )

  const handlePanKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      let next: number
      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowDown':
          next = clamp(pan - PAN_KEY_STEP, -1, 1)
          break
        case 'ArrowRight':
        case 'ArrowUp':
          next = clamp(pan + PAN_KEY_STEP, -1, 1)
          break
        case 'Home':
          next = 0
          break
        case 'End':
          next = 1
          break
        default:
          return
      }
      e.preventDefault()
      onSetPan(channelIndex, next)
    },
    [channelIndex, pan, onSetPan]
  )

  return (
    <div className={`mixer-channel-strip${muted ? ' mixer-channel-strip-muted' : ''}${selected ? ' mixer-channel-strip-selected' : ''}`}>
      <div className="mixer-channel-label">
        <span>{label}</span>
        <button type="button" className="mixer-channel-select" aria-label={`Select channel ${channelIndex + 1}`} aria-pressed={selected} onClick={() => onSelect(channelIndex)} />
        <button
          type="button"
          className="mixer-channel-remove"
          aria-label={`Remove channel ${channelIndex + 1}`}
          onClick={() => onRemove(channelIndex)}
        >
          ×
        </button>
      </div>

      <VerticalFader
        className="mixer-channel-vol-wrap"
        inputClassName="mixer-channel-vol"
        readoutClassName="mixer-channel-vol-readout"
        unityClassName="mixer-channel-unity-tick"
        meterFillClassName="mixer-channel-meter-fill"
        meterPeakClassName="mixer-channel-meter-peak"
        ariaLabel={`Channel ${channelIndex + 1} Volume`}
        value={Math.round(gain * 100)}
        min={0}
        max={100}
        step={1}
        valueText={`${Math.round(gain * 100)}%`}
        unityValue={100}
        meterDb={levelDb}
        peakDb={peakDb}
        showDragValue
        onChange={(value) => onSetGain(channelIndex, value / 100)}
      />

      <div
        className="mixer-channel-pan"
        role="slider"
        tabIndex={0}
        aria-label={`Channel ${channelIndex + 1} Pan`}
        aria-valuemin={-1}
        aria-valuemax={1}
        aria-valuenow={Math.round(pan * 100) / 100}
        aria-valuetext={panValueText(pan)}
        style={{ '--pan-angle': `${pan * 135}deg` } as React.CSSProperties}
        onMouseDown={handlePanMouseDown}
        onContextMenu={handlePanContextMenu}
        onKeyDown={handlePanKeyDown}
      />

      <div className="mixer-channel-buttons">
        <button
          type="button"
          className={`mixer-channel-m ${muted ? 'mixer-channel-m-active' : ''}`}
          aria-label={`Mute channel ${channelIndex + 1}`}
          aria-pressed={muted}
          onClick={() => onToggleMute(channelIndex)}
        >
          M
        </button>
        <button
          type="button"
          className={`mixer-channel-s ${solo ? 'mixer-channel-s-active' : ''}`}
          aria-label={`Solo channel ${channelIndex + 1}`}
          aria-pressed={solo}
          onClick={() => onToggleSolo(channelIndex)}
        >
          S
        </button>
      </div>
      <ChannelEffects
        channelIndex={channelIndex}
        effects={effects}
        onOpen={onOpenEffects}
      />
    </div>
  )
}
