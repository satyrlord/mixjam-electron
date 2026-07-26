import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import {
  applyEchoformDelayPreset,
  ECHOFORM_DELAY_PRESET_NAMES,
  type EchoformDelayModule,
  type EchoformDelayPresetName
} from '../engine/return-effects'
import { echoformDelaySeconds } from '../engine/echoform-delay-core'
import {
  ECHOFORM_DELAY_DIVISIONS,
  type EchoformDelayCharacter,
  type EchoformDelayDivision
} from '../engine/echoform-delay-types'
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
import { ECHOFORM_DELAY_RANGES } from '../engine/return-param-ranges'
import FxKnob, { fromNormalized, quantize, toNormalized, type FxKnobSpec } from './FxKnob'

/**
 * The Echoform Delay editor. Renders the module's real state; every control
 * drives the DSP through `onPreview` (live, non-undoable) and `onSave`
 * (committed). Mix is the FX-return level, shared with the FX-slot knob — it is
 * NOT a delay-module field.
 */

// ---------------------------------------------------------------------------
// Parameter descriptors
// ---------------------------------------------------------------------------

type KnobKey =
  | 'feedback' | 'mix' | 'lowCut' | 'highCut'
  | 'modRate' | 'modDepth' | 'drive' | 'duckAmount' | 'duckRelease'
  | 'outputDb' | 'timeMsL' | 'timeMsR'


