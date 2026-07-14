---
name: generate-mix
description: Generate a saved Mixer and FX test song, or revise its generator.
disable-model-invocation: true
argument-hint: "Optional: describe changes to the generator."
---

# Generate Mix

Trim the invocation text after the skill name, then take exactly one branch.

## Generate

When the trimmed text is empty:

1. From the repository root, run `npm run generate:mixer-test-song` with no
   arguments.
2. Require a successful exit, a `Created` path, and a `Seed` in the command
   output. Verify that the reported `.mixjam` file exists.
3. Report the created path and seed.

This branch is complete only when the command succeeds and the reported file
exists.

## Revise

When the trimmed text is non-empty, treat all of it as one natural-language
change request for `scripts/generate-mixer-test-song.ts`. Never reinterpret
any part as generator CLI arguments.

1. Read the generator, `scripts/generate-mixer-test-song.test.ts`, and the
   Programmatic Mixer Test Song Generator contract in
   `docs/specs/spec-011-project-save-load.md`. Inspect related APIs when the
   request changes their use. Preserve unrelated working-tree changes.
2. Implement the request in the generator. Update the focused test and spec so
   behavior, coverage, and the documented contract agree.
3. From the repository root, run, in order:
   - `npm test -- scripts/generate-mixer-test-song.test.ts`
   - `npm run typecheck`
   - `npm run lint`
   - `npm run generate:mixer-test-song`
4. Require every command to pass. Verify the real-corpus run reports a created
   file and seed and that the file exists.
5. Report the requested changes, validation results, created path, and seed.

This branch is complete only when the implementation, focused test, and spec
agree and all four checks pass against the repository's real sample corpus.
