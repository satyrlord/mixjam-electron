# Composition Reference

Use this reference only during the composition step.

## Production Modules

Import these current modules from the build script.

- `src/renderer/src/lib/arrangement.ts` owns `placeSampleOnLane` and `placementDurationTicks`.
- `src/renderer/src/backend/analysis.ts` owns `decodeWav`.
- `src/shared/sample-palette.ts` owns `sourceGroupFromRelpath` and `sourceGroupSlot`.
- `src/renderer/src/engine/transport.ts` owns `TICKS_PER_BAR` and `tickDurationSeconds`.
- `src/renderer/src/project/project-file.ts` owns `serializeProject` and `parseProject`.
- `src/renderer/src/project/project-state.ts` owns the `createDefault*` project factories.
- `src/renderer/src/engine/return-effects.ts` owns the return module factories.

Do not copy production logic into the build script.
If an export moved, use `rg` to find its current production module.

## Project Rules

- Use production factories for lanes, buses, returns, and master state.
- Give each placement a unique identifier.
- Use forward slashes in each sample path.
- Use one shared duration for placements with the same sample reference.
- Use the selected tempo as `nativeBPM` for bar-locked loops.
- Use `null` as `nativeBPM` for natural-rate one-shots.
- Keep each lane monophonic unless the current production model changes.
- Omit generator metadata from a manual mix.
- Treat `parseProject` as the project schema authority.

## Arrangement Checks

Use the genre brief as the musical authority.
Do not apply fixed genre values that conflict with current research.

- Put section changes on documented phrase boundaries.
- End each riser at its target section boundary.
- Start each impact or down-sweep at its target boundary.
- Keep one bass source active at one time.
- Preserve space before major section changes.
- Keep kick and bass sends dry unless the brief gives a different rule.
- Use stereo pairs only when the corpus inventory proves the pair.
- Make the final placement end at the intended project end.

Measure each arrangement check in the build script.
Report deliberate deviations with the matching research source.
