---
name: diagnose
description: Diagnose hard bugs and performance regressions. Use when a failure is intermittent, unreproduced, unmeasured, or lacks a proven cause.
---

# Diagnose

Use a controlled feedback loop to prove the cause of a hard failure.
If the user requests a fix, implement the proven repair.
Do not edit repository files without fix authority or diagnostic-edit authority.

## Process

1. Read the owning code, glossary terms, canonical documents, and reported evidence.
   Finish when one written symptom states the expected result and the observed result.
2. Build the smallest agent-run feedback loop that can show the reported symptom.
   Finish when the loop has a clear pass result, failure result, command, and fixture.
3. If the loop needs special controls, load the applicable section in [REFERENCE.md](REFERENCE.md).
   Finish when each intermittent, performance, or human-only condition has a selected control.
4. Run the loop without a code change.
   Finish when repeated results confirm the symptom or establish its measured occurrence rate.
5. Record the exact error, wrong output, timing, or state that identifies the symptom.
   Finish when later runs can compare the same observable result.
6. Write three to five ranked, falsifiable cause hypotheses.
   Finish when each hypothesis predicts one result that differs from another hypothesis.
7. Show the ranked hypotheses to the user without stopping the investigation.
   Finish when the user can correct known facts while the next probe runs.
8. Test one predicted difference at a time.
   Finish when each probe names its hypothesis, changed variable, and observed result.
9. If existing tools cannot observe the difference, use reversible runtime instrumentation.
   Finish when the runtime probe exposes the predicted difference without a repository edit.
10. If runtime probes remain insufficient, request diagnostic-edit authority.
    Finish when the user grants authority or the investigation enters the blocked branch.
11. After authority, add tagged instrumentation for one predicted difference.
    Finish when each added probe has one unique `[DEBUG-<id>]` prefix.
12. After evidence excludes the competing hypotheses, conclude the root cause.
    Finish when the evidence links the symptom to one necessary cause.
13. If the user requests diagnosis only, give a concrete fix and regression-test plan.
    Finish when the plan names the owning file, test seam, failure assertion, and validation command.
14. If the user requests a fix, convert the reduced reproduction into a failing regression test.
    Finish when the test fails for the proven cause at the correct production seam.
15. If no correct test seam exists, record that architecture limit.
    Finish when the report states why a shallower test would give false confidence.
16. If the user requests a fix, apply the smallest repair for the proven cause.
    Finish when the regression test and the original feedback loop pass.
17. Remove all temporary instrumentation and temporary harnesses.
    Finish when `rg '\[DEBUG-'` finds no added tag and no task-created temporary artifact remains.
18. Report the evidence, result, validation, and remaining uncertainty.
    Finish when every claim links to a command, measurement, file, or captured artifact.

## Blocked Branch

1. If documented loop attempts cannot reproduce or measure the symptom, stop the investigation.
   Finish when the attempt log names each command and result.
2. Name the missing access, environment, fixture, or captured artifact.
   Finish when one named item can make the feedback loop possible.
3. Request only that item from the user.
   Finish when the request states how the item enables the next loop attempt.
Do not claim a root cause or propose a repair as proven.

## Completion Criterion

A diagnosis is complete when evidence proves one cause and distinguishes it from all ranked alternatives.
A requested repair is complete when its regression test and original feedback loop pass.
All branches must remove temporary artifacts and report remaining uncertainty.
