import { useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import { clamp, meterFillPct } from '../lib/sample-utils'
import { useStoreValue, type ReadableStore } from '../lib/value-store'
import { LinearSlider } from './ui/Slider'

function joinClasses(...classes: Array<string | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

function decimalPlaces(value: number): number {
  const [, decimals = ''] = String(value).split('.')
  return decimals.length
}

function quantize(value: number, min: number, max: number, step: number): number {
  const clamped = clamp(value, min, max)
  return Number((Math.round((clamped - min) / step) * step + min).toFixed(decimalPlaces(step)))
}

function meterZoneVar(db: number): string {
  if (db > -3) return 'var(--meter-red)'
  if (db > -12) return 'var(--meter-yellow)'
  return 'var(--meter-green)'
}

interface MeterTrackProps {
  valueDb: number
  peakDb?: number
  fillClassName?: string
  peakClassName?: string
}

function MeterTrack({ valueDb, peakDb, fillClassName, peakClassName }: MeterTrackProps) {
  const fillPct = meterFillPct(valueDb)
  const peakPct = meterFillPct(peakDb ?? valueDb)
  return (
    <div className="vertical-meter-track" aria-hidden="true">
      <div
        className={joinClasses('vertical-meter-fill', fillClassName)}
        style={{ height: `${fillPct}%`, background: meterZoneVar(valueDb) }}
      />
      {peakDb !== undefined && (
        <div
          className={joinClasses('vertical-meter-peak', peakClassName)}
          style={{ bottom: `${Math.min(peakPct, 99)}%` }}
        />
      )}
    </div>
  )
}

interface StoreMeterTrackProps {
  store: ReadableStore<{ levelDb: number; peakDb: number }>
  fillClassName?: string
  peakClassName?: string
}

// Leaf subscriber for RAF-cadence telemetry: only these few meter elements
// re-render per frame, never the fader or the strip around them.
function StoreMeterTrack({ store, fillClassName, peakClassName }: StoreMeterTrackProps) {
  const { levelDb, peakDb } = useStoreValue(store)
  return (
    <MeterTrack
      valueDb={levelDb}
      peakDb={peakDb}
      fillClassName={fillClassName}
      peakClassName={peakClassName}
    />
  )
}

interface VerticalFaderProps {
  ariaLabel: string
  value: number
  min: number
  max: number
  step: number
  valueText: string
  onChange: (value: number) => void
  onGestureStart?: () => void
  onGestureEnd?: () => void
  className?: string
  inputClassName?: string
  readoutClassName?: string
  unityClassName?: string
  meterFillClassName?: string
  meterPeakClassName?: string
  tooltip?: string
  unityValue?: number
  /** Live meter feed; the meter subscribes itself and updates at the store cadence. */
  meterStore?: ReadableStore<{ levelDb: number; peakDb: number }>
  /** 'overlay' paints the meter inside the fader track; 'side' places it beside the fader (Mixer strips). */
  meterPosition?: 'overlay' | 'side'
  maxLabel?: string
  minLabel?: string
  wheelStep?: boolean
  showDragValue?: boolean
}

export function VerticalFader({
  ariaLabel,
  value,
  min,
  max,
  step,
  valueText,
  onChange,
  onGestureStart,
  onGestureEnd,
  className,
  inputClassName,
  readoutClassName,
  unityClassName,
  meterFillClassName,
  meterPeakClassName,
  tooltip,
  unityValue,
  meterStore,
  meterPosition = 'overlay',
  maxLabel,
  minLabel,
  wheelStep = false,
  showDragValue = false
}: VerticalFaderProps) {
  const [dragging, setDragging] = useState(false)
  const draggingRef = useRef(false)
  const unityPct = unityValue === undefined ? null : ((unityValue - min) / (max - min)) * 100
  const hasMeter = meterStore !== undefined
  const renderMeter = () =>
    meterStore !== undefined ? (
      <StoreMeterTrack
        store={meterStore}
        fillClassName={meterFillClassName}
        peakClassName={meterPeakClassName}
      />
    ) : null

  const setNextValue = (next: number) => onChange(quantize(next, min, max, step))
  const handleWheel = (event: WheelEvent<HTMLElement>) => {
    if (!wheelStep) return
    event.preventDefault()
    setNextValue(value + (event.deltaY < 0 ? step : -step))
  }
  const beginDrag = (event: PointerEvent<HTMLElement>) => {
    if (event.button > 0) return
    draggingRef.current = true
    setDragging(true)
    onGestureStart?.()
  }
  const endDrag = () => {
    if (!draggingRef.current) return
    draggingRef.current = false
    setDragging(false)
    onGestureEnd?.()
  }

  const sideMeter = hasMeter && meterPosition === 'side'

  const track = (
    <div className="vertical-fader-track">
        {hasMeter && !sideMeter && renderMeter()}
        {unityPct !== null && (
          <div
            className={joinClasses('vertical-fader-unity-tick', unityClassName)}
            style={{ bottom: `${unityPct}%` }}
            aria-hidden="true"
          />
        )}
        {showDragValue && dragging && (
          <output className={joinClasses('vertical-fader-readout', readoutClassName)}>{valueText}</output>
        )}
        <LinearSlider
          className={joinClasses(
            'vertical-fader-input',
            hasMeter && !sideMeter ? 'linear-slider-meter-overlay' : undefined
          )}
          orientation="vertical"
          value={value}
          min={min}
          max={max}
          step={step}
          onValueChange={setNextValue}
          ariaLabel={ariaLabel}
          ariaValueText={valueText}
          tooltip={tooltip}
          thumbClassName={inputClassName}
          showRange={!hasMeter || sideMeter}
          onWheel={handleWheel}
          onPointerDown={beginDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onBlur={endDrag}
        />
    </div>
  )

  return (
    <div
      className={joinClasses(
        'vertical-fader',
        hasMeter ? 'vertical-fader-has-meter' : undefined,
        sideMeter ? 'vertical-fader-side-meter' : undefined,
        className
      )}
    >
      {maxLabel && <span className="vertical-control-endpoint vertical-control-endpoint-max">{maxLabel}</span>}
      {sideMeter ? (
        <div className="vertical-fader-row">
          {renderMeter()}
          {track}
        </div>
      ) : (
        track
      )}
      {minLabel && <span className="vertical-control-endpoint vertical-control-endpoint-min">{minLabel}</span>}
    </div>
  )
}
