# Diagnosis Branches

If a feedback-loop condition applies, load only its section.

## Intermittent Failure

1. Repeat the same trigger enough times to measure its occurrence rate.
   Finish when the result includes the run count, failure count, and environment.
2. Control one timing, random, state, filesystem, or network source at a time.
   Finish when each control has a measured effect on the occurrence rate.
3. If the normal loop produces too few failures, increase safe stress.
   Finish when the loop produces enough failures to compare hypotheses.

## Performance Regression

1. Use a representative repository fixture and the least-capable supported runtime.
   Finish when the record names the environment, fixture, workload, and command.
2. Measure an unchanged baseline before you add instrumentation.
   Finish when repeated measurements record the sample count and result spread.
3. Use a profiler, query plan, or targeted timer at the suspected boundary.
   Finish when the measurement separates the ranked hypotheses.
4. Compare the repaired result with the same baseline method.
   Finish when the report gives both measured results and the exact workload.

## Human-Only Reproduction

1. If its generic prompts match, run [scripts/hitl-loop.template.ps1](scripts/hitl-loop.template.ps1).
   Finish when the script controls each required human action.
2. If custom prompts are necessary, request authority to create a temporary copy.
   Finish when the user grants authority or the investigation enters the blocked branch.
3. After authority, replace each prompt with one exact user action or observation.
   Finish when each prompt asks for one action or one observable result.
4. Record all user observations in the script output.
   Finish when the output identifies the run and reported symptom.
