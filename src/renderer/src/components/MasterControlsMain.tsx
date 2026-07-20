import { VerticalFader } from './VerticalControls'
import MasterLoudnessMeter from './MasterLoudnessMeter'
import type { MasterMeterSnapshot } from '../engine/master-meter'

interface MasterControlsMainProps {
  masterGain: number
  masterMeter: MasterMeterSnapshot
  onSetMasterGain: (value: number) => void
  onResetMasterMeter: () => void
}

export default function MasterControlsMain({
  masterGain,
  masterMeter,
  onSetMasterGain,
  onResetMasterMeter
}: MasterControlsMainProps) {
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
      </div>
    </div>
  )
}
