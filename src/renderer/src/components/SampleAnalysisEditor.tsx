import { useState } from 'react'
import {
  SAMPLE_TYPE_VALUES,
  type SampleAnalysisPatch,
  type SampleListItem
} from '../../../shared/backend-api'

interface SampleAnalysisEditorProps {
  sample: SampleListItem
  x: number
  y: number
  onClose: () => void
  onUpdate: (sample: SampleListItem, patch: SampleAnalysisPatch) => Promise<void>
  onReanalyze: (sample: SampleListItem) => Promise<void>
}

export default function SampleAnalysisEditor({
  sample,
  x,
  y,
  onClose,
  onUpdate,
  onReanalyze
}: SampleAnalysisEditorProps) {
  const initialBpm = sample.bpm?.toString() ?? ''
  const initialKey = sample.musicalKey ?? ''
  const initialType = sample.sampleType ?? ''
  const [bpm, setBpm] = useState(initialBpm)
  const [musicalKey, setMusicalKey] = useState(initialKey)
  const [sampleType, setSampleType] = useState(initialType)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (action: () => Promise<void>, close = false): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await action()
      if (close) onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Analysis update failed')
    } finally {
      setBusy(false)
    }
  }

  const save = (): void => {
    const patch: SampleAnalysisPatch = {}
    const nextBpm = bpm === '' ? null : Number(bpm)
    if (nextBpm !== sample.bpm) patch.bpm = nextBpm
    if (musicalKey !== initialKey) patch.musicalKey = musicalKey === '' ? null : musicalKey
    if (sampleType !== initialType) {
      patch.sampleType = sampleType === '' ? null : sampleType as SampleAnalysisPatch['sampleType']
    }
    if (Object.keys(patch).length === 0) {
      onClose()
      return
    }
    void run(() => onUpdate(sample, patch), true)
  }

  return (
    <div
      className="analysis-editor"
      role="dialog"
      aria-label={`Analysis for ${sample.name}`}
      style={{ left: x, top: y }}
      onClick={(event) => event.stopPropagation()}
    >
      <strong>{sample.name}</strong>
      <label>
        BPM <small>{sample.bpmSource ?? 'unset'}</small>
        <input
          type="number"
          min={20}
          max={400}
          step="0.1"
          value={bpm}
          onChange={(event) => setBpm(event.currentTarget.value)}
          aria-label="Sample BPM"
        />
      </label>
      <label>
        Key <small>{sample.musicalKeySource ?? 'unset'}</small>
        <input
          value={musicalKey}
          onChange={(event) => setMusicalKey(event.currentTarget.value)}
          placeholder="Am"
          aria-label="Sample musical key"
        />
      </label>
      <label>
        Type <small>{sample.sampleTypeSource ?? 'unset'}</small>
        <select
          value={sampleType}
          onChange={(event) => setSampleType(event.currentTarget.value)}
          aria-label="Sample type"
        >
          <option value="">Unspecified</option>
          {SAMPLE_TYPE_VALUES.map((value) => <option key={value}>{value}</option>)}
        </select>
      </label>
      {error && <span className="analysis-editor-error">{error}</span>}
      <div className="analysis-editor-actions">
        <button type="button" disabled={busy} onClick={save}>Save overrides</button>
        <button
          type="button"
          disabled={busy}
          title="Analyze fields that are currently blank"
          onClick={() => void run(() => onReanalyze(sample), true)}
        >
          Analyze blank fields
        </button>
        <button type="button" disabled={busy} onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}
