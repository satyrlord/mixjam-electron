---
name: generate-mix
description: Hand-author a .mixjam file from an available sample corpus after current genre research.
disable-model-invocation: true
argument-hint: "Genre and constraints, such as melodic techno, moody, and about four minutes."
---

# Generate Mix

Create one manual `.mixjam` file under `tmp/generated-songs/`.
Do not use the MixJam generator or change product files.

The invocation text gives the genre and optional tempo, duration, mood, or sample constraints.
If the text names an existing manual mix, revise that mix.
If the text is empty, select a genre that the available corpus supports.

## 1. Confirm Inputs

- Check whether the invocation names a corpus.
- Otherwise, check whether `tmp/test-samples/` exists and contains readable WAV files.
- If no corpus is available, report the missing input and stop.
- Inventory actual filenames, roles, tempos, keys, and stereo pairs.
- For a revision, parse the current `.mixjam` file before you plan changes.

This step is complete when the inventory proves which requested constraints the corpus can support.

## 2. Research the Genre

- Search current, authoritative sources for the genre.
- Record source links in `tmp/<slug>/brief.md`.
- Record the normal tempo, duration, section arc, instrumentation, transitions, and effects.
- Reconcile each requested constraint with the corpus inventory.
- Select the closest supported choice for each unsupported constraint.

This step is complete when each brief item has current source evidence and a corpus-backed choice.

## 3. Scout the Corpus

- Create `tmp/<slug>/scout-<slug>.ts`.
- Import `decodeWav` from `src/renderer/src/backend/analysis.ts`.
- Decode each candidate before you select it.
- Calculate duration from the decoded sample count and sample rate.
- Check rhythmic candidates against the selected tempo and whole-bar duration.
- Select every role that the brief requires.
- Keep sample paths relative to the selected corpus root.

This step is complete when every selected file decodes and satisfies its documented musical role.

## 4. Compose the Mix

Before this step, read [COMPOSITION.md](COMPOSITION.md) and apply every required project rule.

- Create `tmp/<slug>/build-<slug>.ts`.
- Import each production module that `COMPOSITION.md` specifies.
- Build the project with production factories and placement functions.
- Apply the researched section arc and sample roles.
- Serialize the project with `serializeProject`.
- Parse the serialized text with `parseProject`.
- Compare the parsed project with the intended project values.

This step is complete when the round-trip preserves every intended lane, placement, return, tempo, and project value.

## 5. Write and Report

- For a revision, preserve the named mix path.
- For a new mix, select the next free `tmp/generated-songs/Agent-Manual-<Genre>-<BPM>-<NNN>.mixjam` path.
- Store that stable output path in the build script.
- Run the build script.
- Check that the output file exists.
- Run the build script again from a clean process.
- Check that the second run writes the same path and project content.
- Report the path, tempo, duration, sections, corpus, sample count, and source links.
- Report each requested constraint as met, adapted, or unsupported.

This skill is complete when the output passes both round-trips and the report accounts for every requested constraint.
