---
name: run-quality-gate
description: Runs repository gates when the user requests verification, release readiness, failed-gate repair, or coverage enforcement.
---

# Run Quality Gate

Run a fixed **gate** sequence with objective command evidence.

## Select Mode

- **Verify mode:** Run every applicable gate without editing source, tests, or configuration.
- **Repair mode:** Repair each failed gate inside the authorized repository scope.
- **Release mode:** Run all gates, package the application, and test the packaged artifact.

Mode selection is complete when the user request authorizes one branch.
Never add suppressions, exclusions, disabled rules, or lower thresholds without user approval.

Read [REFERENCE.md](REFERENCE.md) before execution.
It owns command discovery, coverage policy, stop conditions, and the report contract.

## Gates

Run these gates in order.

1. **Problems:** Use a whole-workspace diagnostics source when available.
   Pass when that source reports no problems.
   Otherwise record `N-A` and the missing capability.
2. **Markdown:** Run the discovered Markdown command.
   Pass only when it reports zero findings.
3. **ESLint:** Run the discovered lint command.
   Pass only when it exits cleanly.
4. **Fallow:** Run the discovered dead-code command.
   Pass only when it reports zero findings.
5. **Typecheck:** Run the discovered TypeScript check.
   Pass only when it exits cleanly.
6. **Build:** Run the discovered production build.
   Pass only when it exits cleanly.
7. **Unit:** Run the discovered unit suite.
   Pass only when every test passes.
8. **E2E:** Run the discovered Electron E2E suite.
   Pass only when every test passes.
9. **Coverage:** Run unit coverage and each available supplementary report.
   Pass only when the unit report meets [REFERENCE.md](REFERENCE.md).
10. **Package:** In release mode, run the discovered Electron package command.
    Pass only when the expected native artifact exists.
11. **Packaged smoke:** In release mode, test the exact packaged artifact.
    Pass only when the native window and packaged Electron checks pass.

Use `N-A` only when the repository has no applicable command or capability.
In verify mode, continue when later gates remain safe and independent.
In repair mode, stop at a condition from [REFERENCE.md](REFERENCE.md).

## Repair Loop

1. Capture the failing command and diagnostic.
   Complete this step when the failure is reproducible.
2. Identify the smallest in-scope root cause.
   Complete this step when evidence distinguishes it from alternatives.
3. Apply the smallest authorized repair.
   Complete this step when the diff contains no unrelated change.
4. Run the failed gate again.
   Complete this step when the gate passes or reaches a stop condition.
5. Record every changed file.
   Complete this step when the repair has a complete file list.

Repeat the loop for each open gate.

## Completion Criterion

Complete the run when every applicable gate has an objective status.
Record commands and outcomes in execution order.
Claim an overall pass only when every applicable gate passes.
The final report must satisfy [REFERENCE.md](REFERENCE.md).