const formatMs = (value: number): string =>
  value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`
const formatPercent = (value: number): string => `${Math.round(value)}%`
const formatHz = (value: number): string =>
  value >= 1000 ? `${(value / 1000).toFixed(1)} kHz` : `${Math.round(value)} Hz`
const formatRate = (value: number): string => `${value.toFixed(2)} Hz`
const formatDepth = (value: number): string => `${value.toFixed(1)} ms`
const formatDb = (value: number): string => `${value > 0 ? '+' : ''}${value.toFixed(1)} dB`

const KNOBS: Record<KnobKey, FxKnobSpec> = {
  timeMsL: { ...ECHOFORM_DELAY_RANGES.timeMsL, step: 1, curve: 'log', defaultValue: 420, format: formatMs },
  timeMsR: { ...ECHOFORM_DELAY_RANGES.timeMsR, step: 1, curve: 'log', defaultValue: 610, format: formatMs, tone: 'cool' },
  feedback: { ...ECHOFORM_DELAY_RANGES.feedback, step: 1, defaultValue: 68, format: formatPercent, tone: 'warm' },
  mix: { min: 0, max: 100, step: 1, defaultValue: 100, format: formatPercent, tone: 'warm' },
  lowCut: { ...ECHOFORM_DELAY_RANGES.lowCut, step: 1, curve: 'log', defaultValue: 160, format: formatHz },
  highCut: { ...ECHOFORM_DELAY_RANGES.highCut, step: 10, curve: 'log', defaultValue: 7800, format: formatHz, tone: 'cool' },
  modRate: { ...ECHOFORM_DELAY_RANGES.modRate, step: 0.01, curve: 'log', defaultValue: 0.38, format: formatRate },
  modDepth: { ...ECHOFORM_DELAY_RANGES.modDepth, step: 0.1, defaultValue: 5.4, format: formatDepth, tone: 'cool' },
  drive: { ...ECHOFORM_DELAY_RANGES.drive, step: 1, defaultValue: 0, format: formatPercent, tone: 'warm' },
  duckAmount: { ...ECHOFORM_DELAY_RANGES.duckAmount, step: 1, defaultValue: 34, format: formatPercent, tone: 'warm' },
  duckRelease: { ...ECHOFORM_DELAY_RANGES.duckRelease, step: 10, defaultValue: 620, format: formatMs },
  outputDb: { ...ECHOFORM_DELAY_RANGES.outputDb, step: 0.1, defaultValue: -1.5, format: formatDb }
}

const CHARACTER_COPY: Record<EchoformDelayCharacter, string> = {
  digital: 'Clean, precise repeats with a flat and stable delay line.',
  analog: 'Rounded transients, mild drive, and progressively softer repeats.',
  tape: 'Soft saturation, darker repeats, and subtle time drift.'
}

const DIVISION_LABEL: Record<EchoformDelayDivision, string> = {
  '1/1': '1/1', '1/1.': '1/1 dotted', '1/1T': '1/1 triplet',
  '1/2': '1/2', '1/2.': '1/2 dotted', '1/2T': '1/2 triplet',
  '1/4': '1/4', '1/4.': '1/4 dotted', '1/4T': '1/4 triplet',
  '1/8': '1/8', '1/8.': '1/8 dotted', '1/8T': '1/8 triplet',
  '1/16': '1/16', '1/16.': '1/16 dotted', '1/16T': '1/16 triplet'
}

const PRESET_LABEL: Record<EchoformDelayPresetName, string> = {
  'Wide Tape Echo': 'Wide Tape Echo',
  'Clean Slap': 'Clean Slap',
  'Dotted Motion': 'Dotted Motion',
  'Dub Feedback': 'Dub Feedback',
  'Ducked Eighths': 'Ducked Eighths',
  'Endless Wash': 'Endless Wash'
}

// Preset Mix percentages (spec §22), applied to the shared FX-return level.
const PRESET_MIX: Record<EchoformDelayPresetName, number> = {
  'Wide Tape Echo': 82,
  'Clean Slap': 72,
  'Dotted Motion': 78,
  'Dub Feedback': 90,
  'Ducked Eighths': 86,
  'Endless Wash': 96
}

const TAP_TIMEOUT_MS = 2000
const TAP_HISTORY = 6

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

interface EchoformDelayModalProps {
  value: EchoformDelayModule
  powered: boolean
  /** Shared Mix parameter (0..1 = FX-return level). */
  mix: number
  /** Real project tempo driving synced delay timing. */
  bpm: number
  /** Established tempo command; Tap Tempo routes real BPM changes through it. */
  onSetBpm?: (bpm: number) => void
  slot: number
  onCancel: () => void
  onSave: (value: EchoformDelayModule, powered: boolean, mix: number) => void
  onPreview?: (value: EchoformDelayModule, powered: boolean, mix: number) => void
  onRestoreFocus?: () => void
}

const TITLE_ID = 'echoform-delay-title'

export default function EchoformDelayModal({
  value,
  powered,
  mix: mixProp,
  bpm,
  onSetBpm,
  slot,
  onCancel,
  onSave,
  onPreview,
  onRestoreFocus
}: EchoformDelayModalProps) {
  const [draft, setDraft] = useState(value)
  const [powerOn, setPowerOn] = useState(powered)
  const [mixPercent, setMixPercent] = useState(Math.round(clamp(mixProp, 0, 1) * 100))
  const [preset, setPreset] = useState<EchoformDelayPresetName | 'Custom'>(() => detectPreset(value, mixProp))
  const [localBpm, setLocalBpm] = useState(bpm)
  const [tapFlash, setTapFlash] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const tapTimesRef = useRef<number[]>([])
  const applyingPresetRef = useRef(false)
  const reducedMotion = usePrefersReducedMotion()

  useEffect(() => { setLocalBpm(bpm) }, [bpm])

  // Keep the live DSP in sync with every draft change.
  useEffect(() => {
    onPreview?.(draft, powerOn, mixPercent / 100)
  }, [draft, powerOn, mixPercent, onPreview])

  const markCustom = () => { if (!applyingPresetRef.current) setPreset('Custom') }

  const setField = <K extends keyof EchoformDelayModule>(key: K, next: EchoformDelayModule[K]) => {
    setDraft((current) => ({ ...current, [key]: next }))
    markCustom()
  }

  const setKnob = (key: KnobKey, next: number) => {
    if (key === 'mix') { setMixPercent(Math.round(next)); markCustom(); return }
    setDraft((current) => ({ ...current, [key]: next }))
    markCustom()
  }

  const knobValue = (key: KnobKey): number =>
    key === 'mix' ? mixPercent : (draft[key as keyof EchoformDelayModule] as number)

  const applyPreset = (name: EchoformDelayPresetName) => {
    applyingPresetRef.current = true
    setDraft(applyEchoformDelayPreset(draft, name))
    setMixPercent(PRESET_MIX[name])
    setPowerOn(true)
    setPreset(name)
    // Clear the guard after React has queued the state updates.
    window.setTimeout(() => { applyingPresetRef.current = false }, 0)
  }

  const times = useMemo(() => ({
    left: echoformDelaySeconds(draft.mode, draft.divisionL, draft.timeMsL, localBpm) * 1000,
    right: echoformDelaySeconds(draft.mode, draft.divisionR, draft.timeMsR, localBpm) * 1000
  }), [draft.mode, draft.divisionL, draft.divisionR, draft.timeMsL, draft.timeMsR, localBpm])

  const handleTap = () => {
    const now = performance.now()
    const history = tapTimesRef.current
    if (history.length && now - history[history.length - 1]! > TAP_TIMEOUT_MS) history.length = 0
    history.push(now)
    if (history.length > TAP_HISTORY) history.splice(0, history.length - TAP_HISTORY)
    if (history.length >= 2) {
      const intervals = history.slice(1).map((t, i) => t - history[i]!)
      const average = intervals.reduce((sum, v) => sum + v, 0) / intervals.length
      const tappedBpm = clamp(Math.round(60000 / average), 40, 240)
      // Route through the established project-tempo command so real synced delay
      // timing follows; the new BPM flows back through the `bpm` prop. Update the
      // local readout too so the display responds even without a host command.
      setLocalBpm(tappedBpm)
      onSetBpm?.(tappedBpm)
    }
    setTapFlash(true)
    window.setTimeout(() => setTapFlash(false), 150)
  }

  const handleModalKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
    }
  }

  const characterLabel = draft.character.charAt(0).toUpperCase() + draft.character.slice(1)
  const modeLabel = draft.mode.charAt(0).toUpperCase() + draft.mode.slice(1)
  const stateWord = draft.bypass ? 'Bypassed' : 'Active'

  return (
    <DialogRoot open modal>
      <BlockingDialogContent
        ref={dialogRef}
        className="ef-dialog"
        restoreFocus={onRestoreFocus}
        aria-labelledby={TITLE_ID}
        data-character={draft.character}
        data-bypassed={draft.bypass ? '1' : undefined}
        data-reduced-motion={reducedMotion ? '1' : undefined}
        onKeyDown={handleModalKeyDown}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          dialogRef.current?.querySelector<HTMLButtonElement>('.ef-bypass')?.focus()
        }}
        tabIndex={-1}
      >
        <div className="ef-module">
          <header className="ef-header">
            <div className="ef-brand">
              <span className="ef-mark" aria-hidden="true">D8</span>
              <div className="ef-title-block">
                <span className="ef-kicker">{`FX Return ${String(slot).padStart(2, '0')}`}</span>
                <DialogTitle asChild><h1 id={TITLE_ID} className="ef-title">Echoform Delay</h1></DialogTitle>
              </div>
            </div>
            <div className="ef-header-actions">
              <button
                type="button"
                className="ef-bypass"
                aria-pressed={draft.bypass}
                onClick={() => setField('bypass', !draft.bypass)}
              >
                {draft.bypass ? 'Bypassed' : 'Bypass'}
              </button>
              <div className="ef-preset-field">
                <span aria-hidden="true">Preset</span>
                <DropdownMenuRoot>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="ef-preset-trigger" aria-label="Preset">
                      {preset === 'Custom' ? 'Custom' : PRESET_LABEL[preset]}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="ef-preset-menu" align="end">
                    {/* Presets are a single-choice set, so the items carry the
                        radio role that actually supports a checked state. */}
                    <DropdownMenuRadioGroup
                      value={preset}
                      onValueChange={(name) => applyPreset(name as EchoformDelayPresetName)}
                    >
                      {ECHOFORM_DELAY_PRESET_NAMES.map((name) => (
                        <DropdownMenuRadioItem key={name} value={name}>
                          {PRESET_LABEL[name]}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenuRoot>
              </div>
              <button
                type="button"
                className="ef-close"
                aria-label="Close Echoform Delay editor"
                onClick={() => onSave(draft, powerOn, mixPercent / 100)}
              />
            </div>
          </header>

          <div className="ef-body">
            <Visualizer
              times={times}
              bpm={localBpm}
              mode={draft.mode}
              character={draft.character}
              feedback={draft.feedback}
              width={draft.width}
              pingPong={draft.pingPong}
              bypass={draft.bypass}
              reducedMotion={reducedMotion}
            />

            <div className="ef-grid">
              <section className="ef-card ef-card-time" aria-label="Time">
                <div className="ef-card-head">
                  <h2>Time</h2>
                  <div className="ef-segmented" role="group" aria-label="Time mode">
                    {(['sync', 'free'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={draft.mode === mode}
                        onClick={() => setField('mode', mode)}
                      >
                        {mode === 'sync' ? 'Sync' : 'Free'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="ef-time-lanes">
                  {(['L', 'R'] as const).map((side) => {
                    const divKey = side === 'L' ? 'divisionL' : 'divisionR'
                    const timeKey: KnobKey = side === 'L' ? 'timeMsL' : 'timeMsR'
                    const computed = side === 'L' ? times.left : times.right
                    return (
                      <div className="ef-time-lane" key={side}>
                        <div className="ef-lane-head">
                          <span className="ef-lane-badge">{side}</span>
                          <span className="ef-lane-computed">{formatMs(computed)}</span>
                        </div>
                        {draft.mode === 'sync' ? (
                          <label className="ef-division-field">
                            <span>Note division</span>
                            <select
                              className="ef-division-select"
                              value={draft[divKey]}
                              aria-label={`${side} delay note division`}
                              onChange={(e) => setField(divKey, e.target.value as EchoformDelayDivision)}
                            >
                              {ECHOFORM_DELAY_DIVISIONS.map((div) => (
                                <option key={div} value={div}>{DIVISION_LABEL[div]}</option>
                              ))}
                            </select>
                          </label>
                        ) : (
                          <FxKnob
                            classPrefix="ef" id={`ef-${timeKey}`}
                            spec={KNOBS[timeKey]}
                            label={`${side} free time`}
                            value={knobValue(timeKey)}
                            onChange={(v) => setKnob(timeKey, v)}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>

              <section className="ef-card" aria-label="Space">
                <div className="ef-card-head"><h2>Space</h2></div>
                <FxKnob classPrefix="ef" id="ef-feedback" spec={KNOBS.feedback} label="Feedback" value={draft.feedback}
                  onChange={(v) => setKnob('feedback', v)} />
                <FxKnob classPrefix="ef" id="ef-mix" spec={KNOBS.mix} label="Mix" value={mixPercent}
                  onChange={(v) => setKnob('mix', v)} />
                <button
                  type="button"
                  className="ef-toggle"
                  aria-pressed={draft.pingPong}
                  onClick={() => setField('pingPong', !draft.pingPong)}
                >Ping-pong</button>
                <div className="ef-range-field">
                  <span aria-hidden="true">Stereo width</span>
                  <LinearSlider
                    className="ef-width-slider"
                    value={draft.width}
                    min={0}
                    max={200}
                    step={1}
                    ariaLabel="Stereo width"
                    ariaValueText={`${draft.width}%`}
                    onValueChange={(next) => setField('width', next)}
                  />
                  <output>{draft.width}%</output>
                </div>
              </section>

              <section className="ef-card" aria-label="Feedback Tone">
                <div className="ef-card-head"><h2>Feedback Tone</h2></div>
                <FxKnob classPrefix="ef" id="ef-lowCut" spec={KNOBS.lowCut} label="Low-cut" value={draft.lowCut}
                  onChange={(v) => setKnob('lowCut', v)} />
                <FxKnob classPrefix="ef" id="ef-highCut" spec={KNOBS.highCut} label="High-cut" value={draft.highCut}
                  onChange={(v) => setKnob('highCut', v)} />
              </section>

              <section className="ef-card" aria-label="Modulation">
                <div className="ef-card-head"><h2>Modulation</h2></div>
                <FxKnob classPrefix="ef" id="ef-modRate" spec={KNOBS.modRate} label="Rate" value={draft.modRate}
                  onChange={(v) => setKnob('modRate', v)} />
                <FxKnob classPrefix="ef" id="ef-modDepth" spec={KNOBS.modDepth} label="Depth" value={draft.modDepth}
                  onChange={(v) => setKnob('modDepth', v)} />
              </section>

              <section className="ef-card" aria-label="Character">
                <div className="ef-card-head"><h2>Character</h2></div>
                <div className="ef-character-group" role="group" aria-label="Character">
                  {(['digital', 'analog', 'tape'] as const).map((char) => (
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
                <p className="ef-character-desc">{CHARACTER_COPY[draft.character]}</p>
                <FxKnob classPrefix="ef" id="ef-drive" spec={KNOBS.drive} label="Drive" value={draft.drive}
                  onChange={(v) => setKnob('drive', v)} />
              </section>

              <section className="ef-card" aria-label="Ducking">
                <div className="ef-card-head"><h2>Ducking</h2></div>
                <FxKnob classPrefix="ef" id="ef-duckAmount" spec={KNOBS.duckAmount} label="Amount" value={draft.duckAmount}
                  onChange={(v) => setKnob('duckAmount', v)} />
                <FxKnob classPrefix="ef" id="ef-duckRelease" spec={KNOBS.duckRelease} label="Release" value={draft.duckRelease}
                  onChange={(v) => setKnob('duckRelease', v)} />
              </section>

              <section className="ef-card" aria-label="Output">
                <div className="ef-card-head"><h2>Output</h2></div>
                <FxKnob classPrefix="ef" id="ef-outputDb" spec={KNOBS.outputDb} label="Output level" value={draft.outputDb}
                  onChange={(v) => setKnob('outputDb', v)} />
                <button
                  type="button"
                  className={`ef-performance${tapFlash ? ' ef-performance-flash' : ''}`}
                  onClick={handleTap}
                >Tap Tempo<small>{localBpm} BPM</small></button>
              </section>
            </div>

            <footer className="ef-foot">
              <span className="ef-foot-help">
                Knobs: drag or scroll / Shift for fine / double-click to reset
              </span>
              <span className="ef-foot-state">{`${stateWord} / ${characterLabel} / ${modeLabel}`}</span>
            </footer>
          </div>
        </div>
      </BlockingDialogContent>
    </DialogRoot>
  )
}


/** Detect whether the current module+mix exactly equals a built-in preset. */
function detectPreset(module: EchoformDelayModule, mix: number): EchoformDelayPresetName | 'Custom' {
  const mixPercent = Math.round(clamp(mix, 0, 1) * 100)
  for (const name of ECHOFORM_DELAY_PRESET_NAMES) {
    const preset = applyEchoformDelayPreset(module, name)
    const sameModule = (Object.keys(preset) as (keyof EchoformDelayModule)[]).every((key) => {
      if (key === 'id' || key === 'type') return true
      return preset[key] === module[key]
    })
    if (sameModule && PRESET_MIX[name] === mixPercent) return name
  }
  return 'Custom'
}

// ---------------------------------------------------------------------------
// Echo-tap visualizer (derived from parameter state, no audio telemetry)
// ---------------------------------------------------------------------------

interface VisualizerProps {
  times: { left: number; right: number }
  bpm: number
  mode: EchoformDelayModule['mode']
  character: EchoformDelayCharacter
  feedback: number
  width: number
  pingPong: boolean
  bypass: boolean
  reducedMotion: boolean
}

interface Tap {
  side: 'left' | 'right'
  x: number
  y: number
  opacity: number
  size: number
}

/* Only the four fields that actually shape the taps, so the memo in Visualizer
   can depend on values rather than on the whole (always-fresh) props object. */
type TapInputs = Pick<VisualizerProps, 'times' | 'feedback' | 'width' | 'pingPong'>

function buildTaps({ times, feedback, width, pingPong }: TapInputs): Tap[] {
  const repeats = clamp(Math.round(3 + feedback / 10.5), 3, 12)
  const events: { index: number; side: 'left' | 'right'; time: number }[] = []
  if (pingPong) {
    let elapsed = 0
    for (let i = 1; i <= repeats; i += 1) {
      const side: 'left' | 'right' = i % 2 === 1 ? 'left' : 'right'
      elapsed += side === 'left' ? times.left : times.right
      events.push({ index: i, side, time: elapsed })
    }
  } else {
    for (let i = 1; i <= repeats; i += 1) {
      events.push({ index: i, side: 'left', time: times.left * i })
      events.push({ index: i, side: 'right', time: times.right * i })
    }
  }
  const maxTime = Math.max(...events.map((e) => e.time), 1)
  const spread = 4 + (width / 200) * 28
  const feedbackRatio = clamp(feedback / 100, 0.05, 1.08)
  return events.map((e) => ({
    side: e.side,
    x: 7 + (e.time / maxTime) * 88,
    y: e.side === 'left' ? 50 - spread : 50 + spread,
    opacity: clamp(Math.pow(feedbackRatio, e.index * 0.72), 0.13, 0.92),
    size: clamp(10 - e.index * 0.35, 5, 10)
  }))
}

function Visualizer(props: VisualizerProps) {
  const { times, bpm, mode, character, feedback, pingPong, width, bypass, reducedMotion } = props
  // Depend on the values that shape the taps, not the always-fresh props
  // object, so the memo actually hits.
  const taps = useMemo(
    () => buildTaps({ times, feedback, width, pingPong }),
    [times, feedback, width, pingPong]
  )
  const modeLabel = mode === 'sync' ? 'Sync' : 'Free'
  const characterLabel = character.charAt(0).toUpperCase() + character.slice(1)
  const description =
    `Echo visualization. Left delay ${Math.round(times.left)} milliseconds. ` +
    `Right delay ${Math.round(times.right)} milliseconds. Feedback ${Math.round(feedback)} percent. ` +
    `${pingPong ? 'Ping-pong enabled.' : 'Stereo delay.'}`

  return (
    <section className="ef-visualizer" aria-label="Echo tap visualizer">
      <div className="ef-vis-meta">
        <div>
          <span className="ef-vis-label">Tempo</span>
          <div className="ef-vis-tempo"><strong>{bpm}</strong><span>BPM</span></div>
        </div>
        <span className="ef-mode-chip">
          {`${modeLabel} / ${characterLabel}`}
        </span>
      </div>
      <div className="ef-echo-plot" role="img" aria-label={description}>
        {!bypass && !reducedMotion && <span className="ef-playhead" aria-hidden="true" />}
        <span className="ef-origin" aria-hidden="true" />
        <div className="ef-tap-layer" aria-hidden="true">
          {taps.map((tap, i) => (
            <span
              key={i}
              className="ef-tap"
              style={{
                left: `${tap.x}%`,
                top: `${tap.y}%`,
                '--tap-size': `${tap.size}px`,
                '--tap-opacity': tap.opacity,
                '--tap-color': tap.side === 'left' ? 'var(--ef-accent)' : 'var(--ef-secondary)'
              } as React.CSSProperties}
            />
          ))}
        </div>
      </div>
      <div className="ef-vis-readouts">
        <div className="ef-time-readout"><b>L</b><strong>{formatMs(times.left)}</strong></div>
        <div className="ef-time-readout"><b>R</b><strong>{formatMs(times.right)}</strong></div>
        <span className="ef-vis-state">{`${pingPong ? 'Ping-pong' : 'Stereo'} / ${width}% width`}</span>
      </div>
    </section>
  )
}

