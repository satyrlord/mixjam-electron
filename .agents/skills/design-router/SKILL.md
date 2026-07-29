---
name: design-router
description: Select one bundled MixJam theme before you create or change the interface.
disable-model-invocation: true
---

# Design Router

Select one bundled MixJam theme before you create or change the interface.

## Route

1. Extract the requested mood, contrast, surface depth, type style, and light preference.
   Finish when each stated preference has one recorded value.
2. If the user names a bundled theme, select its `public/themes/<key>.json` file.
   Finish when the selected name and key match the file contents.
3. If the user names no theme, use [CATALOG.md](CATALOG.md) to select one theme.
   Finish when one catalog row matches the recorded preferences.
4. Read the selected theme JSON file completely.
   Finish when you know its colors, palette, fonts, depth, radii, borders, and bubble text rules.
5. Read [DESIGN.md](../../../DESIGN.md) and [docs/style-guide.md](../../../docs/style-guide.md) completely.
   Finish when the planned design follows both authorities.
6. Record the selected theme and the selection reason before you change the interface.
   Finish when another person can trace the choice to the user request or catalog.
7. Keep component dimensions and layout independent from the selected theme.
   Finish when owned theme tokens express the primary theme and recorded overrides.
8. If the user requests a hybrid, treat the second style as an explicit user override.
   Finish when the record separates the primary theme from each override.
9. Verify the result with the repository `verify` skill.
   Finish when the built Electron interface passes the applicable visual and interaction checks.

## Completion Criterion

Routing is complete when the work names one primary theme and records all user overrides.
The result must follow the theme JSON file, `DESIGN.md`, and `docs/style-guide.md`.
