# Spec 013 — Aetherform Reverb Module

**Spec Validation Status:** VALIDATED

**Spec Implementation Status:** IMPLEMENTED — the app implements the
`aetherform-reverb` Return FX module and its 760x680 modal editor.
The editor includes the spatial decay visualizer.
The FDN-based DSP core includes shimmer, ducking, and Clear Tail.
The app implements seven presets and persistence. DSP, component, and
persistence tests cover these features.

**Depends on:** spec-010 (Return FX Modules), spec-005 (Audio Playback Engine)

**Related:** spec-011 (Project Save & Load), spec-007 (Lane-Bound Mixer)

## Objective

Add the Aetherform Reverb as the second effect module hosted by the four Return
FX buses. It is an algorithmic stereo reverb with four space models.
It has three tail characters and a pitch-shifted shimmer feedback branch.
It also has wet-only ducking and a momentary Clear Tail command.
Every displayed control drives real DSP.

The module follows the spec-010
black-box host contract. The host owns routing, power, the shared Mix return
level, the limiter, persistence, and disposal.

The serialized module type is `aetherform-reverb`. No earlier reverb module or
prototype ever shipped, so there is no migration. The type is new inside the
existing format version 7.

## Module Identity and Parameters

The shared state contract lives in `aetherform-reverb-types.ts`
(`AetherformReverbState`). The module record adds `type: 'aetherform-reverb'`
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
| Bypass | `bypass` | boolean (spec-010 module bypass) | off |

Readout conventions:

- Early/late balance reads `Balanced` at 50, `N% Late` above 50, and the
  complementary `N% Early` below 50.
- Turning Shimmer off retains the amount and interval.

### Clear Tail

Clear Tail is a momentary command, not a parameter.
An optional `clearTail()` method routes a `clear-tail` port message.
The route crosses `ReturnModuleProcessor`, the audio engine
(`clearReturnTail(index)`), the playback engine, and `useMixer`.
It is never serialized, never an
undo entry, and never marks the preset Custom.
In DSP, it lowers wet output over approximately 12 ms.
It clears all buffers and filter state, then raises the output.

## DSP Architecture

The reverb runs in an `AudioWorkletProcessor` (`aetherform-reverb-processor`)
backed by the allocation-free `AetherformReverbCore`. The renderer posts the
full parameter state. The audio thread smooths toward targets. Contexts without
worklet support fall back to identity passthrough. A silent or inactive
upstream input does not stop processing: the worklet feeds the core silence so
tails ring out.

The signal starts with stereo pre-delay.
Model-specific early reflections run in parallel with input diffusion.
An eight-line Householder feedback delay network follows.
It contains tone damping, character processing, diffusion, modulated reads,
and the shimmer branch. Equal-power early/late blend and mid/side width follow.

Wet-only ducking and output trim end the module path.
The host applies the shared Mix (return level) and
limiter after the module.

Real-time-safety and DSP notes:

- The constructor preallocates all delay, diffusion, modulation, and shimmer
  memory from the sample rate. The render callback has no allocation, locks,
  logging, or unbounded work. Bounds always contain cubic 4-point Lagrange
  reads. The core flushes denormals. It replaces non-finite input samples with 0.
- Late network: eight delay lines use prime-valued, model-specific lengths.
  Room is compact, Chamber is medium, Hall is long, and Plate is short and
  dense. A nonlinear Size factor scales them from 0.28x to 1x.
  Each line has a 5 ms floor.

  Feedback uses a Householder matrix. Per-line gain is
  `10 ^ (-3 * lineSeconds / decaySeconds)` so the displayed Decay is the RT60
  target independent of Size. A bounded in-loop soft limiter keeps extreme
  Decay + Shimmer combinations finite without clipping normal tails.
- Retimes (Size, model, Pre-delay) use dual read-head crossfades — never pitch
  glides. Early reflections retarget through a crossfaded tap-set pair. Model
  and character scalar changes use weight smoothing. Smoothing or crossfading
  applies to every external control.
- Tone: cascaded TPT one-pole pairs provide low-cut high-pass and high-cut
  low-pass filters. They operate inside the late feedback path at ~12 dB/oct.
  Thus, damping accumulates with each circulation. The same coefficients filter
  the early output once.
  The dry source is never filtered.
- Characters: Natural is neutral. Vintage blends tanh soft saturation and an
  extra one-pole damping stage into the loop. It adds slow deterministic wander
  scaled by Mod depth. Bloom smears late injection through two long all-passes
  per side (soft onset, gradually opening tail) and slows/widens modulation.
  Mod depth 0 disables all intentional time movement in every character.
- Modulation: per-line sine LFOs with spread phase offsets. Depth maps
  nonlinearly (`depth^2`) to at most 4 ms. Deterministic seeded state only — no
  RNG on the audio path. Repeated renders are bit-identical.
- Shimmer: each channel has a granular dual-head pitch shifter.
  It uses a sawtooth delay sweep and equal-power sine windows.
  The late output feeds it. A band limit before shifting uses
  `min(0.45 * sampleRate / ratio, highCut)`.
  The result returns to the FDN and crosses damping, character, and safety.

  Ratio is
  `2 ^ (semitones / 12)`. Amount maps nonlinearly to at most ~0.55 linear send,
  so the root tail stays audible at 100%. Enable/disable and interval changes
  crossfade (~120 ms) between voice pairs. While faded out the shifter work is
  suspended (history stays warm at negligible cost). Shimmer keeps circulating
  during bypass. The loop stays bounded.

- Ducking uses the unprocessed input with stereo linking and a ~7 ms attack.
  It uses a 50–2500 ms release and soft knee. It supplies up to ~24 dB of
  wet-only attenuation.
