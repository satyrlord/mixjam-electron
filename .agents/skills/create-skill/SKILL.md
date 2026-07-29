---
name: create-skill
description: Create, revise, or review skills for predictable invocation, clear steps, useful reference, and strict ASD-STE100 prose.
---

# Create Skill

Use this skill to create, revise, or review a skill package.

[`GLOSSARY.md`](GLOSSARY.md) owns all terms in this skill package. Read it before you assess or change a skill.

## Invocation Rules

A model-invoked skill needs a concise description with all distinct trigger branches.

Omit `disable-model-invocation` for a model-invoked skill. Another skill can then invoke it.

A user-invoked skill also needs a concise, human-facing description. Set `disable-model-invocation: true` to hide that description from model invocation.

Remove trigger phrases from a user-invoked description. State only the skill purpose.

Use a router skill when users need help to find several user-invoked skills.

## Information Rules

Put ordered actions in `SKILL.md`. End each step with a local and checkable completion criterion.

Keep reference that every branch needs in `SKILL.md`. Move branch-specific reference behind a clear context pointer.

Use a disclosed reference for package-local material. Use an external reference for shared material outside the package.

Keep each meaning in one authoritative place. Keep related rules and caveats together at that place.

A skill can contain only reference. Its completion criterion must apply every rule to every item in the stated scope.

## Authoring Procedure

1. Inventory each target package from its files and catalog entry.
   Complete this step when you can name the skill purpose, invocation mode, branches, and package files.
2. Classify each statement as a step, common reference, branch reference, or no-op.
   Complete this step when every statement has one classification.
3. Set the frontmatter for the selected invocation mode.
   Complete this step when the description and `disable-model-invocation` value follow the invocation rules.
4. Arrange the skill through the information hierarchy.
   Complete this step when every step has a criterion and every reference has the correct location.
5. Remove duplication, sediment, sprawl, and no-ops.
   Complete this step when each remaining statement changes behavior and has one authoritative place.
6. Apply strict ASD-STE100 Simplified Technical English to all package prose.
   Complete this step when the package passes the prose checks in [`AGENTS.md`](../../../AGENTS.md).
7. Verify the complete package with realistic prompts and structural checks.
   Complete this step when every branch passes its prompt and every link, pointer, and frontmatter field resolves.

## Description Checks

- Start each model-invoked description with the skill action.
- Include one trigger for each distinct branch.
- Remove synonyms that repeat one branch.
- Keep implementation details in the body.
- Keep each user-invoked description human-facing and free of trigger phrases.

## Split Checks

Split by invocation only when the new skill needs independent model reach.

Split by sequence only when visible later steps cause premature completion.

First, sharpen an unclear completion criterion. Split the sequence only if realistic prompts still show premature completion.

## Pruning Checks

Test each sentence by itself. Delete it when the skill would behave the same without it.

Use a leading word only when it changes invocation or execution behavior.

Keep a concept definition, its rules, and its caveats under one heading.

## Final Criterion

The package is complete when all applicable rules cover every in-scope file, branch, step, reference, and frontmatter field.
