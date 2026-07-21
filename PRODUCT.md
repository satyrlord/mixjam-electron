# Product

## Register

product

## Platform

web

## Users

Bedroom producers and hobbyists with large local sample collections (35 GB or
more, 100,000+ samples across 850+ folders). They make beats at home, browse by
category and tag, and arrange samples in a tracker. The workflow is
exploratory: find sounds, drop them into lanes, shape the mix, and save the
project for another session.

The app is also usable by experienced producers who want a focused, skin-able
alternative to a full DAW, provided they accept the deliberately simple eJay /
Sony Acid tracker model.

## Product Purpose

MixJam Electron is a sample-library browser and tracker that scales to massive
local collections without slowing down. Users browse, search, filter, and tag
samples, then arrange them on lanes in a tracker-style Player with per-lane
gain, pan, sends, and four return FX buses. Projects save as versioned JSON
files referencing samples by relative path.

Success means the user can open the app, find sounds fast, build an arrangement,
and hear it play back with sample-accurate timing — all inside a visually
coherent, theme-able interface that stays responsive at scale.

## Positioning

A tracker that handles 100,000 samples as smoothly as it handles 100. Every
other choice — SQLite-backed filtering, virtualized rendering, no embedded
audio, no web deployment — serves that one claim.

## Brand Personality

Sleek, focused, underground. The tool gets out of the way. Dark by default,
with 16 switchable themes that change the visual identity without changing the
layout. The personality lives in the themes, not in decorative chrome. No
cute mascots, no onboarding wizards, no corporate sheen. It feels like
software made by someone who makes music.

## Anti-references

- Not a full DAW. No Ableton Live, FL Studio, or Logic Pro complexity. No piano
  rolls, no automation lanes, no plugin hosting, no audio-to-MIDI.
- Not corporate or enterprise software. No Jira, no Salesforce, no SaaS-dashboard
  aesthetic. No gradients-for-the-sake-of-gradients, no glassmorphism, no
  metric-card grids.
- Not a web app that happens to run in Electron. The renderer loads from
  `app://bundle`; there is no browser deployment, no CDN, no cloud sync.

## Design Principles

1. **Performance is the feature.** A 100,000-sample library must feel instant.
   SQLite filtering, virtualized rendering, and worker-owned data access are
   non-negotiable.

2. **Continuous surface, not isolated islands.** Related controls share subtle
   rounded group backgrounds. Idle buttons do not render as raised bordered
   slabs. One primary accent action per surface.

3. **Theme tokens, not hardcoded colors.** Every semantic color comes from CSS
   custom properties. Themes define the palette; the layout does not change.
   Dark by default, light supported.

4. **No scrollbars on the main view.** Every shell view fits within the viewport.
   Internal panels scroll; the root does not.

5. **Sample bubbles are identical everywhere.** Same height, width, and visual
   treatment in the tracker canvas, browser grid, drag images, and every future
   surface.

6. **No overlapping control containers.** Every hit-testable rectangle is
   disjoint. No z-index fights, no invisible catch-basins over other controls.

## Accessibility and Inclusion

The app uses Radix UI primitives for keyboard navigation, focus management,
portal behavior, and ARIA attributes. Theme fonts are bundled and applied to
every text-bearing element — no system font fallbacks. The minimum viewport is
1920x1080 renderer content area; below that, a clear notice explains the
requirement.

No specific WCAG level is claimed, but the interaction patterns (focus
trapping in modals, arrow-key tab navigation, visible focus indicators) follow
established accessibility practice.
