---
name: grill-me
description: >
  Stress-test a plan through one decision question at a time. Use when the
  user requests plan pressure, design questions, or closure for open decisions.
---

# Grill Me

Resolve important plan decisions before implementation.
Do not ask a question that repository evidence can answer.
Do not edit files unless the user authorizes edits.

## 1. Inspect the Plan

- Read `AGENTS.md` and the documents that own the plan area.
- Read `docs/glossary.md` when the plan uses shared project terms.
- Inspect code and tests for claims about current behavior.
- List each decision and its dependencies.
- Order decisions by risk and reversibility.

This step is complete when every known decision has evidence, dependencies, and an order.

## Decision Record

Maintain a decision record in each response.
Give each decision an identifier, state, choice, reason, dependencies, and owner.
Use `open`, `resolved`, or `deferred` as the state.
A deferred decision must include a reason and a named owner.

If you need a question pattern, read [EXAMPLES.md](EXAMPLES.md) before the first question.

## 2. Resolve Decisions

- Select the first unresolved parent decision.
- Inspect the repository again if new evidence can resolve it.
- Give the recommended choice and its evidence.
- Give the material benefits and costs for each valid choice.
- Ask one question.
- Record the answer before selecting another decision.
- Add a new decision only when an answer reveals a material dependency.

This step is complete when the record marks each decision as resolved or deferred.
Each deferred decision must have an owner and reason.

## Challenge Areas

Check only areas that can change the plan.

- scope and non-goals
- architecture ownership
- data contracts and persistence
- trust boundaries and path safety
- performance and failure behavior
- validation and release risk
- project terms and user-visible behavior

Use the exact project terms from the owning documents.
State any conflict with an existing decision before the user answers.

## 3. Close the Review

- Check all dependencies between resolved decisions.
- Present the complete decision record.
- Name the next owning skill or implementation action.
- If the user authorized edits, update the smallest owning document.
- If Markdown changed, run `markdownlint-cli2` on each changed file.
- If code changed, invoke `run-quality-gate` for the changed code.

The review is complete when the record has no unowned decision and all resolved decisions remain consistent.
