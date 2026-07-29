# Code Slop

Use the file and one current sibling as the style and architecture baseline.
If repository evidence gives no valid reason for the difference, flag the candidate.

## Comments and Errors

- Remove a comment that only repeats clear code.
- If types and names state the full contract, remove internal JSDoc.
- Flag an exception handler that hides an actionable failure without a policy.
- Remove debug logs from production paths.
- Remove commented code and expired migration notes.
- Keep a comment that preserves a hidden format, lifecycle, or architecture constraint.

## Types and Control Flow

- If an available precise type expresses the contract, replace `any` or the type assertion.
- After you prove its upstream invariant and error policy, remove a duplicate guard.
- Flag a broad catch block that hides an actionable failure.
- Remove half-renamed symbols, unused imports, and abandoned artifacts.
- Remove a local state branch that duplicates the owned state model.

## Structure and Dependencies

- If a local helper duplicates the owned utility, use the owned utility.
- If an import target does not exist, remove or correct the import.
- Remove an abstraction that hides no policy or complexity.
- If a local type duplicates the owned type, use the owned type.
- Use the repository configuration path for an environment-specific value.
- If no configuration requirement exists, keep an intentional local constant.

## Style

Match imports, module extensions, quotes, indentation, punctuation, and blank lines to the file family.
If an owned formatter exists, use it.
Do not apply a personal style preference.
