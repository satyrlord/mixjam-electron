import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import {
  applyAetherformReverbPreset,
  AETHERFORM_REVERB_PRESET_NAMES,
  type AetherformReverbModule,
  type AetherformReverbPresetName
} from '../engine/return-effects'
import {
  AETHERFORM_SHIMMER_INTERVALS,
  type AetherformCharacter,
  type AetherformShimmerInterval,
  type AetherformSpaceModel
} from '../engine/aetherform-reverb-types'
import { clamp } from '../lib/sample-utils'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { BlockingDialogContent, DialogRoot, DialogTitle } from './ui/Dialog'
import {
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuRoot,
  DropdownMenuTrigger
} from './ui/DropdownMenu'
import { LinearSlider } from './ui/Slider'
import { AETHERFORM_REVERB_RANGES } from '../engine/return-param-ranges'
import FxKnob, { type FxKnobSpec } from './FxKnob'
import { useReturnEffectEditorSession } from '../hooks/useReturnEffectEditorSession'

/**
 * The Aetherform Reverb editor. Renders the module's real state; every control
 * drives the DSP through `onPreview` (live, non-undoable) and `onSave`
 * (committed). Mix is the FX-return level, shared with the FX-slot knob — it
 * is NOT a reverb-module field. Clear Tail is a momentary command routed
 * through `onClearTail`; it never touches parameter state.
 */

// ---------------------------------------------------------------------------
// Parameter descriptors
// ---------------------------------------------------------------------------

type KnobKey =
  | 'preDelayMs' | 'decaySeconds' | 'sizePercent' | 'mix' | 'widthPercent'
  | 'lowCutHz' | 'highCutHz' | 'diffusionPercent' | 'densityPercent'
  | 'modRateHz' | 'modDepthPercent' | 'shimmerAmountPercent' | 'drivePercent'
  | 'duckAmountPercent' | 'duckReleaseMs' | 'outputDb'


