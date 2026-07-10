import { meterFillPct } from '../lib/sample-utils'

interface SongControlsMainProps {
  bpm: number
  masterGain: number
  masterLevelDb: number
  onSetBpm: (bpm: number) => void
  onSetMasterGain: (value: number) => void
}

/** Fixed-width master section inside SongControlsRail (168px). */
export default function SongControlsMain({
  bpm,
  masterGain,
  masterLevelDb,
  onSetBpm,
  onSetMasterGain
}: SongControlsMainProps) {
  return (
    <div className="song-controls-main">
      <h2 className="tracker-zone-title">Song Controls</h2>
      <label className="song-control">
        <span className="song-control-head">
          BPM
          <span className="song-control-value">{bpm} BPM</span>
        </span>
        <input
          type="range"
          min="50"
          max="200"
          step="1"
          value={bpm}
          aria-label="BPM"
          title="BPM (50-200)"
          onChange={(e) => onSetBpm(Number(e.currentTarget.value))}
        />
      </label>
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
        <span>Output Level</span>
        <div
          className="loudness-meter"
          role="meter"
          aria-label="Output Level"
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
    </div>
  )
}
