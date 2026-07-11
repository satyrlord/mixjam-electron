import * as Slider from '@radix-ui/react-slider'
import { useState, type CSSProperties, type PointerEvent, type WheelEvent } from 'react'
import { clamp, meterFillPct } from '../lib/sample-utils'

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

interface VerticalFaderProps {
  ariaLabel: string
  value: number
  min: number
  max: number
  step: number
  valueText: string
  onChange: (value: number) => void
  className?: string
  inputClassName?: string
  readoutClassName?: string
  unityClassName?: string
  meterFillClassName?: string
  meterPeakClassName?: string
  title?: string
  unityValue?: number
  meterDb?: number
  peakDb?: number
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
  className,
  inputClassName,
  readoutClassName,
  unityClassName,
  meterFillClassName,
  meterPeakClassName,
  title,
  unityValue,
  meterDb,
  peakDb,
  maxLabel,
  minLabel,
  wheelStep = false,
  showDragValue = false
}: VerticalFaderProps) {
  const [dragging, setDragging] = useState(false)
  const valuePct = ((value - min) / (max - min)) * 100
  const unityPct = unityValue === undefined ? null : ((unityValue - min) / (max - min)) * 100

  const setNextValue = (next: number) => onChange(quantize(next, min, max, step))
  const handleWheel = (event: WheelEvent<HTMLElement>) => {
    if (!wheelStep) return
    event.preventDefault()
    setNextValue(value + (event.deltaY < 0 ? step : -step))
  }
  const beginDrag = (event: PointerEvent<HTMLElement>) => {
    if (event.button > 0) return
    setDragging(true)
  }
  const endDrag = () => setDragging(false)

  return (
    <div
      className={joinClasses('vertical-fader', meterDb === undefined ? undefined : 'vertical-fader-has-meter', className)}
      style={{ '--vertical-fader-value': `${valuePct}%` } as CSSProperties}
    >
      {maxLabel && <span className="vertical-control-endpoint vertical-control-endpoint-max">{maxLabel}</span>}
      <div className="vertical-fader-track">
        {meterDb === undefined ? (
          <div className="vertical-fader-value-fill" aria-hidden="true" />
        ) : (
          <MeterTrack
            valueDb={meterDb}
            peakDb={peakDb}
            fillClassName={meterFillClassName}
            peakClassName={meterPeakClassName}
          />
        )}
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
        <Slider.Root
          className="vertical-fader-input"
          orientation="vertical"
          value={[value]}
          min={min}
          max={max}
          step={step}
          onValueChange={([next]) => setNextValue(next)}
          onWheel={handleWheel}
          onPointerDown={beginDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onBlur={endDrag}
        >
          <Slider.Track className="vertical-fader-native-track">
            <Slider.Range className="vertical-fader-native-range" />
          </Slider.Track>
          <Slider.Thumb
            className={joinClasses('vertical-fader-thumb', inputClassName)}
            aria-label={ariaLabel}
            aria-valuetext={valueText}
            title={title}
          />
        </Slider.Root>
      </div>
      {minLabel && <span className="vertical-control-endpoint vertical-control-endpoint-min">{minLabel}</span>}
    </div>
  )
}

interface VerticalMeterProps {
  ariaLabel: string
  valueDb: number
  minDb?: number
  maxDb?: number
  maxLabel?: string
  minLabel?: string
  className?: string
}

export function VerticalMeter({
  ariaLabel,
  valueDb,
  minDb = -100,
  maxDb = 0,
  maxLabel,
  minLabel,
  className
}: VerticalMeterProps) {
  return (
    <div
      className={joinClasses('vertical-meter', className)}
      role="meter"
      aria-label={ariaLabel}
      aria-valuemin={minDb}
      aria-valuemax={maxDb}
      aria-valuenow={Math.round(valueDb)}
      aria-valuetext={`${Math.round(valueDb)} dB`}
    >
      {maxLabel && <span className="vertical-control-endpoint vertical-control-endpoint-max">{maxLabel}</span>}
      <MeterTrack valueDb={valueDb} />
      {minLabel && <span className="vertical-control-endpoint vertical-control-endpoint-min">{minLabel}</span>}
    </div>
  )
}
