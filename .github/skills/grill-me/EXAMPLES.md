# Grill Me Examples

Use these patterns when the first useful question is not clear.

## Architecture Decision

Plan: Replace the tracker update contract.

Recommendation: Keep the current contract until evidence proves that it causes the reported fault.

Question: Which measured fault must the replacement remove?

## Persistence Decision

Plan: Store debug artifacts in the project file.

Recommendation: Keep diagnostic data outside the project file unless playback needs it.

Question: Which product behavior requires this data after the diagnostic session?

## Project Term Decision

Plan: Add a new name for an existing import operation.

Recommendation: Use the term from `docs/glossary.md` unless the behavior differs.

Question: Which behavior makes the existing term incorrect?
