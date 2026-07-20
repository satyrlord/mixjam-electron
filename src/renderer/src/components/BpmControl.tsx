import { useEffect, useState } from 'react'
import { LinearSlider } from './ui/Slider'

interface BpmControlProps {
  bpm: number
  onSetBpm: (bpm: number) => void
}

export default function BpmControl({ bpm, onSetBpm }: BpmControlProps) {
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
    <div className="bpm-control">
      <label className="bpm-control-value">
        <span className="bpm-control-label">BPM</span>
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
      </label>
      <LinearSlider
        className="bpm-control-slider"
        orientation="horizontal"
        value={bpm}
        min={50}
        max={200}
        step={1}
        onValueChange={onSetBpm}
        ariaLabel="BPM"
        ariaValueText={`${bpm} BPM`}
        tooltip="BPM (50-200)"
      />
    </div>
  )
}
