# Dead Code Audit Reference

## Evidence Paths

Check every path that can apply to a finding:

- direct symbol, export, and file references
- Electron main, preload, renderer, and worker entrypoints
- React component references and conditional element use
- IPC channels and `contextBridge` API members
- reflection, dynamic imports, and computed property access
- serialization and deserialization contracts
- state selectors and subscriptions
- tests, fixtures, generated artifacts, and configuration files
- CSS names in source files and template strings

Classify a tool finding as a false positive when one of these paths proves live use.

Recommend the narrowest suppression only when the same false positive can recur.

## Deletion Standard

Delete a finding only when all applicable evidence paths prove its absence.

Do not delete when one path remains unresolved. Report the unresolved path and its smallest next check.

## Validation Sequence

After each edit, run these checks in this order:

1. Search for the removed symbol, file, and export.
   Complete this check when no unintended reference remains.
2. Run the narrowest test for the owning module or entrypoint.
   Complete this check when the test passes.
3. Run `npm run typecheck`.
   Complete this check when the command passes.
4. Run `npm run lint`.
   Complete this check when the command passes.
5. Run `npm run fallow` after the final cleanup edit.
   Complete this check when the command passes and the removed findings do not return.

If a command fails, preserve unrelated code. Report the exact failure and the smallest next check.

## Reporting Contract

Report these fields for every finding:

- path and symbol
- classification as live, false positive, removed, or unresolved
- direct evidence for reachability or absence
- validation commands and results
- remaining uncertainty
