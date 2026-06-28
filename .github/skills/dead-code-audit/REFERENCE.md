# Dead Code Audit Reference

## Deletion Standard

Delete a finding only when all of the following are true locally:

- no static references remain
- no framework entrypoint or config file needs it
- no dynamic lookup, reflection, or serialization contract relies on it
- no nearby test or generated artifact expects it

If any one of those points is unresolved, stop and report instead of deleting.

## False Positive Checklist

Treat a finding as alive when it is used through one of these paths:

- React component references, JSX element usage, or conditional rendering
- JSON serialization and deserialization contracts
- reflection, dynamic imports, or template literal access
- Build entry files (Vite entry, worker entry points)
- test-only or fixture-only reachability that the scan intentionally excludes
- Zustand store selectors or subscriptions
- CSS class name references that appear in template strings
