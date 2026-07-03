import { useCallback, useEffect, useRef } from 'react'
import { clamp } from '../lib/playerShell'
import { meterFillPct } from '../lib/sample-utils'

interface ChannelStripProps {
  channelIndex: number
  label: string
  gain: number
  pan: number
  muted: boolean
  solo: boolean
  levelDb: number
  peakDb: number
  onSetGain: (channelIndex: number, gain: number) => void
  onSetPan: (channelIndex: number, pan: number) => void
  onToggleMute: (channelIndex: number) => void
  onToggleSolo: (channelIndex: number) => void
  onRemove: (channelIndex: number) => void
}

/** Zone color for a dB value via CSS custom property tokens.
 *  green < -12, yellow -12..-3, red > -3. */
function dbColorZoneVar(db: number): string {
  if (db > -3) return 'var(--meter-red)'
  if (db > -12) return 'var(--meter-yellow)'
  return 'var(--meter-green)'
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
  onSetGain,
  onSetPan,
  onToggleMute,
  onToggleSolo,
  onRemove
}: ChannelStripProps) {
  // Track active window listeners so they are torn down if the component
  // unmounts mid-drag (e.g. navigating Home while holding the mouse button).
  const dragCleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => () => dragCleanupRef.current?.(), [])

  const handleVolChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSetGain(channelIndex, Number(e.currentTarget.value) / 100)
    },
    [channelIndex, onSetGain]
  )

  const handlePanMouseDown = useCallback(
    (e: React.MouseEvent) => {
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

  const levelPct = meterFillPct(levelDb)
  const peakPct = meterFillPct(peakDb)

  return (
    <div className="mixer-channel-strip">
      <div className="mixer-channel-label">
        <span>{label}</span>
        <button
          type="button"
          className="mixer-channel-remove"
          aria-label={`Remove channel ${channelIndex + 1}`}
          onClick={() => onRemove(channelIndex)}
        >
          ×
        </button>
      </div>

      <div className="mixer-channel-vol-wrap">
        <input
          type="range"
          className="mixer-channel-vol"
          min="0"
          max="100"
          value={Math.round(gain * 100)}
          aria-label={`Channel ${channelIndex + 1} Volume`}
          onChange={handleVolChange}
        />
        <div className="mixer-channel-meter">
          <div
            className="mixer-channel-meter-fill"
            style={{
              height: `${levelPct}%`,
              background: dbColorZoneVar(levelDb)
            }}
          />
          <div
            className="mixer-channel-meter-peak"
            style={{ bottom: `${Math.min(peakPct, 99)}%` }}
          />
        </div>
      </div>

      <div
        className="mixer-channel-pan"
        role="slider"
        aria-label={`Channel ${channelIndex + 1} Pan`}
        aria-valuemin={-1}
        aria-valuemax={1}
        aria-valuenow={Math.round(pan * 100) / 100}
        style={{ '--pan-angle': `${pan * 135}deg` } as React.CSSProperties}
        onMouseDown={handlePanMouseDown}
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
    </div>
  )
}