const formatMs = (value: number): string =>
  value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`
const formatSeconds = (value: number): string =>
  `${value < 10 ? value.toFixed(1) : Math.round(value).toString()} s`
const formatPercent = (value: number): string => `${Math.round(value)}%`
const formatHz = (value: number): string =>
  value >= 1000 ? `${(value / 1000).toFixed(1)} kHz` : `${Math.round(value)} Hz`
const formatRate = (value: number): string => `${value.toFixed(2)} Hz`
const formatDb = (value: number): string => `${value > 0 ? '+' : ''}${value.toFixed(1)} dB`

const KNOBS: Record<KnobKey, FxKnobSpec> = {
  preDelayMs: { ...AETHERFORM_REVERB_RANGES.preDelayMs, step: 1, defaultValue: 24, format: formatMs },
  decaySeconds: { ...AETHERFORM_REVERB_RANGES.decaySeconds, step: 0.1, curve: 'log', defaultValue: 2.8, format: formatSeconds, tone: 'warm' },
  sizePercent: { ...AETHERFORM_REVERB_RANGES.sizePercent, step: 1, defaultValue: 68, format: formatPercent, tone: 'cool' },
  mix: { min: 0, max: 100, step: 1, defaultValue: 88, format: formatPercent, tone: 'warm' },
  widthPercent: { ...AETHERFORM_REVERB_RANGES.widthPercent, step: 1, defaultValue: 148, format: formatPercent, tone: 'cool' },
  lowCutHz: { ...AETHERFORM_REVERB_RANGES.lowCutHz, step: 1, curve: 'log', defaultValue: 180, format: formatHz },
  highCutHz: { ...AETHERFORM_REVERB_RANGES.highCutHz, step: 10, curve: 'log', defaultValue: 8600, format: formatHz, tone: 'cool' },
  diffusionPercent: { ...AETHERFORM_REVERB_RANGES.diffusionPercent, step: 1, defaultValue: 78, format: formatPercent },
  densityPercent: { ...AETHERFORM_REVERB_RANGES.densityPercent, step: 1, defaultValue: 84, format: formatPercent, tone: 'cool' },
  modRateHz: { ...AETHERFORM_REVERB_RANGES.modRateHz, step: 0.01, curve: 'log', defaultValue: 0.32, format: formatRate, tone: 'cool' },
  modDepthPercent: { ...AETHERFORM_REVERB_RANGES.modDepthPercent, step: 1, defaultValue: 18, format: formatPercent, tone: 'cool' },
  shimmerAmountPercent: { ...AETHERFORM_REVERB_RANGES.shimmerAmountPercent, step: 1, defaultValue: 24, format: formatPercent, tone: 'shimmer' },
  drivePercent: { ...AETHERFORM_REVERB_RANGES.drivePercent, step: 1, defaultValue: 0, format: formatPercent, tone: 'warm' },
  duckAmountPercent: { ...AETHERFORM_REVERB_RANGES.duckAmountPercent, step: 1, defaultValue: 28, format: formatPercent, tone: 'warm' },
  duckReleaseMs: { ...AETHERFORM_REVERB_RANGES.duckReleaseMs, step: 10, curve: 'log', defaultValue: 720, format: formatMs },
  outputDb: { ...AETHERFORM_REVERB_RANGES.outputDb, step: 0.1, defaultValue: -1.5, format: formatDb }
}

const CHARACTER_COPY: Record<AetherformCharacter, string> = {
  natural: 'Neutral reflections with a balanced, controlled decay.',
  vintage: 'Rounded reflections with a gently darkened tail.',
  bloom: 'Soft onset with a wide tail that opens as it decays.'
}

const SPACE_LABEL: Record<AetherformSpaceModel, string> = {
  room: 'Room',
  hall: 'Hall',
  plate: 'Plate',
  chamber: 'Chamber'
}

const INTERVAL_LABEL: Record<AetherformShimmerInterval, string> = {
  7: '+7 Fifth',
  12: '+12 Octave',
  19: '+19 Oct + fifth',
  24: '+24 Two oct'
}

// Preset Mix percentages, applied to the shared FX-return level.
const PRESET_MIX: Record<AetherformReverbPresetName, number> = {
  'Warm Chamber': 88,
  'Vocal Plate': 82,
  'Dark Hall': 92,
  'Small Room': 74,
  'Ambient Bloom': 96,
  'Shimmer Cloud': 98,
  'Endless Cathedral': 100
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

interface AetherformReverbModalProps {
  value: AetherformReverbModule
  powered: boolean
  /** Shared Mix parameter (0..1 = FX-return level). */
  mix: number
  slot: number
  onCancel: () => void
  onSave: (value: AetherformReverbModule, powered: boolean, mix: number) => void
  onPreview?: (value: AetherformReverbModule, powered: boolean, mix: number) => void
  /** Momentary command: flush the live reverb's audio history. */
  onClearTail?: () => void
  onRestoreFocus?: () => void
}

const TITLE_ID = 'aetherform-reverb-title'
const CLEAR_FLASH_MS = 360

export default function AetherformReverbModal({
  value,
  powered,
  mix: mixProp,
  slot,
  onCancel,
  onSave,
  onPreview,
  onClearTail,
  onRestoreFocus
}: AetherformReverbModalProps) {
  const {
    draft,
    powerOn,
    mixPercent,
    preset,
    setField,
    setMixPercent,
    applyPreset
  } = useReturnEffectEditorSession({
    value,
    powered,
    mix: mixProp,
    detectPreset,
    applyPreset: applyAetherformReverbPreset,
    presetMix: PRESET_MIX,
    onPreview
  })
  const [clearing, setClearing] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const clearTimerRef = useRef<number | null>(null)
  const reducedMotion = usePrefersReducedMotion()

  useEffect(() => () => {
    if (clearTimerRef.current !== null) window.clearTimeout(clearTimerRef.current)
  }, [])

  const setKnob = (key: KnobKey, next: number) => {
    if (key === 'mix') { setMixPercent(next); return }
    setField(key, next)
  }

  const knobValue = (key: KnobKey): number =>
    key === 'mix' ? mixPercent : (draft[key as keyof AetherformReverbModule] as number)

  // Clear Tail is a momentary command: flush the live DSP, flash the button and
  // field, and leave every parameter (and the preset selector) untouched.
  const handleClearTail = () => {
    onClearTail?.()
    setClearing(true)
    if (clearTimerRef.current !== null) window.clearTimeout(clearTimerRef.current)
    clearTimerRef.current = window.setTimeout(() => {
      setClearing(false)
      clearTimerRef.current = null
    }, CLEAR_FLASH_MS)
  }

  const handleModalKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
    }
  }

  const characterLabel = draft.character.charAt(0).toUpperCase() + draft.character.slice(1)
  const spaceLabel = SPACE_LABEL[draft.spaceModel]
  const stateWord = draft.bypass ? 'Bypassed' : 'Active'
  const stateText = `${stateWord} / ${spaceLabel} / ${characterLabel}${draft.shimmerEnabled ? ` / Shimmer +${draft.shimmerIntervalSemitones}` : ''}`
  const lateBalanceText = draft.lateBalancePercent === 50
    ? 'Balanced'
    : draft.lateBalancePercent > 50
      ? `${draft.lateBalancePercent}% Late`
      : `${100 - draft.lateBalancePercent}% Early`

  return (
    <DialogRoot open modal>
      <BlockingDialogContent
        ref={dialogRef}
        className="af-dialog"
        restoreFocus={onRestoreFocus}
        aria-labelledby={TITLE_ID}
        data-space={draft.spaceModel}
        data-character={draft.character}
        data-shimmer={draft.shimmerEnabled && draft.shimmerAmountPercent > 0 ? '1' : undefined}
        data-bypassed={draft.bypass ? '1' : undefined}
        data-clearing={clearing ? '1' : undefined}
        data-reduced-motion={reducedMotion ? '1' : undefined}
        onKeyDown={handleModalKeyDown}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          dialogRef.current?.querySelector<HTMLButtonElement>('.af-bypass')?.focus()
        }}
        tabIndex={-1}
      >
        <div className="af-module">
          <header className="af-header">
            <div className="af-brand">
              <span className="af-mark" aria-hidden="true">RV</span>
              <div className="af-title-block">
                <span className="af-kicker">{`FX Return ${String(slot).padStart(2, '0')}`}</span>
                <DialogTitle asChild><h1 id={TITLE_ID} className="af-title">Aetherform Reverb</h1></DialogTitle>
              </div>
            </div>
            <div className="af-header-actions">
              <button
                type="button"
                className="af-bypass"
                aria-pressed={draft.bypass}
                onClick={() => setField('bypass', !draft.bypass)}
              >
                {draft.bypass ? 'Bypassed' : 'Bypass'}
              </button>
              <div className="af-preset-field">
                <span aria-hidden="true">Preset</span>
                <DropdownMenuRoot>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="af-preset-trigger" aria-label="Preset">
                      {preset}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="af-preset-menu" align="end">
                    {/* Presets are a single-choice set, so the items carry the
                        radio role that actually supports a checked state. */}
                    <DropdownMenuRadioGroup
                      value={preset}
                      onValueChange={(name) => applyPreset(name as AetherformReverbPresetName)}
                    >
                      {AETHERFORM_REVERB_PRESET_NAMES.map((name) => (
                        <DropdownMenuRadioItem key={name} value={name}>
                          {name}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenuRoot>
              </div>
              <button
                type="button"
                className="af-close"
                aria-label="Close Aetherform Reverb editor"
                onClick={() => onSave(draft, powerOn, mixPercent / 100)}
              />
            </div>
          </header>

          <div className="af-body">
            <Visualizer draft={draft} clearing={clearing} reducedMotion={reducedMotion} />

            <div className="af-grid">
              <section className="af-card af-card-space" aria-label="Space">
                <div className="af-card-head">
                  <h2>Space</h2>
                  <label className="af-model-field">
                    <span>Model</span>
                    <select
                      className="af-model-select"
                      value={draft.spaceModel}
                      aria-label="Reverb space model"
                      onChange={(e) => setField('spaceModel', e.target.value as AetherformSpaceModel)}
                    >
                      {(['room', 'hall', 'plate', 'chamber'] as const).map((model) => (
                        <option key={model} value={model}>{SPACE_LABEL[model]}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="af-knob-row af-knob-row-3">
                  <FxKnob classPrefix="af" id="af-preDelayMs" spec={KNOBS.preDelayMs} label="Pre-delay"
                    value={knobValue('preDelayMs')} onChange={(v) => setKnob('preDelayMs', v)} />
                  <FxKnob classPrefix="af" id="af-decaySeconds" spec={KNOBS.decaySeconds} label="Decay"
                    value={knobValue('decaySeconds')} onChange={(v) => setKnob('decaySeconds', v)} />
                  <FxKnob classPrefix="af" id="af-sizePercent" spec={KNOBS.sizePercent} label="Size"
                    value={knobValue('sizePercent')} onChange={(v) => setKnob('sizePercent', v)} />
                </div>
                <div className="af-space-foot">
                  <span className="af-character-desc">{CHARACTER_COPY[draft.character]}</span>
                  <div className="af-segmented" role="group" aria-label="Reverb tail character">
                    {(['natural', 'vintage', 'bloom'] as const).map((char) => (
                      <button
                        key={char}
                        type="button"
                        aria-pressed={draft.character === char}
                        onClick={() => setField('character', char)}
                      >
                        {char.charAt(0).toUpperCase() + char.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section className="af-card" aria-label="Image">
                <div className="af-card-head"><h2>Image</h2></div>
                <div className="af-knob-row">
                  <FxKnob classPrefix="af" id="af-mix" spec={KNOBS.mix} label="Mix"
                    value={knobValue('mix')} onChange={(v) => setKnob('mix', v)} />
                  <FxKnob classPrefix="af" id="af-widthPercent" spec={KNOBS.widthPercent} label="Width"
                    value={knobValue('widthPercent')} onChange={(v) => setKnob('widthPercent', v)} />
                </div>
                <div className="af-range-field">
                  <span aria-hidden="true">Early / late</span>
                  <LinearSlider
                    className="af-balance-slider"
                    value={draft.lateBalancePercent}
                    min={0}
                    max={100}
                    step={1}
                    ariaLabel="Early and late reverb balance"
                    ariaValueText={lateBalanceText}
                    onValueChange={(next) => setField('lateBalancePercent', next)}
                  />
                  <output>{lateBalanceText}</output>
                </div>
              </section>

              <section className="af-card" aria-label="Tone">
                <div className="af-card-head"><h2>Tone</h2></div>
                <div className="af-knob-row af-knob-row-3">
                  <FxKnob classPrefix="af" id="af-lowCutHz" spec={KNOBS.lowCutHz} label="Low-cut"
                    value={knobValue('lowCutHz')} onChange={(v) => setKnob('lowCutHz', v)} />
                  <FxKnob classPrefix="af" id="af-highCutHz" spec={KNOBS.highCutHz} label="High-cut"
                    value={knobValue('highCutHz')} onChange={(v) => setKnob('highCutHz', v)} />
                  <FxKnob classPrefix="af" id="af-drivePercent" spec={KNOBS.drivePercent} label="Drive"
                    value={knobValue('drivePercent')} onChange={(v) => setKnob('drivePercent', v)} />
                </div>
                <p className="af-card-note">Drive saturates the input; damping accumulates through the tail</p>
              </section>

              <section className="af-card" aria-label="Texture">
                <div className="af-card-head"><h2>Texture</h2></div>
                <div className="af-knob-row">
                  <FxKnob classPrefix="af" id="af-diffusionPercent" spec={KNOBS.diffusionPercent} label="Diffusion"
                    value={knobValue('diffusionPercent')} onChange={(v) => setKnob('diffusionPercent', v)} />
                  <FxKnob classPrefix="af" id="af-densityPercent" spec={KNOBS.densityPercent} label="Density"
                    value={knobValue('densityPercent')} onChange={(v) => setKnob('densityPercent', v)} />
                </div>
                <button
                  type="button"
                  className="af-toggle"
                  aria-pressed={draft.earlyReflectionsEnabled}
                  onClick={() => setField('earlyReflectionsEnabled', !draft.earlyReflectionsEnabled)}
                >Early reflections</button>
              </section>

              <section className="af-card af-card-motion" aria-label="Motion">
                <div className="af-card-head"><h2>Motion</h2></div>
                <div className="af-knob-row af-knob-row-3 af-motion-knobs">
                  <FxKnob classPrefix="af" id="af-modRateHz" spec={KNOBS.modRateHz} label="Rate"
                    value={knobValue('modRateHz')} onChange={(v) => setKnob('modRateHz', v)} />
                  <FxKnob classPrefix="af" id="af-modDepthPercent" spec={KNOBS.modDepthPercent} label="Depth"
                    value={knobValue('modDepthPercent')} onChange={(v) => setKnob('modDepthPercent', v)} />
                  <FxKnob classPrefix="af" id="af-shimmerAmountPercent" spec={KNOBS.shimmerAmountPercent} label="Shimmer"
                    value={knobValue('shimmerAmountPercent')} onChange={(v) => setKnob('shimmerAmountPercent', v)} />
                </div>
                <div className="af-shimmer-foot">
                  <button
                    type="button"
                    className="af-toggle af-shimmer-toggle"
                    aria-pressed={draft.shimmerEnabled}
                    onClick={() => setField('shimmerEnabled', !draft.shimmerEnabled)}
                  >
                    Shimmer
                    <span className="af-toggle-pill" aria-hidden="true">
                      {draft.shimmerEnabled ? 'On' : 'Off'}
                    </span>
                  </button>
                  <label className="af-interval-field">
                    <span className="af-sr-only">Shimmer pitch interval</span>
                    <select
                      className="af-interval-select"
                      value={String(draft.shimmerIntervalSemitones)}
                      aria-label="Shimmer pitch interval"
                      onChange={(e) => setField('shimmerIntervalSemitones', Number(e.target.value) as AetherformShimmerInterval)}
                    >
                      {AETHERFORM_SHIMMER_INTERVALS.map((interval) => (
                        <option key={interval} value={String(interval)}>{INTERVAL_LABEL[interval]}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>

              <section className="af-card" aria-label="Ducking">
                <div className="af-card-head"><h2>Ducking</h2></div>
                <div className="af-knob-row">
                  <FxKnob classPrefix="af" id="af-duckAmountPercent" spec={KNOBS.duckAmountPercent} label="Amount"
                    value={knobValue('duckAmountPercent')} onChange={(v) => setKnob('duckAmountPercent', v)} />
                  <FxKnob classPrefix="af" id="af-duckReleaseMs" spec={KNOBS.duckReleaseMs} label="Release"
                    value={knobValue('duckReleaseMs')} onChange={(v) => setKnob('duckReleaseMs', v)} />
                </div>
              </section>

              <section className="af-card" aria-label="Output">
                <div className="af-card-head"><h2>Output</h2></div>
                <div className="af-output-layout">
                  <FxKnob classPrefix="af" id="af-outputDb" spec={KNOBS.outputDb} label="Level"
                    value={knobValue('outputDb')} onChange={(v) => setKnob('outputDb', v)} />
                  <div className="af-performance-stack">
                    <button
                      type="button"
                      className={`af-performance${clearing ? ' af-performance-flash' : ''}`}
                      onClick={handleClearTail}
                    >Clear tail<small>Flush reflections</small></button>
                  </div>
                </div>
              </section>
            </div>

            <footer className="af-foot">
              <span className="af-foot-help">
                Knobs: drag vertically / Shift for fine / double-click to reset
              </span>
              <span className="af-foot-state" aria-live="polite">{stateText}</span>
            </footer>
          </div>
        </div>
      </BlockingDialogContent>
    </DialogRoot>
  )
}

/** Detect whether the current module+mix exactly equals a built-in preset. */
function detectPreset(module: AetherformReverbModule, mix: number): AetherformReverbPresetName | 'Custom' {
  const mixPercent = Math.round(clamp(mix, 0, 1) * 100)
  for (const name of AETHERFORM_REVERB_PRESET_NAMES) {
    const preset = applyAetherformReverbPreset(module, name)
    const sameModule = (Object.keys(preset) as (keyof AetherformReverbModule)[]).every((key) => {
      if (key === 'id' || key === 'type') return true
      return preset[key] === module[key]
    })
    if (sameModule && PRESET_MIX[name] === mixPercent) return name
  }
  return 'Custom'
}

// ---------------------------------------------------------------------------
// Spatial decay visualizer (derived from parameter state, no audio telemetry)
// ---------------------------------------------------------------------------

/** Deterministic hash noise in [0, 1); stable per (index, salt). */
function pseudoRandom(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453
  return value - Math.floor(value)
}

interface FieldNode {
  x: number
  y: number
  size: number
  opacity: number
  early: boolean
  cool: boolean
  brightness: number
  duration: number
  delay: number
}

interface ShimmerNode {
  x: number
  y: number
  size: number
  opacity: number
  rise: number
  duration: number
  delay: number
}

interface FieldInputs {
  preDelayMs: number
  decaySeconds: number
  sizePercent: number
  widthPercent: number
  diffusionPercent: number
  densityPercent: number
  highCutHz: number
  modRateHz: number
  modDepthPercent: number
  lateBalancePercent: number
  earlyReflectionsEnabled: boolean
  character: AetherformCharacter
  shimmerEnabled: boolean
  shimmerAmountPercent: number
  shimmerIntervalSemitones: AetherformShimmerInterval
}

function buildField(inputs: FieldInputs): { early: FieldNode[]; late: FieldNode[]; shimmer: ShimmerNode[] } {
  const {
    preDelayMs, decaySeconds, sizePercent, widthPercent, diffusionPercent,
    densityPercent, highCutHz, modRateHz, modDepthPercent, lateBalancePercent,
    earlyReflectionsEnabled, character, shimmerEnabled,
    shimmerAmountPercent, shimmerIntervalSemitones
  } = inputs

  const preX = clamp(7 + (preDelayMs / 250) * 13, 7, 20)
  const tailEnd = clamp(50 + Math.sqrt(decaySeconds / 30) * 46, 50, 96)
  const spread = clamp(13 + (widthPercent / 200) * 31 + (sizePercent / 100) * 5, 16, 49)
  const earlyWeight = clamp((100 - lateBalancePercent) / 50, 0.2, 1.55)
  const lateWeight = clamp(lateBalancePercent / 50, 0.2, 1.85)
  const dampingBrightness = clamp(0.58 + (highCutHz / 20000) * 0.72, 0.58, 1.3)
  const motionPeriod = clamp(1 / modRateHz, 0.7, 8)
  const earlyCount = earlyReflectionsEnabled ? Math.round(3 + diffusionPercent * 0.07) : 0
  const lateCount = Math.round(12 + densityPercent * 0.27 + Math.min(decaySeconds, 12) * 0.55)

  const early: FieldNode[] = []
  for (let index = 0; index < earlyCount; index += 1) {
    early.push({
      x: preX + 2 + pseudoRandom(index, 1) * (11 + sizePercent * 0.055),
      y: 50 + (pseudoRandom(index, 2) - 0.5) * spread * 1.15,
      size: 4.5 + pseudoRandom(index, 3) * 3.5,
      opacity: clamp((0.46 + pseudoRandom(index, 4) * 0.36) * earlyWeight, 0.16, 0.94),
      early: true,
      cool: index % 2 === 0,
      brightness: 1.08,
      duration: motionPeriod * (0.82 + pseudoRandom(index, 10) * 0.36),
      delay: -pseudoRandom(index, 11) * 2.2
    })
  }

  const late: FieldNode[] = []
  for (let index = 0; index < lateCount; index += 1) {
    const progress = (index + 1) / (lateCount + 1)
    const jitter = (pseudoRandom(index, 5) - 0.5) * (3 + diffusionPercent * 0.035)
    const motion = (pseudoRandom(index, 6) - 0.5) * modDepthPercent * 0.09
    const decayShape = Math.pow(1 - progress, 0.72 + decaySeconds * 0.012)
    const bloomScale = character === 'bloom' ? 1.3 : character === 'vintage' ? 1.06 : 0.94
    const baseSize = 3.2 + (densityPercent / 100) * 2.5 + pseudoRandom(index, 8) * 2.2
    late.push({
      x: clamp(preX + 12 + progress * (tailEnd - preX - 12) + jitter, preX + 7, 96),
      y: clamp(50 + (pseudoRandom(index, 7) - 0.5) * spread * (0.7 + progress * 0.6) + motion, 8, 92),
      size: baseSize * bloomScale * (1 - progress * 0.22),
      opacity: clamp((0.12 + decayShape * 0.68) * lateWeight, 0.06, 0.9),
      early: false,
      cool: character === 'bloom' && index % 3 === 0,
      brightness: clamp(dampingBrightness - progress * (1.05 - dampingBrightness * 0.55), 0.45, 1.22),
      duration: motionPeriod * (0.8 + pseudoRandom(index, 10) * 0.4),
      delay: -pseudoRandom(index, 12) * 2.2
    })
  }

  const shimmer: ShimmerNode[] = []
  if (shimmerEnabled && shimmerAmountPercent > 0) {
    const intervalLift = clamp((shimmerIntervalSemitones - 7) / 17, 0, 1)
    const shimmerCount = Math.round(4 + shimmerAmountPercent * 0.16 + Math.min(decaySeconds, 12) * 0.28)
    const shimmerStart = preX + 20
    for (let index = 0; index < shimmerCount; index += 1) {
      const progress = (index + 1) / (shimmerCount + 1)
      const lift = (7 + intervalLift * 16) * progress
      const decayShape = Math.pow(1 - progress, 0.5)
      shimmer.push({
        x: clamp(shimmerStart + progress * (tailEnd - shimmerStart) + (pseudoRandom(index, 13) - 0.5) * 4, shimmerStart, 97),
        y: clamp(48 - lift + (pseudoRandom(index, 14) - 0.5) * spread * 0.55, 7, 74),
        size: 2.6 + pseudoRandom(index, 15) * 3.2 + shimmerAmountPercent * 0.018,
        opacity: clamp((0.16 + decayShape * 0.64) * (0.42 + shimmerAmountPercent / 105), 0.1, 0.92),
        rise: 3 + pseudoRandom(index, 16) * (5 + intervalLift * 5),
        duration: clamp(2.1 + pseudoRandom(index, 17) * 2.2, 2.2, 5.4),
        delay: -pseudoRandom(index, 18) * 2.8
      })
    }
  }

  return { early, late, shimmer }
}

interface VisualizerProps {
  draft: AetherformReverbModule
  clearing: boolean
  reducedMotion: boolean
}

function Visualizer({ draft, clearing, reducedMotion }: VisualizerProps) {
  const {
    spaceModel, character, preDelayMs, decaySeconds, sizePercent, widthPercent,
    lateBalancePercent, diffusionPercent, densityPercent, earlyReflectionsEnabled,
    modRateHz, modDepthPercent, highCutHz, shimmerEnabled, shimmerAmountPercent,
    shimmerIntervalSemitones, bypass
  } = draft

  // Depends on the exact values that shape the field, so unrelated edits
  // (ducking, output) never rebuild the node set.
  const field = useMemo(
    () => buildField({
      preDelayMs, decaySeconds, sizePercent, widthPercent, diffusionPercent,
      densityPercent, highCutHz, modRateHz, modDepthPercent, lateBalancePercent,
      earlyReflectionsEnabled, character, shimmerEnabled,
      shimmerAmountPercent, shimmerIntervalSemitones
    }),
    [preDelayMs, decaySeconds, sizePercent, widthPercent, diffusionPercent,
      densityPercent, highCutHz, modRateHz, modDepthPercent, lateBalancePercent,
      earlyReflectionsEnabled, character, shimmerEnabled,
      shimmerAmountPercent, shimmerIntervalSemitones]
  )

  const spaceLabel = SPACE_LABEL[spaceModel]
  const characterLabel = character.charAt(0).toUpperCase() + character.slice(1)
  const preX = clamp(7 + (preDelayMs / 250) * 13, 7, 20)
  const fieldDuration = clamp(decaySeconds * 0.72 + 1.2, 1.6, 7)
  const shimmerActive = shimmerEnabled && shimmerAmountPercent > 0
  const description =
    `${spaceLabel} reverb decay visualization. ` +
    `Pre-delay ${Math.round(preDelayMs)} milliseconds. ` +
    `Decay ${decaySeconds < 10 ? decaySeconds.toFixed(1) : Math.round(decaySeconds)} seconds. ` +
    `Size ${Math.round(sizePercent)} percent. ` +
    `Diffusion ${Math.round(diffusionPercent)} percent. ` +
    `Density ${Math.round(densityPercent)} percent. ` +
    `Early reflections ${earlyReflectionsEnabled ? 'enabled' : 'disabled'}. ` +
    `Shimmer ${shimmerEnabled
      ? `enabled at ${Math.round(shimmerAmountPercent)} percent with a plus ${shimmerIntervalSemitones} semitone interval`
      : 'disabled'}.`

  return (
    <section className="af-visualizer" aria-label="Reverb decay overview">
      <div className="af-vis-meta">
        <div>
          <span className="af-vis-label">Decay time</span>
          <div className="af-vis-decay">
            <strong>{decaySeconds < 10 ? decaySeconds.toFixed(1) : Math.round(decaySeconds)}</strong>
            <span>s</span>
          </div>
        </div>
        <span className="af-mode-chip">
          {`${spaceLabel} / ${characterLabel}`}
        </span>
      </div>

      <div
        className="af-field-plot"
        role="img"
        aria-label={description}
        style={{ '--af-field-duration': `${fieldDuration}s` } as React.CSSProperties}
      >
        <span className="af-field-boundary" aria-hidden="true" />
        <span className="af-source-pulse" aria-hidden="true" />
        <span className="af-pre-delay-line" aria-hidden="true" style={{ left: `${preX}%` }}>
          <span>Pre</span>
        </span>
        {!bypass && !reducedMotion && <span className="af-field-playhead" aria-hidden="true" />}
        <div className="af-reflection-layer" aria-hidden="true">
          {!clearing && [...field.early, ...field.late].map((node, i) => (
            <span
              key={i}
              className={`af-field-node${node.early ? ' af-field-node-early' : ''}${node.cool ? ' af-field-node-cool' : ''}`}
              style={{
                left: `${node.x}%`,
                top: `${node.y}%`,
                '--node-size': `${node.size}px`,
                '--node-opacity': node.opacity,
                '--node-brightness': node.brightness,
                '--node-duration': `${node.duration}s`,
                '--node-delay': `${node.delay}s`
              } as React.CSSProperties}
            />
          ))}
        </div>
        <div className="af-shimmer-layer" aria-hidden="true">
          {!clearing && field.shimmer.map((node, i) => (
            <span
              key={i}
              className="af-shimmer-node"
              style={{
                left: `${node.x}%`,
                top: `${node.y}%`,
                '--shimmer-size': `${node.size}px`,
                '--shimmer-opacity': node.opacity,
                '--shimmer-rise': `${node.rise}px`,
                '--shimmer-duration': `${node.duration}s`,
                '--shimmer-delay': `${node.delay}s`
              } as React.CSSProperties}
            />
          ))}
        </div>
      </div>

      <div className="af-vis-readouts">
        <div>
          <span className="af-vis-label">Space readout</span>
          <div className="af-vis-readout"><b>P</b><strong>{formatMs(preDelayMs)}</strong></div>
          <div className="af-vis-readout"><b>S</b><strong>{Math.round(sizePercent)}%</strong></div>
        </div>
        <div className="af-vis-state-stack">
          <span className="af-vis-state">{`${Math.round(widthPercent)}% width / ${lateBalancePercent}% late`}</span>
          <span className={`af-vis-shimmer${shimmerActive ? ' af-vis-shimmer-active' : ''}`}>
            {shimmerEnabled
              ? `Shimmer +${shimmerIntervalSemitones} / ${Math.round(shimmerAmountPercent)}%`
              : 'Shimmer off'}
          </span>
        </div>
      </div>
    </section>
  )
}

