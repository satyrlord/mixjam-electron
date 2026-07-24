---
name: MixJam Electron
description: A local-first sample-library tracker whose interface reads as studio hardware, with the visual identity rendered through swappable theme tokens.
colors:
  accent: "#00674F"
  accent-dark: "#004434"
  highlight: "#8FBCB2"
  bg-base: "#081715"
  bg-panel: "#051411"
  bg-lane: "#091613"
  bg-grid: "#020C0A"
  chrome: "#0F2722"
  border: "#1A4D3E"
  header-border: "#1D5C4A"
  text: "#E8F0EC"
  text-muted: "#B8D0C8"
  pill-bg: "#0C2D32"
  pill-border: "#2D6B5E"
  playhead: "#E74C3C"
  meter-green: "#34D399"
  meter-yellow: "#FBBF24"
  meter-red: "#F87171"
  transport: "#0C2D32"
  transport-active: "#00674F"
  fx-accent-1: "#22B573"
  fx-accent-2: "#22B573"
  fx-accent-3: "#22B573"
  fx-accent-4: "#22B573"
  sample-bubble-text: "#FFFFFF"
  sample-bubble-select: "#FDE047"
  sample-bubble-missing: "#FB8A7E"
typography:
  chrome:
    fontFamily: "Josefin Sans, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "Ubuntu, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
  mono:
    fontFamily: "JetBrains Mono, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.2
  body:
    fontFamily: "Ubuntu, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
  label-small:
    fontFamily: "Ubuntu, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.3
rounded:
  base: "0.22rem"
  transport: "8px"
  sample-bubble: "6px"
  module: "6px"
  rack: "14px"
spacing:
  micro: "4px"
  base: "8px"
  gap-module: "9px"
  pad-rack-y: "16px"
  pad-rack-x: "18px"
components:
  button-transport:
    backgroundColor: "{colors.transport}"
    textColor: "{colors.text}"
    rounded: "{rounded.transport}"
    size: "30px"
  button-transport-active:
    backgroundColor: "{colors.transport-active}"
    textColor: "{colors.text}"
    rounded: "{rounded.transport}"
    size: "30px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.base}"
    height: "30px"
  button-ghost-hover:
    backgroundColor: "{colors.pill-bg}"
    textColor: "{colors.text}"
    rounded: "{rounded.base}"
  pill:
    backgroundColor: "{colors.pill-bg}"
    textColor: "{colors.text}"
    rounded: "{rounded.base}"
    height: "30px"
  panel:
    backgroundColor: "{colors.bg-panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.base}"
    padding: "8px"
  sample-bubble:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.sample-bubble-text}"
    rounded: "{rounded.sample-bubble}"
    height: "24px"
  sample-bubble-selected:
    backgroundColor: "{colors.sample-bubble-select}"
    textColor: "{colors.sample-bubble-text}"
    rounded: "{rounded.sample-bubble}"
    height: "24px"
  channel-strip:
    backgroundColor: "{colors.bg-panel}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.base}"
    width: "76px"
  fx-slot:
    backgroundColor: "{colors.bg-panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.base}"
    width: "160px"
    height: "112px"
  rack-module:
    backgroundColor: "#ded6c2"
    textColor: "#2c2921"
    rounded: "{rounded.module}"
    width: "152px"
    height: "420px"
---

# Design System: MixJam Electron

## Relationship to style-guide.md

This file (`DESIGN.md`) is the **design token manifest** — it declares the concrete
colors, typography faces, radii, spacing, shadow vocabulary, and component
patterns that the CSS token system implements. It is the authoritative source for
token names and their Emerald default values.

[docs/style-guide.md](docs/style-guide.md) is the **design intent document** —
layout architecture, spacing rhythm, color philosophy, surface treatments,
interaction patterns, accessibility foundations, and theme design rules. It
describes *why* and *how* the system behaves, not the token-level defaults.

Both files are authoritative for different concerns. When adding or modifying a
visual feature, consult both: `DESIGN.md` for the token contract and defaults,
`docs/style-guide.md` for the layout, interaction, and accessibility rules.

## 1. Overview

### Creative North Star: "The Studio Rack"

