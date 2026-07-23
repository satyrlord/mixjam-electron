# Spec 013 — Aetherform Reverb Module

**Spec Validation Status:** VALIDATED

**Spec Implementation Status:** IMPLEMENTED — the `aetherform-reverb` Return FX
module, its 760x680 modal editor with the spatial decay visualizer, the
FDN-based DSP core with shimmer, freeze, ducking, and Clear Tail, seven built-in
presets, and persistence are implemented with headless DSP, component, and
persistence tests.

**Depends on:** spec-010 (Return FX Modules), spec-005 (Audio Playback Engine)

**Related:** spec-011 (Project Save & Load), spec-007 (Lane-Bound Mixer)

## Objective

Add the Aetherform Reverb as the second effect module hosted by the four Return
FX buses. It is an algorithmic stereo reverb with four space models, three tail
characters, a pitch-shifted shimmer feedback branch, freeze/hold, wet-only
ducking, and a momentary Clear Tail command. Every displayed control drives real
DSP. The module follows the spec-010 black-box host contract: the host owns
routing, power, the shared Mix (return level), the limiter, persistence, and
disposal.

The serialized module type is `aetherform-reverb`. No earlier reverb module or
prototype ever shipped, so there is no migration; the type is new inside the
existing format version 6.

## Module Identity and Parameters

The shared state contract lives in `aetherform-reverb-types.ts`
(`AetherformReverbState`); the module record adds `type: 'aetherform-reverb'`
and the optional runtime `id`. Mix is intentionally absent: the FX-return Mix is
the bus `returnLevel`, the reverb always renders 100% wet (spec-010 Mix
semantics).

Persistent parameters, ranges, and defaults (defaults equal the Warm Chamber
preset):

| Parameter | ID | Range | Default |
| --- | --- | --- | --- |
| Space model | `spaceModel` | `room`, `hall`, `plate`, `chamber` | `chamber` |
| Pre-delay | `preDelayMs` | 0–250 ms | 24 |
| Decay (midband RT60 target) | `decaySeconds` | 0.2–30 s, log control | 2.8 |
| Size | `sizePercent` | 5–100% | 68 |
| Tail character | `character` | `natural`, `vintage`, `bloom` | `vintage` |
| Drive | `drivePercent` | 0–100% | 0 |
| Width | `widthPercent` | 0–200% | 148 |
| Early/late balance | `lateBalancePercent` | 0–100% | 72 |
| Low-cut | `lowCutHz` | 20–2000 Hz, log control | 180 |
| High-cut | `highCutHz` | 1000–20000 Hz, log control | 8600 |
| Diffusion | `diffusionPercent` | 0–100% | 78 |
| Density | `densityPercent` | 0–100% | 84 |
| Early reflections | `earlyReflectionsEnabled` | boolean | on |
| Modulation rate | `modRateHz` | 0.05–3 Hz, log control | 0.32 |
| Modulation depth | `modDepthPercent` | 0–100% | 18 |
| Shimmer | `shimmerEnabled` | boolean | off |
| Shimmer amount | `shimmerAmountPercent` | 0–100% (retained while off) | 24 |
| Shimmer interval | `shimmerIntervalSemitones` | 7, 12, 19, 24 | 12 |
| Ducking amount | `duckAmountPercent` | 0–100% | 28 |
| Ducking release | `duckReleaseMs` | 50–2500 ms, log control | 720 |
| Output | `outputDb` | -24 to +12 dB | -1.5 |
| Freeze/Hold | `freeze` | boolean | off |
| Bypass | `bypass` | boolean (spec-010 module bypass) | off |

Readout conventions:

- Early/late balance reads `Balanced` at 50, `N% Late` above 50, and the
  complementary `N% Early` below 50.
- Turning Shimmer off retains the amount and interval.

### Clear Tail

Clear Tail is a momentary command, not a parameter. It is routed as a
`clear-tail` port message through an optional `clearTail()` method on the
`ReturnModuleProcessor` contract, the audio engine (`clearReturnTail(index)`),
the playback engine, and the `useMixer` hook. It is never serialized, never an
undo entry, and never marks the preset Custom. In DSP it ramps the wet output
down over ~12 ms, wipes every buffer (pre-delay, early, diffusion, FDN lines,
filter state, shimmer history and voices), and ramps back up. Clearing while
frozen stays silent until Freeze is released, because injection is still gated.

## DSP Architecture

The reverb runs in an `AudioWorkletProcessor` (`aetherform-reverb-processor`)
backed by the allocation-free `AetherformReverbCore`. The renderer posts the
full parameter state; the audio thread smooths toward targets. Contexts without
worklet support fall back to identity passthrough. A silent or inactive
upstream input does not stop processing: the worklet feeds the core silence so
tails ring out and Freeze sustains.

