# Add Feature Reference

Use this reference to select a document owner and decide whether a choice needs lasting documentation.

## Document Ownership

- Feature behavior and acceptance criteria belong in the owning `docs/specs/spec-NNN-name.md` file.
- Architecture and process rules belong in `docs/architecture.md`.
- Data models and schemas belong in `docs/data-model.md`.
- Query formats and compilation rules belong in `docs/query-schema.md`.
- Library scan rules belong in `docs/indexing.md`.
- Audio engine decisions belong in `docs/audio-engine.md`.
- Shared project terms belong in `docs/glossary.md`.
- Design tokens and component patterns belong in `DESIGN.md`.
- Design intent and interaction rules belong in `docs/style-guide.md`.
- A lasting trade-off belongs in its specification or domain document.

Create a new numbered specification only when no existing specification owns the behavior. This project does not use separate architecture decision records.

## Lasting Decision Test

Record a choice when all three conditions apply:

- Reversal would require costly work.
- The choice would surprise a future maintainer without context.
- The team selected the choice from meaningful alternatives.

Record the context, selected choice, and reason. Add options, consequences, or status only when they affect future work.

## Glossary Test

Use `docs/glossary.md` only for a term that spans multiple specifications or work areas.

Select one preferred term. Add relationships or ambiguity notes only when they prevent likely misuse.

## Unresolved Choices

Ask the user when an unresolved choice changes the scope or contract. Continue when existing documents answer the choice.

## Local Comment Test

Add a local comment when a hidden format or timing fact can cause an incorrect implementation.

Do not add commented code or unresolved `TODO` text.
