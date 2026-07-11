# Design Critique: MixJam Bottom Workspace

## Context and assumptions

- Screen: the Player's bottom dock, containing Song Controls, Mixer, Samples,
  and FX.
- Audience: desktop music makers using mouse and keyboard, with touch and
  assistive technology still supported.
- Stage: refinement and information-architecture exploration, not a final
  visual specification.
- Focus: the BPM slider change and the proposal to put every bottom subsection
  in one tabbed workspace with vertical sliders and meters.

## Overall Impression

The bottom section is functionally legible, but it currently reads as two
different layout systems joined at a seam: persistent Song Controls plus Mixer
on the left, and tabbed Samples plus FX on the right. In the first two seconds,
the repeated Mixer faders and saturated sample bubbles compete for attention;
Song Controls reads as a small utility card rather than the master section.

The unified-tab proposal is the right structural direction. It gives the dock
one navigation model, lets each task use the full width, and removes the visual
argument between the Mixer and Sample Browser. The strongest version keeps
global song state visible in the tab header and gives every hidden workflow the
context it needs inside its own panel.

## Usability

<!-- markdownlint-disable MD013 -->

| Finding | Principle | Severity | Recommendation |
| --------- | ----------- | ---------- | ---------------- |
| The current bottom section uses persistent left panels and exclusive right tabs at the same hierarchy level. Users must learn two different ways to reveal peer workspaces. | One place, one navigation model | Major | Replace the split bottom row with one full-width tablist: Song, Mixer, FX, Samples, then future tabs. |
| Making every panel exclusive can hide context needed by another panel. FX currently relies on the visible Mixer for channel selection, while changing tabs would also hide BPM and master state. | Preserve task context | Major | Put a channel selector inside FX, retain the selected channel across tabs, and show compact read-only BPM/master status in the tab header. Clicking that status can open Song. |
| My BPM change replaced direct numeric entry with a slider-only interaction. That satisfies coarse adjustment but makes exact tempo entry slower. | Support both direct and incremental manipulation | Major | Keep the slider, but make the displayed BPM value directly editable. Arrow keys and wheel may step by 1 BPM; Shift may provide fine adjustment if fractional BPM remains supported. |
| Defaulting to Song on every mount would repeatedly displace the user's active workflow, especially during sample placement. | Remember user context | Moderate | Use Song on the first launch, then persist the last active bottom tab. Opening a channel's FX should still select FX intentionally. |
| The current Samples/FX tab buttons expose tab roles but do not implement arrow-key, Home/End, or roving-tabindex behavior. | Predictable keyboard navigation | Major | Implement the complete tab keyboard model and connect each tab to its panel with `id`, `aria-controls`, and `aria-labelledby`. |
| A full-width Mixer tab gives all 16 strips more room and removes the resize threshold that currently hides the Mixer. | Reduce mode-dependent discoverability | Positive | Let Mixer own the full panel and delete the lower-row reveal threshold; keep horizontal scrolling only when the window is genuinely too narrow. |

<!-- markdownlint-enable MD013 -->

## Visual Hierarchy

- **Focal point — Major, hierarchy:** the Mixer currently dominates through 16
  repeated full-height lines while Song Controls occupies only 168 px. That is
  incorrect when Song Controls is meant to be the default master view. One
  active full-width tab would establish a single focal task.
- **Reading flow — Moderate, grouping:** the eye moves Song Controls → Mixer →
  Samples/FX tabs → Sample Browser, even though Samples and FX are peers of the
  first two sections. Put all peer labels in one tab row and let the active
  panel supply the second-level hierarchy.
- **Emphasis — Positive:** sample bubbles are appropriately the strongest color
  objects inside the Samples panel; they represent the content users act on.
- **Proposed Song panel:** use three aligned vertical modules—BPM, Master Volume,
  and Output Level—with label and editable value above each control. Avoid
  stretching three controls across the entire viewport; group them at the
  leading edge and leave deliberate workspace rather than accidental gaps.

## Consistency

<!-- markdownlint-disable MD013 -->

| Element | Principle | Severity | Issue | Recommendation |
| --------- | ----------- | ---------- | ------- | ---------------- |
| Master Volume versus channel gain | Same quantity, same visual grammar | Major | Master gain is horizontal while every channel gain is vertical. | Use the same vertical fader primitive, value placement, unity indication, and interaction behavior for master and channels. |
| Output Level versus channel meters | Same measurement, same visual grammar | Major | The master meter is horizontal while channel meters rise vertically. | Make Output Level vertical and place it beside the Master Volume fader. |
| BPM | Orientation should communicate direction | Moderate | Horizontal BPM is not inherently wrong, but it becomes an outlier in a vertical console. | A vertical BPM fader is coherent if higher always means faster, with explicit 50/200 endpoints and an editable numeric readout. |
| Pan and FX parameters | Match control shape to data semantics | Positive | Pan is bipolar and FX parameters are well represented by rotary controls rather than linear faders. | Do not force every adjustable control to be vertical; apply the rule specifically to sliders and meters. Keep pan and rotary FX controls rotary. |
| Bottom navigation | Peer features share one container | Major | Song/Mixer are persistent regions while Samples/FX are tabs. | Use one tab component and one panel contract for every bottom subsection. |
| My previous verification | Validate systems, not isolated components | Major | I proved the BPM and Master sliders had equal width and accent color, which reinforced local consistency while missing dock-level inconsistency. | Future visual verification should compare orientation, target size, value editing, and hierarchy across Song and Mixer, not merely sibling CSS. |

