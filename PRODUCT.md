# Product

## Register

product

## Platform

web

## Users

MixJam is for bedroom producers and hobbyists who work with large local sample
collections, often 35 GB or more and 100,000+ samples across hundreds of
folders. They use it at home in an exploratory loop: choose a sample folder,
search and preview sounds, drag sounds into lanes, shape the arrangement and
mix, then save the project for another session.

Experienced producers are a secondary audience. They can use MixJam as a
focused, skin-able alternative to a full DAW when the deliberately simple
eJay / Sony Acid tracker model is enough for the job.

## Product Purpose

MixJam Electron is a local-first sample-library browser and tracker. It keeps a
User Folder for projects and exports and a Sample Folder for the library. The
library syncs and analyzes in the background so users can search, filter, tag,
preview, and place samples without loading the full collection into the UI.

The Player arranges samples on lanes with lane-owned gain, pan, mute, solo, and
four sends. Four fixed FX returns, the Master Bus chain, project save/load, and
the analyzed-sample MixJam generator complete the working loop. Saved `.mixjam`
files preserve project state while samples remain references inside the granted
folder.

Success means a user can open the app, prepare or restore their folders, find a
sound quickly, build a playable arrangement, hear it with stable timing, and
return to the same project later without losing the visual or audio state.

## Positioning

MixJam is a local-first tracker that stays quick and understandable when the
sample library grows from 100 files to 100,000.

## Brand Personality

Focused, tactile, underground. The interface should feel like a piece of music
software made by someone who makes music: quiet around the work, precise where
control matters, and willing to let the active theme carry the identity.

Sixteen switchable themes change the palette, typography, depth, and hardware
finish without changing the workflow geometry. The default surface is dark,
but light and high-contrast skins are first-class options.

## Anti-references

- Not a full DAW. No piano rolls, automation lanes, plugin hosting, audio-to-
  MIDI conversion, or routing maze.
- Not a SaaS dashboard. The core surface has no metric-card grid, cloud account,
  collaboration layer, or corporate workflow language. The optional Enterprise
  theme is a skin experiment, not the product's default register.
- Not a browser product that happens to be packaged. The renderer is loaded
  from Electron's `app://bundle` origin and works against local folder handles;
  there is no browser deployment, CDN, or cloud sync.
- Not decorative studio cosplay. Hardware depth, meters, knobs, LEDs, and rack
  finishes earn their place by explaining an audio control or state.

## Design Principles

1. **Performance is the feature.** SQLite filtering, virtualized sample lists,
   worker-owned data access, and windowed UI requests protect the exploratory
   workflow at library scale.

2. **Local data has clear boundaries.** User and Sample Folders are explicit
   capabilities. Samples are referenced by relative path inside a granted
   folder; the UI never depends on absolute paths or shell access.

3. **The surface is continuous.** Related controls share quiet groups and
   panels. Play/Pause is the main filled action; other commands stay calm until
   hover, focus, or an active state gives them a reason to speak.

4. **Project state has one owner.** Tracker lanes own their Mixer values and
   stable identities. The saved project is the source of truth for arrangement,
   Mixer, FX, and generator state.

5. **Themes change identity, not geometry.** Semantic colors, depth, fonts,
   sample-bubble styling, and FX accents come from theme tokens. Shared controls
   retain the same interaction and layout contract across all skins and UI
   Sizes.

6. **The app stays in the task.** The root viewport remains contained while
   internal work areas scroll or resize. Empty, loading, syncing, error, bypass,
   and missing-sample states explain what the user can do next.

## Accessibility & Inclusion

No specific WCAG level is claimed. The app uses project-owned wrappers around
Radix primitives for keyboard navigation, focus management, portals, dialogs,
menus, tabs, tooltips, and ARIA state. Interactive controls expose visible
focus, keyboard value changes, and unit-aware value text; larger library and
management actions use the project's 44px target contract.

Reduced-motion preferences remove or simplify decorative state transitions and
visualizer motion. The supported renderer content area is 1920x1080; smaller
windows receive a clear unsupported-resolution notice instead of a broken
partial shell. Theme fonts are bundled and selected through tokens, with
explicit runtime fallback stacks for missing font resources.
