import { useEffect, useState } from 'react'
import { VerticalFader, VerticalMeter } from './VerticalControls'

interface SongControlsMainProps {
  bpm: number
  masterGain: number
  masterLevelDb: number
  onSetBpm: (bpm: number) => void
  onSetMasterGain: (value: number) => void
}

export default function SongControlsMain({
  bpm,
  masterGain,
  masterLevelDb,
  onSetBpm,
  onSetMasterGain
}: SongControlsMainProps) {
  const [bpmDraft, setBpmDraft] = useState(String(bpm))

  useEffect(() => setBpmDraft(String(bpm)), [bpm])

  const commitBpm = () => {
    const parsed = Number(bpmDraft)
    if (Number.isInteger(parsed) && parsed >= 50 && parsed <= 200) {
      onSetBpm(parsed)
    } else {
      setBpmDraft(String(bpm))
    }
  }

  return (
    <div className="song-controls-main">
      <h2 className="tracker-zone-title">Song Controls</h2>
      <div className="song-control-system">
        <section className="song-control-module">
          <header className="song-control-head">
            <span>BPM</span>
            <label className="song-control-value song-bpm-value">
              <input
                type="text"
                inputMode="numeric"
                aria-label="BPM value"
                value={bpmDraft}
                onChange={(event) => setBpmDraft(event.currentTarget.value)}
                onBlur={commitBpm}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                  if (event.key === 'Escape') setBpmDraft(String(bpm))
                }}
              />
              <span>BPM</span>
            </label>
          </header>
          <VerticalFader
            ariaLabel="BPM"
            value={bpm}
            min={50}
            max={200}
            step={1}
            valueText={`${bpm} BPM`}
            maxLabel="200"
            minLabel="50"
            title="BPM (50-200)"
            wheelStep
            onChange={onSetBpm}
          />
        </section>
        <section className="song-control-module">
          <header className="song-control-head">
            <span>Master Volume</span>
            <output className="song-control-value">{Math.round(masterGain * 100)}%</output>
          </header>
          <VerticalFader
            ariaLabel="Master Volume"
            value={Math.round(masterGain * 100)}
            min={0}
            max={100}
            step={1}
            valueText={`${Math.round(masterGain * 100)}%`}
            unityValue={100}
            maxLabel="100%"
            minLabel="0%"
            onChange={(value) => onSetMasterGain(value / 100)}
          />
        </section>
        <section className="song-control-module song-meter-module">
          <header className="song-control-head">
            <span>Output Level</span>
            <output className="song-control-value">{Math.round(masterLevelDb)} dB</output>
          </header>
          <VerticalMeter
            ariaLabel="Output Level"
            valueDb={masterLevelDb}
            maxLabel="0 dB"
            minLabel="-60"
          />
        </section>
      </div>
    </div>
  )
}