MixJam is not a website that plays audio. It is a local-first piece of gear. The
Home surface gets the user from folder setup to a new, loaded, or generated
project; the Player then holds the tracker, browser, Mixer, and Master surfaces.
The Master tab holds thirteen module faceplates in a rack shell; the Mixer holds
channel strips and combined FX/Return slots on a device surface; knobs have real
pointers and value arcs, LEDs glow when a bus is live, and faders ride in
recessed rails. Depth in this interface is hardware depth, never decoration.
When a surface lifts off the page, it is because it represents something the
user can operate.

The second half of the identity is that the hardware is skinnable. Sixteen
themes ship in `public/themes/`: Emerald, Enterprise, Neon Rave, Warm Analog,
IDE, Rust Industrial, Club PA, Beton Brut, Mono, Cosmic, Neon, Vintage, Rack,
Soft, Riso, and Arcade. Each repaints the instrument — surfaces, accents, font
roles, gradients, shadows, knob faces, and corner radii — without moving a
control. Geometry is fixed and shared; identity is token-driven. Emerald is the
default, but Mono's phosphor voice, Riso's print palette, and the lighter skins
are equally native rather than bolted-on modes.

This system explicitly rejects the SaaS dashboard: no metric-card grids, no
gradients-for-the-sake-of-gradients, no glassmorphism, no corporate sheen. It
also rejects full-DAW density theater — the eJay / Sony Acid tracker model is
deliberately simple, and the chrome must stay quiet enough that a 100,000-sample
library still feels instant. The tool disappears into the task.

**Key Characteristics:**

- Dark by default; light themes (Vintage, Soft, Riso) are first-class, not afterthoughts.
- Every semantic color is a CSS custom property. Hardcoded hex is a defect.
- One primary accent action per surface. Everything else is quiet or ghost.
- Continuous surface: related controls share a rounded group background rather than each rendering as a raised bordered slab.
- Three font roles (chrome / label / mono), with bundled families first and
  explicit runtime fallbacks.
- Fixed pixel geometry at three UI Sizes (30 / 40 / 50), exposed to users as
  75%, 100%, and 125%; typography remains fixed rather than fluid.
- The root viewport never scrolls. Internal panels do.

## 2. Colors

A dark, desaturated instrument surface with one saturated accent carrying live
state — restrained by doctrine, but the doctrine is per-theme, and sixteen
themes redefine every value below.

### Primary

