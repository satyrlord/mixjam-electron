import type { CSSProperties } from 'react'
import type { MasterMeterSnapshot } from '../engine/master-meter'

interface MasterLoudnessMeterProps {
  snapshot: MasterMeterSnapshot
  onReset: () => void
}

const MIN_LUFS = -60
const MAX_LUFS = 0

function format(value: number | null, unit: string): string {
  return value === null ? `-- ${unit}` : `${value.toFixed(1)} ${unit}`
}

function fillPercent(value: number): number {
  return Math.max(0, Math.min(100, ((value - MIN_LUFS) / (MAX_LUFS - MIN_LUFS)) * 100))
}

function meterColor(value: number): string {
  if (value > -3) return 'var(--meter-red)'
  if (value > -12) return 'var(--meter-yellow)'
  return 'var(--meter-green)'
}

export default function MasterLoudnessMeter({
  snapshot,
  onReset
}: MasterLoudnessMeterProps) {
  const standardValue = snapshot.momentaryLufs
  const value = standardValue ?? snapshot.rmsDbfs
  const unit = standardValue === null ? 'dBFS' : 'LUFS'
  const ariaMin = standardValue === null ? -100 : MIN_LUFS
  const scaleValue = Math.max(MIN_LUFS, Math.min(MAX_LUFS, value))
  const valueText = `${value.toFixed(1)} ${unit}`

  return (
    <div className="master-loudness-meter">
      <div
        className="vertical-meter master-loudness-track"
        role="meter"
        aria-label="Output Level"
        aria-valuemin={ariaMin}
        aria-valuemax={MAX_LUFS}
        aria-valuenow={Number(value.toFixed(1))}
        aria-valuetext={valueText}
      >
        <span className="vertical-control-endpoint vertical-control-endpoint-max">0</span>
        <div className="vertical-meter-track" aria-hidden="true">
          <div
            className="vertical-meter-fill master-loudness-fill"
            style={{
              height: `${fillPercent(scaleValue)}%`,
              background: meterColor(scaleValue)
            } as CSSProperties}
          />
        </div>
        <span className="vertical-control-endpoint vertical-control-endpoint-min">-60</span>
      </div>

      <div className="master-loudness-data">
        {snapshot.available ? (
          <dl aria-label="Master loudness readings">
            <div><dt>M</dt><dd>{format(snapshot.momentaryLufs, 'LUFS')}</dd></div>
            <div><dt>S</dt><dd>{format(snapshot.shortTermLufs, 'LUFS')}</dd></div>
            <div><dt>I</dt><dd>{format(snapshot.integratedLufs, 'LUFS')}</dd></div>
            <div><dt>TP</dt><dd>{format(snapshot.truePeakDbtp, 'dBTP')}</dd></div>
          </dl>
        ) : (
          <p className="master-loudness-fallback">
            RMS fallback <output>{snapshot.rmsDbfs.toFixed(1)} dBFS</output>
          </p>
        )}
        <button type="button" className="master-loudness-reset" onClick={onReset}>
          Reset loudness measurement
        </button>
      </div>
    </div>
  )
}