<!-- markdownlint-enable MD013 -->

## Accessibility

- **Color contrast — Positive:** in Emerald, primary text on chrome is
  13.58:1, muted text on chrome is 9.67:1, primary text on the panel is
  16.24:1, and muted text on the panel is 11.57:1. These key text pairs exceed
  WCAG AA.
- **Non-text contrast — Major, perceivable controls:** Emerald accent on the
  base is 2.67:1 and border on the panel is 1.95:1. Controls that rely only on
  those pairs for boundaries or focus fall below the 3:1 non-text threshold.
  Use a lighter focus/active token or add a second high-contrast indicator.
- **Target sizes — Major, motor accessibility:** the current 32 px-high tabs,
  16 px M/S buttons, 22 px pan knob, 14 px remove action, and 16 px restore
  action miss the skill's 44-by-44 target bar. Microsoft currently describes
  40-by-40 epx as touchable and 44-by-44 epx as touch-optimized. Preserve the
  compact visuals if desired, but expand their invisible hit areas and spacing.
  See [Microsoft touch interactions](https://learn.microsoft.com/windows/apps/develop/input/touch-interactions#hit-targets).
- **Text readability — Major, legibility:** 9–11 px labels and readouts are too
  small for repeated scanning, particularly across 16 channels. Raise primary
  control labels to at least 12 px and keep secondary detail no smaller than
  11 px with adequate line height.
- **Vertical controls — Major, operability:** custom vertical faders need
  `aria-orientation="vertical"`, accurate value text, Arrow keys, Home/End,
  visible focus, and direct numeric entry where precision matters.
- **Tabs — Major, keyboard accessibility:** the unified tablist needs
  Left/Right navigation, Home/End, managed focus, and a labeled tabpanel.
- **Alternative text — Positive:** this UI is rendered with semantic DOM and
  canvas content rather than informational bitmap UI. No missing image alt text
  is apparent in the reviewed bottom section; icon-only commands still need
  accessible names.

## Self-critique of the BPM change

What worked: BPM was moved beside Master Volume, became a real range input,
kept the 50–200 contract, and remained synchronized with transport state.

What I would improve:

1. Add direct numeric editing to the visible BPM value instead of treating a
   slider as a complete replacement for precise input.
2. Design BPM, Master Volume, and Output Level as one master-control family,
   then compare that family against channel-strip controls.
3. Verify keyboard behavior, focus styling, hit targets, and non-text contrast,
   not only dimensions and color equality.
4. Evaluate the entire bottom workspace before approving a local component
   arrangement. The screenshot makes the system-level inconsistency obvious.

## What Works Well

- BPM and Master Volume are now grouped semantically, with visible values and
  accessible range inputs.
- The Mixer already establishes a useful vertical fader/meter grammar that can
  become the shared master-control primitive.
- The existing Samples/FX implementation proves that non-modal tab panels can
  preserve the Tracker above and retain panel state.
- The FX entry flow already selects a channel and opens the appropriate panel;
  that is the right cross-tab transition to retain.

## Recommended unified structure

```text
Bottom workspace (full width)
  Tab row: Song | Mixer | FX | Samples | ...       120 BPM · Master 80%
  Active tabpanel:
    Song    -> vertical BPM fader + editable value
               vertical Master Volume fader + value
               vertical Output Level meter
    Mixer   -> full-width channel strips
    FX      -> internal channel selector + chain + parameter editor
    Samples -> categories + virtualized sample browser
```

Panels should remain mounted but hidden so sample scroll position, FX
selection, and Mixer state survive tab changes. On narrow windows, the tab row
should scroll or use a labeled overflow menu rather than shrinking targets.

## Priority Recommendations

1. **Adopt one full-width bottom tab system** — this fixes the largest hierarchy
   and consistency problem and removes the lower-row reveal/hide mechanism.
2. **Create one vertical fader/meter design language** — reuse it for Master
   Volume, Output Level, and channel gain/meters; use it for BPM with explicit
   endpoints and numeric entry.
3. **Preserve cross-tab context** — add an FX channel selector, retain panel
   state, show compact global song status, and persist the last active tab after
   the first Song-default launch.
4. **Raise the accessibility floor** — 44 px hit areas, larger labels, complete
   tab keyboard behavior, vertical-slider semantics, and 3:1 non-text contrast.
