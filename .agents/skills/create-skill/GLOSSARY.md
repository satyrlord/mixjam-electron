# Create Skill Glossary

This glossary owns the skill vocabulary. [`SKILL.md`](SKILL.md) owns the authoring procedure.

## Core Terms

### Predictability

Predictability measures how consistently a skill guides the same process. It does not require identical output.

### Model-Invoked Skill

A model-invoked skill exposes its description to the agent. The agent, the user, or another skill can invoke it.

This skill omits `disable-model-invocation`.

### User-Invoked Skill

A user-invoked skill hides its description from model invocation. The user invokes it by name.

This skill sets `disable-model-invocation: true`. It retains a concise, human-facing description for skill catalogs.

### Description

The description summarizes a skill in its frontmatter. A model-invoked description also states each distinct trigger branch.

A user-invoked description states only the skill purpose. The invocation setting hides it from the agent.

### Context Pointer

A context pointer names reference material and states when the agent must read it. Its wording controls reliable use.

A model-invoked description is the top-level context pointer. A package link can point to disclosed reference at the next level.

### Context Load

Context load is the agent attention and token cost from visible skill descriptions and loaded skill text.

### Cognitive Load

Cognitive load is the information that a user must remember to select a user-invoked skill.

### Granularity

Granularity describes how narrowly a skill package divides its work. Each split adds context load or cognitive load.

### Router Skill

A router skill helps a user select a user-invoked skill. It names each available route and its distinct purpose.

The router cannot invoke another user-invoked skill.

## Content Terms

### Information Hierarchy

The information hierarchy ranks content by immediate need. Steps come first, common reference follows, and conditional reference stays behind a context pointer.

### Co-location

Co-location keeps a concept, its rules, and its caveats together. It prevents scattered guidance.

### Branch

A branch is one distinct way to use a skill. Different branches need different actions or reference material.

### Progressive Disclosure

Progressive disclosure moves conditional reference from `SKILL.md` to a linked file. This change keeps the main procedure concise.

### Step

A step is one ordered action in `SKILL.md`. Each step ends with a local completion criterion.

### Completion Criterion

A completion criterion states the observable condition that finishes a step or skill. A strong criterion is clear, checkable, and exhaustive.

An all-reference skill needs one exhaustive criterion. That criterion applies every rule to every item in the stated scope.

### Post-Completion Step

A post-completion step follows the current step. Visible later work can draw attention away from the current criterion.

### Legwork

Legwork is the evidence collection inside a step. An exhaustive criterion controls its required scope.

### Reference

Reference provides facts, rules, parameters, or examples that support a skill. Reference does not define an ordered action.

### Disclosed Reference

A disclosed reference is a linked file inside one skill package. A context pointer loads it only when its material applies.

### External Reference

An external reference is a linked file outside the skill package. Several skills can use this shared material.

### Leading Word

A leading word is a compact, established concept that changes agent behavior. It can strengthen invocation or guide execution.

Repeat the word when it guides behavior. Do not repeat its definition.

### Single Source of Truth

A single source of truth gives one meaning one authoritative location. All other locations point to that source.

### Relevance

Relevance measures whether a statement affects the current skill behavior. Stale or unrelated statements lack relevance.

## Failure Modes

### Premature Completion

Premature completion ends a step before its criterion is true. An unclear criterion and visible later steps can cause it.

### Duplication

Duplication gives one meaning more than one authoritative statement. It increases maintenance cost and can change the apparent importance of that meaning.

### Sediment

Sediment is stale skill content that remains after its purpose ends. It obscures current guidance.

### Sprawl

Sprawl is excessive main-file length, even when each statement remains useful. Progressive disclosure or a justified split can reduce it.

### No-Op

A no-op is an instruction that does not change agent behavior. Delete a no-op instead of rewriting it.
