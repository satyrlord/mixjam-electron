import { useEffect, useState } from 'react'
import type { MixJamGeneratorParameters, MixJamGeneratorProgress, MixJamGeneratorReadiness } from '../../../shared/backend-api'
import {
  SAFE_SEED,
  MIXJAM_GENERATOR_PROFILE_IDS,
  MIXJAM_GENERATOR_PROFILE_LABELS,
  MIXJAM_GENERATOR_BPM_MODES,
  MIXJAM_GENERATOR_BPM_MODE_LABELS,
  MIXJAM_GENERATOR_INTENSITIES,
  MIXJAM_GENERATOR_INTENSITY_LABELS
} from '../../../shared/backend-api'
import { DialogClose, DialogContent, DialogRoot, DialogTitle } from './ui/Dialog'

export interface GeneratorResult {
  path: string
  summary: string
}

interface MixJamGeneratorDialogProps {
  open: boolean
  readiness: MixJamGeneratorReadiness | null
  initialParameters?: MixJamGeneratorParameters
  generating: boolean
  saving?: boolean
  progress?: MixJamGeneratorProgress | null
  result: GeneratorResult | null
  error: string | null
  onClose: () => void
  onGenerate: (parameters: MixJamGeneratorParameters) => void
  onOpenResult: (path: string) => void
}

function newSeed(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
}

const DEFAULTS: MixJamGeneratorParameters = {
  profileId: 'techno',
  bpmMode: 'follow-detected',
  bpm: 140,
  intensity: 'medium',
  durationSeconds: 180,
  seed: 'mixjam'
}

