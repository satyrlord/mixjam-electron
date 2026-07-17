import { useEffect, useState } from 'react'
import { VerticalFader } from './VerticalControls'
import MasterLoudnessMeter from './MasterLoudnessMeter'
import type { MasterMeterSnapshot } from '../engine/master-meter'
import {
  MAX_CLIP_EDGE_FADE_MS,
  MIN_CLIP_EDGE_FADE_MS,
  type ClipEdgeMicroFadeSettings
} from '../engine/clip-edge-fades'

interface SongControlsMainProps {
  bpm: number
  masterGain: number
  clipEdgeMicroFades: ClipEdgeMicroFadeSettings
  masterMeter: MasterMeterSnapshot
  onSetBpm: (bpm: number) => void
  onSetMasterGain: (value: number) => void
  onSetClipEdgeMicroFades: (settings: ClipEdgeMicroFadeSettings) => void
  onResetMasterMeter: () => void
}

export default function SongControlsMain({
  bpm,
  masterGain,
  clipEdgeMicroFades,
  masterMeter,
  onSetBpm,
  onSetMasterGain,
  onSetClipEdgeMicroFades,
  onResetMasterMeter
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

  const setFadeDuration = (edge: 'fadeInMs' | 'fadeOutMs', value: number) => {
    if (!Number.isFinite(value)) return
    onSetClipEdgeMicroFades({
      ...clipEdgeMicroFades,
      [edge]: Math.max(MIN_CLIP_EDGE_FADE_MS, Math.min(MAX_CLIP_EDGE_FADE_MS, value))
    })
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
            tooltip="BPM (50-200)"
            wheelStep
            onChange={onSetBpm}
          />
        </section>
        <section className="song-control-module master-control-module">
          <header className="song-control-head master-control-head">
            <span>Master Volume</span>
            <output className="song-control-value">{Math.round(masterGain * 100)}%</output>
            <span>Output Level</span>
            <output className="song-control-value">
              {masterMeter.available && masterMeter.momentaryLufs !== null
                ? `${masterMeter.momentaryLufs.toFixed(1)} LUFS`
                : `${masterMeter.rmsDbfs.toFixed(1)} dBFS`}
            </output>
          </header>
          <div className="master-control-body">
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
            <MasterLoudnessMeter snapshot={masterMeter} onReset={onResetMasterMeter} />
          </div>
        </section>
        <section className="song-control-module song-micro-fade-module">
          <header className="song-control-head">
            <span>Clip Edge Fades</span>
            <label className="song-micro-fade-toggle">
              <input
                type="checkbox"
                aria-label="Enable automatic clip-edge fades"
                checked={clipEdgeMicroFades.enabled}
                onChange={(event) => onSetClipEdgeMicroFades({
                  ...clipEdgeMicroFades,
                  enabled: event.currentTarget.checked
                })}
              />
              <span>{clipEdgeMicroFades.enabled ? 'On' : 'Off'}</span>
            </label>
          </header>
          <div className="song-micro-fade-fields">
            <label>
              <span>Fade in</span>
              <span className="song-micro-fade-input">
                <input
                  type="number"
                  aria-label="Automatic clip fade-in milliseconds"
                  min={MIN_CLIP_EDGE_FADE_MS}
                  max={MAX_CLIP_EDGE_FADE_MS}
                  step={0.1}
                  value={clipEdgeMicroFades.fadeInMs}
                  disabled={!clipEdgeMicroFades.enabled}
                  onChange={(event) => setFadeDuration('fadeInMs', event.currentTarget.valueAsNumber)}
                />
                <span>ms</span>
              </span>
            </label>
            <label>
              <span>Fade out</span>
              <span className="song-micro-fade-input">
                <input
                  type="number"
                  aria-label="Automatic clip fade-out milliseconds"
                  min={MIN_CLIP_EDGE_FADE_MS}
                  max={MAX_CLIP_EDGE_FADE_MS}
                  step={0.1}
                  value={clipEdgeMicroFades.fadeOutMs}
                  disabled={!clipEdgeMicroFades.enabled}
                  onChange={(event) => setFadeDuration('fadeOutMs', event.currentTarget.valueAsNumber)}
                />
                <span>ms</span>
              </span>
            </label>
          </div>
          <p className="song-micro-fade-note">Applied only at boundaries next to silence.</p>
        </section>
      </div>
    </div>
  )
}
