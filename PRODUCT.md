# Product

## Register

product

## Platform

Electron desktop

## Users

MixJam is for bedroom producers and hobbyists with large local sample collections.
These collections can contain 35 GB or more and 100,000+ samples across hundreds of folders.
Users select a Sample Folder and then search and preview sounds.
They drag sounds into lanes, change the arrangement and mix, and save the project.

Experienced producers are a secondary audience.
They can use MixJam instead of a full DAW for suitable tasks.
MixJam uses a deliberately simple eJay / Sony Acid tracker model.

## Product Purpose

MixJam Electron is a local-first sample-library browser and tracker. It keeps a
User Folder for projects and exports and a Sample Folder for the library. The
library syncs and analyzes in the background.
Users can search, filter, tag, preview, and place samples.
The UI does not load the full collection.

The Player arranges samples on lanes with lane-owned gain, pan, mute, solo, and
four sends. Four fixed FX returns, the Master Bus chain, project save/load, and
the analyzed-sample MixJam generator complete the working loop. Saved `.mixjam`
files preserve project state while samples remain references inside the granted
folder.

Success means a user can open the app and prepare or restore the folders.
The user can quickly find a sound, build an arrangement, and hear stable playback.
The user can later restore the same visual and audio state.

## Positioning

MixJam is a local-first tracker that stays quick and understandable when the
sample library grows from 100 files to 100,000.

## Brand Personality

Focused, tactile, underground.
The interface must feel like music software made by a musician.
It stays quiet around the work and precise around controls.
The active theme carries the identity.

Sixteen switchable themes change the palette, typography, depth, and hardware
finish without changing the workflow geometry. The default surface is dark,
but light and high-contrast skins are first-class options.

## Anti-references

- Not a full DAW. No piano rolls, automation lanes, plugin hosting, audio-to-
  MIDI conversion, or routing maze.
- Not a SaaS dashboard. The core surface has no metric-card grid, cloud account,
  collaboration layer, or corporate workflow language. The optional Enterprise
  theme is a skin experiment, not the product's default register.
- Not a packaged browser product.
  Electron loads the renderer from the `app://bundle` origin.
  The renderer uses local folder handles.
  There is no browser deployment, CDN, or cloud sync.
- Not decorative studio cosplay. Hardware depth, meters, knobs, LEDs, and rack
  finishes earn their place by explaining an audio control or state.

## Design Principles

1. **Performance is the feature.** SQLite filtering, virtualized sample lists,
   worker-owned data access, and windowed UI requests protect the exploratory
   workflow at library scale.

2. **Local data has clear boundaries.** User and Sample Folders are explicit
   capabilities. Relative paths reference samples inside a granted folder.
   The UI never depends on absolute paths or shell access.

3. **The surface is continuous.** Related controls share quiet groups and
   panels. Play/Pause is the main filled action. Other commands stay calm until
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
focus, keyboard value changes, and unit-aware value text. Square library and
management actions use the selected 30x30, 40x40, or 50x50 UI Size target.
text-bearing actions use the selected value as their minimum height.

Reduced-motion preferences remove or simplify decorative state transitions and
visualizer motion. The supported renderer content area is 1920x1080. Smaller
windows receive a clear unsupported-resolution notice instead of a broken
partial shell. Theme fonts are bundled and selected through tokens, with
explicit runtime fallback stacks for missing font resources.