export default function MixJamGeneratorDialog({
  open,
  readiness,
  initialParameters,
  generating,
  saving = false,
  progress = null,
  result,
  error,
  onClose,
  onGenerate,
  onOpenResult
}: MixJamGeneratorDialogProps) {
  const [parameters, setParameters] = useState<MixJamGeneratorParameters>(initialParameters ?? DEFAULTS)

  useEffect(() => {
    if (open) setParameters(initialParameters ?? { ...DEFAULTS, seed: newSeed() })
  }, [initialParameters, open])

  useEffect(() => {
    if (!open || readiness?.status !== 'ready') return
    setParameters((current) => {
      const selectionStillExists = readiness.tempoClusters.some(
        (cluster) => cluster.relpathPrefix === current.tempoClusterPrefix
      )
      if (selectionStillExists) return current
      const nextPrefix = readiness.analysisState === 'resolved'
        ? readiness.tempoClusters[0]?.relpathPrefix
        : undefined
      return current.tempoClusterPrefix === nextPrefix
        ? current
        : { ...current, tempoClusterPrefix: nextPrefix }
    })
  }, [open, readiness])

  const ready = readiness?.status === 'ready'
  const seedValid = SAFE_SEED.test(parameters.seed)
  const selectedCluster = ready
    ? readiness.tempoClusters.find((cluster) => cluster.relpathPrefix === parameters.tempoClusterPrefix)
    : undefined
  const groupSelectionMissing = ready && readiness.analysisState === 'mixed' && !selectedCluster
  const detectedTempoMissing = ready && parameters.bpmMode === 'follow-detected' &&
    (selectedCluster?.bpm ?? readiness.detectedBpm) === null
  const canGenerate = ready && seedValid && !groupSelectionMissing && !detectedTempoMissing

  return (
    <DialogRoot open={open} onOpenChange={(next) => { if (!next && !saving) onClose() }}>
      <DialogContent
        className="generator-dialog"
        aria-describedby="generator-description"
        onOverlayClick={() => { if (!saving) onClose() }}
      >
        <header className="generator-dialog-head">
          <div>
            <DialogTitle asChild><h2>Generate MixJam</h2></DialogTitle>
            <p id="generator-description">Create a saved project from your current sample library.</p>
          </div>
          <DialogClose asChild>
            <button type="button" className="generator-close" aria-label="Close" disabled={saving}>×</button>
          </DialogClose>
        </header>

        <ol className="generator-steps" aria-label="Generator steps">
          <li aria-current={!generating && !result ? 'step' : undefined}>Parameters</li>
          <li aria-current={generating || result ? 'step' : undefined}>Generate</li>
        </ol>

        {result ? (
          <section className="generator-complete" aria-live="polite">
            <h3>MixJam created</h3>
            <p>{result.summary}</p>
            <p className="generator-path">{result.path}</p>
            <div className="generator-actions">
              <button type="button" className="btn-primary" onClick={() => onOpenResult(result.path)}>Open in Player</button>
              <button type="button" className="link-secondary" onClick={onClose}>Done</button>
            </div>
          </section>
        ) : generating ? (
          <section className="generator-progress" aria-live="polite">
            <h3>{saving ? 'Saving project' : progress?.phase === 'shortlisting' ? 'Shortlisting samples' : progress?.phase === 'analyzing' ? 'Analyzing samples' : 'Arranging song'}</h3>
            <p>{saving
              ? 'The project is being committed to your User Folder.'
              : progress && progress.total > 0
                ? `${progress.completed} of ${progress.total}`
                : 'Preparing the musical plan.'}</p>
            <div className="generator-actions">
              <button type="button" className="link-secondary" onClick={onClose} disabled={saving}>
                {saving ? 'Saving…' : 'Cancel generation'}
              </button>
            </div>
          </section>
        ) : (
          <form onSubmit={(event) => { event.preventDefault(); if (canGenerate) onGenerate(parameters) }}>
            <div className="generator-fields">
              <label>Profile
                <select value={parameters.profileId} onChange={(event) => setParameters({ ...parameters, profileId: event.target.value as MixJamGeneratorParameters['profileId'] })}>
                  {MIXJAM_GENERATOR_PROFILE_IDS.map((id) => (
                    <option key={id} value={id}>{MIXJAM_GENERATOR_PROFILE_LABELS[id]}</option>
                  ))}
                </select>
              </label>
              {ready && readiness.analysisState === 'mixed' && (
                <label>Analyzer group
                  <select
                    aria-label="Analyzer group"
                    value={parameters.tempoClusterPrefix ?? '__unselected__'}
                    onChange={(event) => setParameters({
                      ...parameters,
                      tempoClusterPrefix: event.target.value === '__unselected__'
                        ? undefined
                        : event.target.value
                    })}
                  >
                    <option value="__unselected__">Select a sample group</option>
                    {readiness.tempoClusters.map((cluster) => (
                      <option key={cluster.relpathPrefix} value={cluster.relpathPrefix}>
                        {cluster.relpathPrefix || 'Entire Sample Folder'} — {cluster.bpm} BPM
                        {cluster.musicalKey ? `, ${cluster.musicalKey}` : ''} ({cluster.sampleCount} samples,
                        {' '}{Math.round(cluster.confidence * 100)}% confidence)
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>BPM source
                <select value={parameters.bpmMode} onChange={(event) => setParameters({ ...parameters, bpmMode: event.target.value as MixJamGeneratorParameters['bpmMode'] })}>
                  {MIXJAM_GENERATOR_BPM_MODES.map((mode) => (
                    <option key={mode} value={mode}>{MIXJAM_GENERATOR_BPM_MODE_LABELS[mode]}</option>
                  ))}
                </select>
              </label>
              {parameters.bpmMode === 'fixed' && (
                <label>BPM
                  <input type="number" min={60} max={180} step={1} value={parameters.bpm ?? 140} onChange={(event) => setParameters({ ...parameters, bpm: Number(event.target.value) })} />
                </label>
              )}
              <label>Intensity
                <select value={parameters.intensity} onChange={(event) => setParameters({ ...parameters, intensity: event.target.value as MixJamGeneratorParameters['intensity'] })}>
                  {MIXJAM_GENERATOR_INTENSITIES.map((intensity) => (
                    <option key={intensity} value={intensity}>{MIXJAM_GENERATOR_INTENSITY_LABELS[intensity]}</option>
                  ))}
                </select>
              </label>
              <label>Duration (seconds)
                <input type="number" min={30} max={600} step={1} value={parameters.durationSeconds} onChange={(event) => setParameters({ ...parameters, durationSeconds: Number(event.target.value) })} />
              </label>
              <label>Seed
                <span className="generator-seed-row">
                  <input pattern="[A-Za-z0-9_-]{1,64}" maxLength={64} value={parameters.seed} onChange={(event) => setParameters({ ...parameters, seed: event.target.value })} />
                  <button type="button" onClick={() => setParameters({ ...parameters, seed: newSeed() })}>New</button>
                </span>
              </label>
            </div>
            <p className={`generator-readiness generator-readiness-${readiness?.status ?? 'checking'}`}>
              {readiness === null ? 'Checking library…' : readiness.status === 'ready'
                ? readiness.analysisState === 'mixed'
                  ? `${readiness.eligibleSamples} samples ready in ${readiness.tempoClusters.length} analyzer groups. Select one group to generate from.`
                  : readiness.detectedBpm === null
                    ? `${readiness.eligibleSamples} samples ready. No confident tempo was found; choose Fixed BPM.`
                    : `${readiness.eligibleSamples} samples ready. Analyzer tempo: ${readiness.detectedBpm} BPM.`
                : readiness.message}
            </p>
            {error && <p className="generator-error" role="alert">{error}</p>}
            <div className="generator-actions">
              <button type="submit" className="btn-primary" disabled={!canGenerate || generating}>
                {generating ? 'Generating…' : 'Generate and Save'}
              </button>
              <button type="button" className="link-secondary" onClick={onClose}>Cancel</button>
            </div>
          </form>
        )}
      </DialogContent>
    </DialogRoot>
  )
}