- Drive ("Smash") adds gain-compensated soft saturation before the reverb.
  It is separate from in-loop Character shaping.
  The ducking detector reads the input before Drive.

  Drive uses `tanh(x·g)/g` with `g = 1 + drive·8` and mild makeup.
  The Drive amount blends this curve with clean input.
  Thus, 0% is an exact bypass. The core smooths the value per sample. It matches
  the Echoform Drive curve so both effects "smash" alike.
- Bypass is tail-preserving: the loop keeps running and the audible return
  crossfades to silence, matching the spec-010 return bypass contract.

## Editor

The editor follows the Echoform Delay modal architecture.
A blocking Radix dialog traps focus and blocks outside interaction.
Escape cancels, and focus returns to the opener.
A local draft uses live `onPreview` audition.
Close commits one `onSave` and one undoable project edit.
This behavior matches spec-010.

The desktop envelope is 760x680 CSS pixels and scales with UI Size.
It uses the delay editor width-full/height-half policy.
The viewport clamps it and provides internal grid scrolling.

The header contains the RV mark, `FX Return NN`, title, Bypass, preset, and
close controls. The spatial decay visualizer follows it.
A four-column control grid uses 1.12/1.12/0.88/0.88 proportions.
The top row contains Space across two columns, Image, and Tone.
The bottom row contains Texture, Motion, Ducking, and Output.

The footer contains the
knob-interaction legend and a polite live state string such as
`Active / Chamber / Vintage / Shimmer +12`. The grid drops to two columns
around 720 px and one column around 500 px.

Controls use the shared editor-knob contract.
It includes `role="slider"`, vertical drag, Shift fine, wheel, and reset.
It also includes Arrow, Page, Home, and End keys with full ARIA values.
The table identifies controls that use logarithmic curves.
Native selects set the space model and shimmer interval.

`aria-pressed` toggles control character, early reflections, shimmer, and
bypass. The shared LinearSlider controls early/late balance.
The Motion card holds the Rate, Depth, and Shimmer knobs. It also holds the
shimmer toggle with its On/Off pill above the interval selector.

Parameters supply the visualizer data. Analyzer data and waveforms do not supply
it. The left side shows the decay readout and model/character chip. The center
shows the spatial decay field. It contains the source pulse, pre-delay marker,
room boundary, reflection nodes, shimmer particles, and scanning playhead. The
right side shows pre-delay, size, width, late, and shimmer readouts.

Models change node shapes. Size and Decay scale the field.
Diffusion and Density change node spread and count.
Vintage softens nodes, and Bloom enlarges them.
Shimmer particles rise with interval and amount.

Clear Tail briefly empties the field. Bypass desaturates and pauses it.
CSS animations render it without an rAF loop. The animations stop when the
editor unmounts and honor `prefers-reduced-motion`. The visualizer has a complete
text description with `role="img"`.

Styles live in `aetherform-reverb.css` under the `af-` prefix.
They use the same semantic theme bridge as the delay editor.
All sixteen skins derive each color from active theme tokens.
`--af-shimmer` blends the secondary color toward the strong accent.
There is no
private palette.

## Presets

The editor has seven built-in presets and a Custom label. The presets are Warm
Chamber (default), Vocal Plate, Dark Hall, Small Room, Ambient Bloom, Shimmer
Cloud, and Endless Cathedral.
Preset definitions live in `return-effects.ts`
(`applyAetherformReverbPreset`). The preset Mix percentages are 88, 82, 92, 74,
96, 98, and 100.

They stay with the editor and apply to the shared return level. A
preset load sets every field atomically in one draft update, clears Bypass, and
updates both Mix controls. Any manual sound edit flips the selector to Custom
(exact-match detection, including Mix).

## Persistence

The module serializes inside `ProjectFxBusState.module` under format version 7.
The `return-effects.ts` (`isReturnModule`) and `project-file.ts` files provide
the strict key allowlist and range validation. The serializer excludes Clear
Tail activation, visualizer phase, and modal state. Slot duplication through
`cloneProjectFxBuses` copies the complete module state.

## Verification

- `aetherform-reverb-core.test.ts` tests headless DSP:
  - mapping helpers and pre-delay at 0, 120, and 250 ms and 96 kHz,
  - RT60 slope, decay scaling, model differences, and character differences,
  - click-free Model, Size, Character, and Density changes,
  - early-off behavior, Balance endpoints, tone accumulation, and modulation bounds,
  - Width endpoints, ducking depth and release, Clear Tail, and tail-preserving Bypass,
  - Output trim and non-finite input replacement,
  - shimmer interval ratios, +12/+24 spectral lift, root retention, and zero-amount null output, and
  - shimmer early-path isolation, band limits, mono sum, and 30-second decay.
- `aetherform-reverb-performance.test.ts` — no allocation on the processing
  path. 20%-of-real-time CPU budget with shimmer off and on.
- `aetherform-reverb-processor.test.ts` — registration memoization, state
  serialization, update/clear-tail messages, disposal, identity fallbacks.
- `AetherformReverbModal.test.tsx` covers:
  - header identity and Save and Cancel behavior,
  - knob keyboard, pointer, wheel, and reset gestures,
  - ARIA reports, selectors, and toggles,
  - retained shimmer settings, Clear Tail behavior, and shared Mix synchronization,
  - preset atomicity and Custom detection, and
  - footer live state, visualizer description and state coupling, and reduced motion.
- `MixerFxSlot.test.tsx`, `return-effects.test.ts`, `project-file.test.ts` —
  selection flow, summaries, validation, presets, and round-trip persistence.

## Non-Goals

- No convolution or impulse-response loading.
- No FX-parameter automation lanes (the app has none, see spec-010).
- No per-module output metering or analyzer-driven visuals.
- No BPM-synced reverb parameters.
