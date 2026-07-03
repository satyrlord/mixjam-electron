import { meterFillPct } from '../lib/sample-utils'

interface SongControlsRailProps {
  masterGain: number
  masterLevelDb: number
  onSetMasterGain: (value: number) => void
}

export default function SongControlsRail({
  masterGain,
  masterLevelDb,
  onSetMasterGain
}: SongControlsRailProps) {
  return (
    <aside className="tracker-zone song-controls-rail">
      <h2 className="tracker-zone-title">Song Controls</h2>
      <label className="song-control">
        <span className="song-control-head">
          Master Volume
          <span className="song-control-value">{Math.round(masterGain * 100)}%</span>
        </span>
        <input
          type="range"
          min="0"
          max="100"
          value={Math.round(masterGain * 100)}
          aria-label="Master Volume"
          onChange={(e) => onSetMasterGain(Number(e.currentTarget.value) / 100)}
        />
      </label>
      <div className="song-control">
        <span>dB Loudness</span>
        <div
          className="loudness-meter"
          role="meter"
          aria-label="Master loudness"
          aria-valuemin={-100}
          aria-valuemax={0}
          aria-valuenow={Math.round(masterLevelDb)}
        >
          <div
            className="loudness-meter-fill"
            style={{ width: `${meterFillPct(masterLevelDb)}%` }}
          />
        </div>
      </div>
    </aside>
  )
}