- **Signal Green** (`--accent`, #00674F in Emerald): The one committed color.
  Reserved for the active transport state, current selection, filled value arcs,
  and live indicators. Never used for decoration or for inactive states.
- **Deep Signal** (`--accent-dark`, #004434): The pressed and recessed companion to the accent; value-arc backing and active-state depth.
- **Pale Mint** (`--highlight`, #8FBCB2): The light-on-dark counterpart used where accent-on-dark would lose legibility, and for lane shading.

### Secondary

- **Slot Accents** (`--fx-accent-1` … `--fx-accent-4`, #22B573 in Emerald): Four
  per-slot accents that map FX slots to channel-strip sends 1:1 by color. Themes
  with a genuine multi-accent system (Arcade, Neon, Neon Rave, Riso, IDE) ship
  four distinct values; single-voice themes such as Mono deliberately repeat one.
  Any missing slot falls back to `--accent`.

### Tertiary

- **Rack Family Chips** (fixed, unthemed): GAIN #c9ccd4, SAT #ff8a4e, EQ #62aee0,
  DYN #f4c14f, IMG #7fd69b, METER #9aa0ab. These tint the Master Bus rack's chips,
  knob value arcs, and gain-reduction LEDs. A bypassed module's chip goes neutral
  gray (#7c7f86).
- **Sample Slot Palette** (`--palette-0` … `--palette-7`): Eight category colors
  for sample bubbles, plus one unsorted gray (`--palette-unsorted`, #555E6A).
  Bubble ink is computed per slot for contrast, not chosen by hand.

  | Slot | Category |
  | ---- | -------- |
  | 0 | Drums / Percussion |
  | 1 | Loop |
  | 2 | Bass |
  | 3 | Keys / Guitar / Chords / Piano |
  | 4 | Synth / Lead |
  | 5 | Voice / Vocal / FX / Vox |
  | 6 | Arp |
  | 7 | Pad / Atmosphere / Xtra / Texture |
  | 8 | Unsorted (fallback) |

### Neutral

- **Base** (`--bg-base`, #081715): The app floor.
- **Panel** (`--bg-panel`, #051411): Sidebars, toolbars, mixer banks — the second, deeper neutral layer beneath content.
- **Lane / Grid** (`--bg-lane` #091613, `--bg-grid` #020C0A): Tracker placement area and its beat grid.
- **Chrome** (`--chrome`, #0F2722): Header and footer surface.
- **Ink** (`--text` #E8F0EC, `--text-muted` #B8D0C8): Primary and secondary text. The muted tone is deliberately high — muted must stay readable, not decorative.
- **Structure** (`--border` #1A4D3E, `--header-border` #1D5C4A): Hairlines only.
- **Control** (`--pill-bg` #0C2D32, `--pill-border` #2D6B5E): The quiet surface behind pills, ghost-button hover, and grouped chrome.

### Signal

- **Playhead** (`--playhead`, #E74C3C): The 2px transport line. Never reused for anything else.
- **Meter Ramp** (`--meter-green` #34D399, `--meter-yellow` #FBBF24, `--meter-red` #F87171): Level metering only.
- **Bubble States** (`--sample-bubble-select` #FDE047 selection, `--sample-bubble-missing` #FB8A7E missing-file hazard).

### Color Named Rules

**The Token Rule.** Every semantic color comes from a CSS custom property.
Local literals are permitted in exactly three places: invariant neutral
overlays, selection ink, and canvas safety fallbacks. A hex code anywhere else
is a bug, and it will break fifteen of the sixteen themes.

**The One Voice Rule.** Play/Pause is the sole filled accent action on any
surface. Every other command is quiet or ghost, earning an accent-tinted
surface only on hover, focus-visible, or active. If two things on a screen are
shouting in accent, one of them is wrong.

**The Hardware Exception Rule.** The Master Bus rack is fixed hardware. Its
faceplate finishes, family chip colors, and meter faces are constants scoped to
the rack, exactly like physical gear. Everything *around* the rack — panel
chrome, scrollbars, focus rings, text outside faceplates — stays token-driven.
The exception is the rack, not a license.

## 3. Typography

**Chrome Font:** Josefin Sans (`--font-chrome`) — header, brand, chrome UI
**Label Font:** Ubuntu (`--font-label`) — body copy, labels, buttons
**Mono Font:** JetBrains Mono (`--font-mono`) — ruler, timer, bar numbers, dB readouts, LCD text

**Character:** Three roles, one job each. A geometric sans for the shell, a
humanist sans for everything you read while working, and a mono for anything
that represents a measured value. The pairing works on a contrast axis, and
each theme may substitute its own bundled families for all three (Special
Elite, Space Grotesk, Space Mono, Orbitron, IBM Plex Sans and others ship in
`public/fonts/`). All primary font files are bundled — no CDN, no Google Fonts,
and no network dependency. Runtime stacks keep an explicit fallback after the
theme family so a missing font resource does not collapse into browser-default
typography.

### Hierarchy

Product UI, so the scale is fixed in pixels and tight. There is no fluid
type and no clamp() anywhere in this system.

- **Chrome / Brand** (400, ~16px, 1.4): Header brand and shell labels. Uppercase is a per-theme decision applied via `[data-theme-key]`, never a color-token concern.
- **Action Label** (400, 13px minimum, 1.4): Buttons, menu items, channel labels. 13px is a floor, not a target.
- **Status / Helper** (400, 12px minimum, 1.4): Tooltips, hints, secondary status.
- **Lane Name** (400, 11px, 1.3): The densest text in the app; truncates with ellipsis and a tooltip.
- **Mono Readout** (400, 12px, 1.2): Timer (`00:00.0`), bar numbers, compact
  Mixer headers (`01`), dB values (`-2 dB`, `−∞ dB`), FX slot summaries.

### Typography Named Rules

**The Tokenized Typography Rule.** Every visible glyph — labels, buttons, links,
chrome, status text, tooltips, menu items, placeholder text, and input values —
must resolve through a font-family token. The selected bundled theme family is
first in the stack, followed by the explicit runtime fallback. Components must
not rely on browser-default typography or introduce a private font family.

**The Measured-Value Rule.** If a number represents something the audio engine
measured — time, level, tempo, position, gain reduction — it renders in mono.
If it is a label, it does not.

## 4. Elevation

Elevation is delegated entirely to the theme. There is no cross-theme depth
doctrine beyond the token contract: each theme's `depth` block defines the full
vocabulary, and a theme may legitimately be flat, deeply shadowed, neumorphic,
beveled, or glowing. Emerald sets `shadow-lane`, `shadow-pill`,
`shadow-sample-bubble`, `shadow-meter`, and `shadow-mixer-slot` to `none` while
still carrying a deep `shadow-mixer-panel` and an LED glow; Rack, Beton Brut,
and Soft make very different choices from the same keys. Components must read
the tokens and must never hardcode a shadow or gradient of their own.

### Shadow Vocabulary

Every theme defines all of these; values below are Emerald's.

- **Mixer panel** (`--shadow-mixer-panel`: `0 8px 20px rgba(0,10,6,0.55)`): The channel-bank and FX-bank slabs lifting off the device surface.
- **Mixer slot** (`--shadow-mixer-slot`: `none`): Channel strips and FX cards. Flat in Emerald.
- **Mixer LED** (`--shadow-mixer-led`: `0 0 5px rgba(34,181,115,0.6)`): Glow behind status and FX power LEDs. `currentColor` makes the LED glow in its own slot accent.
- **Transport** (`--shadow-transport`: `0 1px 2px rgba(0,0,0,0.35)`; active: `0 1px 3px rgba(0,0,0,0.4)`): The only chrome button family permitted its own resting shadow.
- **Bubble text** (`--shadow-sample-bubble-text`: `1.5px 1.5px 2px rgba(0,0,0,0.55)`): Applied only when the computed bubble ink is white.
- **Rack shell** (fixed, unthemed): Deep drop shadow under the 14px rack slab; faceplates carry a hairline dark border and inner top highlight.

### Surface Gradient Vocabulary

- `--gradient-header`, `--gradient-ruler`, `--gradient-lane`: shell shading over the flat surface tokens.
- `--gradient-transport` / `--gradient-transport-active`: idle and active transport faces.
- `--gradient-mixer-device`: the texture behind the Mixer panels (scanlines, starfield, halftone, grain, or `none`).
- `--gradient-mixer-panel`: the panel surface layered over `--bg-panel`.
- `--gradient-sample-bubble`: canvas-parsed bubble gloss; stops must be space-free colors such as `#RRGGBBAA`.

### Elevation Named Rules

**The No-Raised-Idle Rule.** An idle button never renders as a raised bordered
slab. Related controls share one subtle rounded group background instead. If a
row of buttons reads as a row of separate chips at rest, regroup it.

**The Canvas-Parity Rule.** The lane canvas parses `--shadow-sample-bubble`,
`--border-sample-bubble`, and `--gradient-sample-bubble` as strings in fixed
formats (`"<x>px <y>px <blur>px <color>"`, `"<width>px <color>"`, or `"none"`).
A bubble must look identical in the Tracker canvas, the browser grid, and the
drag image. Change one, change all three.

## 5. Components

### Buttons

- **Shape:** Softly squared (`--radius`, 0.22rem in Emerald). Transport uses its own rounder corner (`--radius-transport`, 8px).
- **Transport:** The one filled accent family. Play is accent-colored when
  stopped, Pause when playing; the face uses `--gradient-transport` /
  `--gradient-transport-active` over the `--transport` / `--transport-active`
  solids, with glyph contrast derived automatically into `--on-transport`.
- **Ghost / Quiet:** Transparent at rest with `--text-muted` ink. Hover, focus-visible, and active paint an accent-tinted `--pill-bg` surface. This is the default for every non-transport command.
- **Sizing:** Square controls take the UI Size token exactly (30x30, 40x40, or
  50x50). Users see those geometry tokens as 75%, 100%, and 125%. Text-bearing
  controls use the selected size as a minimum cross-axis size and keep
  content-driven width. Never mix target sets within one UI Size.

### Sliders and Faders

Project-owned `LinearSlider` over Radix Slider. Canonical visual: recessed
rectangular rail, accent value fill, low-profile rectangular handle. Hit target
uses selected UI Size; painted handle scales with `--ui-scale` only. Horizontal
sliders rotate the same handle geometry. See [docs/style-guide.md](docs/style-guide.md)
for full interaction, keyboard, and ARIA rules.

### Rotary Controls

Shared project-owned SVG: 270-degree range track, high-contrast value arc, inset
cap, short pointer. Size changes dimensions only; never substitute a CSS-only
circle. Unipolar fills from minimum; bipolar fills outward from center. See
[docs/style-guide.md](docs/style-guide.md) for full interaction, keyboard, ARIA,
and pan right-click-cycle rules.

### Panels and Containers

- **Corner:** `--radius`. **Background:** `--bg-panel` under `--gradient-mixer-panel`. **Shadow:** `--shadow-mixer-panel`. **Border:** `--border` hairline at `--border-width`.
- **Header grammar:** small uppercase mono header, count on the left ("4 × FX Slots", "N × Channels"), status LED plus state on the right.
- **No enclosing outer panel** where headings, spacing, and surface contrast already establish grouping (Home's workflow cards).

### Home and project flow

See [docs/style-guide.md](docs/style-guide.md) for the complete Home and Player
layout architecture, state-adaptive workflow rules, and component placement.
Theme choice uses the header selector only (all sixteen themes); geometry is
fixed, identity is token-driven.

### Tracker shell and browser

See [docs/style-guide.md](docs/style-guide.md) for the full Player frame layout,
Browser/Tracker split, Middle Strip zones, Bottom Workspace tab behavior, and
resize-handle patterns.

### Sample Bubbles

The signature component. A bubble is the same object everywhere it appears —
Tracker canvas, browser grid, drag image, any future surface — at the same
height (24 / 33 / 41px by UI Size), the same width, the same treatment.

- **Fill:** the category slot color (`--palette-0` … `--palette-7`, unsorted
  `--palette-unsorted`). **Ink:** computed per slot for contrast, never picked by
  hand. **Radius:** `--radius-sample-bubble` (6px), parsed as pixels by the
  canvas.
- **Case and weight** follow `--sample-bubble-case` and `--sample-bubble-font-weight`.
- **States:** selected (`--sample-bubble-select`), missing file (`--sample-bubble-missing`, drawn as hazard stripes mixed toward black).

### Channel Strip and FX Slot

- **Channel strip:** 76px wide at UI Size 30. Its compact selectable header
  visibly shows only the zero-padded derived number (`01`); the lane-owned name
  remains in its tooltip and accessible text. A 2x2 group of four send dials,
  each tinted with its matching slot accent, precedes the fader, segmented
  dry-RMS meter column, and mono dB readout. Pan is controlled only in the lane
  header.
- **FX slot:** 160x112px at UI Size 30. Header carries the mono slot number, the
  module name, and a round power LED tinted with the slot accent — on a populated
  slot the LED *is* the toggle (`aria-pressed`, unlit when bypassed). Body holds
  Edit (cog, slot-tinted), the square limiter toggle, and a Mix rotary. Foot is a
  one-line mono summary. The FX picker and editor are registry-driven; the
  current modules are Echoform Delay and Aetherform Reverb.
- **Bypass:** dims the container to half opacity and desaturates. It stops new input but lets the current tail finish.

### Master Bus Rack

Thirteen module faceplates in a horizontal scrollport inside a rounded rack
slab (14px radius, dark vertical gradient, 16px/18px padding, 9px gaps, deep
drop shadow, decorative screw-head corners). Faceplates are 152px wide (Bus
Compressor 184, meters 196) by 420px tall at 6px radius, in one of eight fixed
finishes — cream, graphite, oxblood, steel, sand, sage, night, meter — each
defining face gradient, ink, dim ink, knob cap, and pointer color. Reorderable
processor anatomy runs top to bottom: grip + ordinal + power LED, family chip +
module name, control grid, optional GR LED row, hairline, description block.
The pinned Gain Stage keeps its ordinal and Trim control but has no grip or
power LED; pinned meters omit both controls. Rack knobs are the shared rotary
at 46px (standard) or 74px (large).

| Finish | Face | Ink | Cap | Pointer | Used by |
| --- | --- | --- | --- | --- | --- |
| cream | #ded6c2 to #cdc4ac | #2c2921 | #3b372d/#232019 | #efe8d3 | Gain Stage, Bus Comp |
| graphite | #33363d to #2a2d33 | #e7e7e3 | #1c1d22/#101114 | #eceae4 | Soft Clip, Maximizer, MB Comp |
| oxblood | #71413a to #5c332d | #f4e8de | #2e1d1a/#1e1210 | #f2dcc9 | Tube Sat |
| steel | #4e6b79 to #405865 | #eaf1f4 | #233541/#16242d | #d8edf6 | Trim EQ, Lift EQ |
| sand | #c7ae86 to #b39a72 | #332a1b | #40372a/#292317 | #f4e7c8 | Tape Sat |
| sage | #68755f to #57634d | #eef2e8 | #293024/#1a1f17 | #e3edd5 | Stereo Img |
| night | #26272e to #1c1d23 | #efecf1 | #131317/#0a0a0d | #f2e4e4 | Limiter |
| meter | #2c2d33 to #212227 | #e7e7e3 | — | — | Input and Output meters |

### FX module editors

The FX picker and editor resolve their choices from the module registry, which
currently provides Echoform Delay and Aetherform Reverb. See
[docs/style-guide.md](docs/style-guide.md) for the full editor-modal
specification. Mix is the shared FX Return level, not duplicated in DSP state.

### Modals

Modals are a last resort, not a first thought. When one is genuinely required,
it uses the project Dialog abstraction: focus trap, Esc/close/backdrop dismiss,
global hotkey blocking, and return-focus restoration on close. The Tracker and
transport are disabled beneath it. Enter confirms and Esc cancels unless the
owning spec says the focused control consumes that key. OS media keys remain
live through the Media Session API.

### Component Named Rules

**The Shared-Primitive Rule.** If a control already exists as a project-owned
primitive — `LinearSlider`, the rotary SVG, the Dialog — a feature must use it.
Assembling a one-off from Radix parts or CSS is prohibited, no matter how small
the difference seems.

**The Disjoint-Rectangle Rule.** No interactive container may overlap another.
Every hit-testable rectangle is disjoint: no z-index fights, no invisible
catch-basins over other controls, no stacked interactive surfaces sharing
pixels.

## 6. Do's and Don'ts

### Do

- **Do** read every color from a theme token. Add a new semantic need to `ThemeColors` and to all sixteen theme JSONs, then use it.
- **Do** keep the root viewport free of scrollbars. Every shell view fits 1920x1080 exactly; internal panels (lane list, browser grid, Mixer strips, FX containers) scroll instead.
- **Do** use fixed pixel geometry from the UI Size tokens (30 / 40 / 50, shown as
  75% / 100% / 125%). Square controls take the token exactly; text-bearing
  controls take it as a minimum cross-axis size.
- **Do** hold transitions to 150–250ms. Users are in flow.
- **Do** give every interactive component its full state set: default, hover, focus-visible, active, disabled, and where applicable loading, selected, and bypassed.
- **Do** honor `prefers-reduced-motion: reduce` — the scan spinner and locate-in-browser flash become static indicators and transitions are removed.
- **Do** verify a change against all sixteen themes, light ones included. Vintage, Soft, and Riso are light; a change that only reads on dark is unfinished.
- **Do** keep `--text-muted` genuinely readable. Muted is a hierarchy signal, not a license for low contrast.

### Don't

- **Don't** hardcode a color, shadow, gradient, or radius. Invariant neutral overlays, selection ink, and canvas safety fallbacks are the only exceptions.
- **Don't** build the SaaS-dashboard aesthetic PRODUCT.md rejects by name: no metric-card grids, no gradients-for-the-sake-of-gradients, no glassmorphism, no corporate sheen.
- **Don't** reach for full-DAW complexity. No piano rolls, no automation lanes, no plugin hosting. The eJay / Sony Acid model is the point.
- **Don't** render idle buttons as raised bordered slabs. Group them on one shared rounded surface.
- **Don't** put a second filled accent action on a surface that already has Play/Pause.
- **Don't** rely on browser-default typography. Placeholder text and input values use the same tokenized font stacks as the rest of the surface.
- **Don't** use fluid typography. No `clamp()` headings; this is product UI at a fixed minimum resolution.
- **Don't** overlap interactive containers or fight with z-index.
- **Don't** invent hardware that no spec calls for. The reference board governs structure and density only — no invented screws, tape labels, or fake wear on the Mixer.
- **Don't** apply full-saturation accent to inactive or disabled states.
- **Don't** use `border-left` or `border-right` greater than 1px as a colored accent stripe on any card, list item, or callout.
- **Don't** animate for decoration. Motion here conveys state change, feedback, loading, or reveal — nothing else.