Signal flow: stereo pre-delay -> model-specific multi-tap early reflections
(toned once on output) in parallel with input diffusion -> eight-line
Householder feedback delay network with in-loop tone damping, character
processing, in-loop diffusion, modulated fractional reads, and the shimmer
feedback branch -> equal-power early/late blend -> mid/side width -> wet-only
ducking -> output trim. The host applies the shared Mix (return level) and
limiter after the module.

Real-time-safety and DSP notes:

- All delay, diffusion, modulation, and shimmer memory is preallocated from the
  sample rate at construction. No allocation, locks, logging, or unbounded work
  in the render callback. Cubic (4-point Lagrange) reads are always wrapped in
  bounds. Denormals are flushed; non-finite input samples are replaced with 0.
- Late network: eight delay lines with prime-valued, model-specific base
  lengths (Room compact, Chamber medium, Hall long, Plate short and dense),
  scaled by a nonlinear Size factor (0.28x–1x) with a 5 ms per-line floor.
  Feedback uses a Householder matrix; per-line gain is
  `10 ^ (-3 * lineSeconds / decaySeconds)` so the displayed Decay is the RT60
  target independent of Size. A bounded in-loop soft limiter keeps extreme
  Decay + Shimmer + Freeze combinations finite without clipping normal tails.
- Retimes (Size, model, Pre-delay) use dual read-head crossfades — never pitch
  glides. Early reflections retarget through a crossfaded tap-set pair. Model
  and character scalar changes are weight-smoothed; every externally
  controllable value is smoothed or crossfaded.
- Tone: low-cut (high-pass) and high-cut (low-pass) are cascaded TPT one-pole
  pairs (~12 dB/oct) inside the late feedback path, so damping accumulates per
  circulation; the early output is filtered once with the same coefficients.
  The dry source is never filtered.
- Characters: Natural is neutral. Vintage blends tanh soft saturation plus an
  extra one-pole damping stage into the loop and adds slow deterministic wander
  scaled by Mod depth. Bloom smears late injection through two long all-passes
  per side (soft onset, gradually opening tail) and slows/widens modulation.
  Mod depth 0 disables all intentional time movement in every character.
- Modulation: per-line sine LFOs with spread phase offsets; depth maps
  nonlinearly (`depth^2`) to at most 4 ms. Deterministic seeded state only — no
  RNG on the audio path; repeated renders are bit-identical.
- Shimmer: a granular dual-head pitch shifter (sawtooth delay sweep, sin
  windows at equal power, duration-preserving) per channel, fed from the late
  output, band-limited before shifting to
  `min(0.45 * sampleRate / ratio, highCut)`, and injected back into the FDN so
  it circulates through damping, character, and the safety stage. Ratio is
  `2 ^ (semitones / 12)`. Amount maps nonlinearly to at most ~0.55 linear send,
  so the root tail stays audible at 100%. Enable/disable and interval changes
  crossfade (~120 ms) between voice pairs; while faded out the shifter work is
  suspended (history stays warm at negligible cost). Shimmer keeps circulating
  during bypass and freeze; the loop stays bounded.
- Freeze/Hold is a **true hold, not a slow fade**. It ramps input injection
  (and new early reflections) to zero and loop gain toward 0.9995 while
  preserving all buffers, **and the recirculated signal bypasses the in-loop
  low/high-cut damping and vintage saturation** (the energy-preserving in-loop
  all-pass stays in, so diffusion is unchanged). Those damping stages are lossy
  per circulation; leaving them in the loop made a "frozen" tail decay several
  dB per second. The wet output still reads the damped/character-shaped taps, so
  the held field keeps its tone; only the feedback copy is undamped. The filters
  keep running so release is click-free. Modulation and Shimmer keep shaping the
  held field. After freeze engages the FDN energy redistributes for ~2 s, then
  holds flat. Release restores the Decay-derived gains from the current buffers.
- Ducking keys from the unprocessed input (stereo-linked, ~7 ms attack,
  50–2500 ms release), soft knee, up to ~24 dB of wet-only attenuation.
- Drive ("Smash") is a gain-compensated soft saturation on the signal entering
  the reverb, before pre-delay/early/late — distinct from the in-loop Character
  shaping. Applied after the ducking detector reads the input (ducking follows
  the natural transient), curve `tanh(x·g)/g` with `g = 1 + drive·8` plus a mild
  makeup, blended against the clean input by the Drive amount so 0% is an exact
  bypass. Smoothed per sample and gated by Freeze like any other input. Matches
  the Echoform Drive curve so both effects "smash" alike.
- Bypass is tail-preserving: the loop keeps running and the audible return
  crossfades to silence, matching the spec-010 return bypass contract.

## Editor

The editor follows the Echoform Delay modal architecture exactly: a blocking
Radix dialog (focus trap, Escape cancels, outside interaction blocked, focus
restored to the opener), a local draft with live `onPreview` audition, and a
single committed `onSave` on close — one undoable project edit per editor
session, matching spec-010. The desktop envelope is 760x680 CSS pixels, scaled
by UI Size with the same width-full/height-half policy as the delay editor, and
clamped to the viewport with internal grid scrolling.

