import { VerticalFader } from './VerticalControls'
import MasterLoudnessMeter from './MasterLoudnessMeter'
import type { MasterMeterSnapshot } from '../engine/master-meter'
import {
  MAX_CLIP_EDGE_FADE_MS,
  MIN_CLIP_EDGE_FADE_MS,
  type ClipEdgeMicroFadeSettings
} from '../engine/clip-edge-fades'

interface MasterControlsMainProps {
  masterGain: number
  clipEdgeMicroFades: ClipEdgeMicroFadeSettings
  masterMeter: MasterMeterSnapshot
  onSetMasterGain: (value: number) => void
  onSetClipEdgeMicroFades: (settings: ClipEdgeMicroFadeSettings) => void
  onResetMasterMeter: () => void
}

export default function MasterControlsMain({
  masterGain,
  clipEdgeMicroFades,
  masterMeter,
  onSetMasterGain,
  onSetClipEdgeMicroFades,
  onResetMasterMeter
}: MasterControlsMainProps) {
  const setFadeDuration = (edge: 'fadeInMs' | 'fadeOutMs', value: number) => {
    if (!Number.isFinite(value)) return
    onSetClipEdgeMicroFades({
      ...clipEdgeMicroFades,
      [edge]: Math.max(MIN_CLIP_EDGE_FADE_MS, Math.min(MAX_CLIP_EDGE_FADE_MS, value))
    })
  }

  return (
    <div className="master-controls-main">
      <h2 className="tracker-zone-title">Master Controls</h2>
      <div className="master-controls-system">
        <section className="master-controls-module master-control-module">
          <header className="master-controls-head master-control-head">
            <span>Master Volume</span>
            <output className="master-controls-value">{Math.round(masterGain * 100)}%</output>
            <span>Output Level</span>
            <output className="master-controls-value">
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
        <section className="master-controls-module master-micro-fade-module">
          <header className="master-controls-head">
            <span>Clip Edge Fades</span>
            <label className="master-micro-fade-toggle">
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
          <div className="master-micro-fade-fields">
            <label>
              <span>Fade in</span>
              <span className="master-micro-fade-input">
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
              <span className="master-micro-fade-input">
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
          <p className="master-micro-fade-note">Applied only at boundaries next to silence.</p>
        </section>
      </div>
    </div>
  )
}