Layout: header (RV mark, `FX Return NN` kicker, title, Bypass, preset selector,
close), the spatial decay visualizer, a four-column control grid
(1.12/1.12/0.88/0.88) — Space (spanning two columns), Image, Tone on the top
row; Texture, Motion, Ducking, Output on the bottom — and a footer with the
knob-interaction legend and a polite live state string such as
`Active / Chamber / Vintage / Shimmer +12`. The grid drops to two columns
around 720 px and one column around 500 px.

Controls use the shared editor-knob contract (`role="slider"`, vertical drag,
Shift fine, wheel, double-click reset, Arrow/Page/Home/End keys, full ARIA
value reporting, log curves where the table above says so), native selects for
the space model and shimmer interval, `aria-pressed` toggles for character,
early reflections, shimmer, freeze, and bypass, and the shared LinearSlider for
early/late balance. The Motion card holds the Rate, Depth, and Shimmer knobs
plus the shimmer toggle (with its contained On/Off pill) stacked above the
interval selector.

The visualizer is parameter-derived (never analyzer data, never a waveform):
decay readout and model/character chip on the left; the spatial decay field in
the center (source pulse, pre-delay marker, room boundary, early/late
reflection nodes, shimmer particles, scanning playhead); pre-delay, size, and
width/late/shimmer readouts on the right. Models change node shapes, Size and
Decay scale the field, Diffusion/Density change node spread and count, Vintage
softens and Bloom enlarges nodes, shimmer particles rise with interval and
amount, Freeze pauses the playhead and sustains the field, Clear Tail briefly
empties it, Bypass desaturates and pauses it. It renders through CSS animations
only (no rAF loop), stops when the editor unmounts, honors
`prefers-reduced-motion`, and carries a full text description
(`role="img"`).

Styling lives in `aetherform-reverb.css` under the `af-` prefix with the same
semantic theme bridge as the delay editor — every colour derives from the
active theme's tokens across all sixteen skins, plus a derived shimmer accent
(`--af-shimmer`: secondary blended toward the strong accent). There is no
private palette.

## Presets

Seven built-in presets plus a Custom label: Warm Chamber (default), Vocal
Plate, Dark Hall, Small Room, Ambient Bloom, Shimmer Cloud, Frozen Cathedral.
Preset definitions live in `return-effects.ts`
(`applyAetherformReverbPreset`); the preset Mix percentages (88, 82, 92, 74,
96, 98, 100) live with the editor and apply to the shared return level. A
preset load sets every field atomically in one draft update, clears Bypass, and
updates both Mix controls; any manual sound edit flips the selector to Custom
(exact-match detection, including Mix). Frozen Cathedral is the only preset
that loads with Freeze on.

## Persistence

The module serializes inside `ProjectFxBusState.module` under format version 6
with the strict key allowlist and range validation in `return-effects.ts`
(`isReturnModule`) and `project-file.ts`. Clear Tail activation, visualizer
phase, and modal state are never serialized. Slot duplication through
`cloneProjectFxBuses` copies the complete module state.

## Verification

- `aetherform-reverb-core.test.ts` — headless DSP: mapping helpers, pre-delay
  timing (0/120/250 ms, and at 96 kHz), RT60 slope and decay scaling, per-model
  and per-character IR differences, click-free live model/size/character/
  density changes, early-off behavior, balance endpoints, tone accumulation,
  modulation determinism and bounds, width endpoints, ducking depth and
  release, freeze capture/hold/release, clear-tail flush, tail-preserving
  bypass, output trim, non-finite input hygiene, and the full shimmer battery
  (interval ratios, +12/+24 spectral lift, root retention, zero-amount
  null, early-path isolation, band-limiting, mono sum, 30 s decay and
  freeze boundedness).
- `aetherform-reverb-performance.test.ts` — no allocation on the processing
  path; 20%-of-real-time CPU budget with shimmer off and on.
- `aetherform-reverb-processor.test.ts` — registration memoization, state
  serialization, update/clear-tail messages, disposal, identity fallbacks.
- `AetherformReverbModal.test.tsx` — header identity, save/cancel, knob
  keyboard/pointer/wheel/reset gestures, ARIA reporting, selectors, toggles,
  retained shimmer settings, Clear Tail command behavior, shared Mix sync,
  preset atomicity and Custom detection, footer live state, visualizer
  description and state coupling, reduced motion.
- `MixerFxSlot.test.tsx`, `return-effects.test.ts`, `project-file.test.ts` —
  selection flow, summaries, validation, presets, and round-trip persistence.

## Non-Goals

- No convolution or impulse-response loading.
- No FX-parameter automation lanes (the app has none; see spec-010).
- No per-module output metering or analyzer-driven visuals.
- No BPM-synced reverb parameters.
