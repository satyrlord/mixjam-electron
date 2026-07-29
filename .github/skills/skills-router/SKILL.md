---
name: skills-router
description: Select a user-invoked repository skill.
disable-model-invocation: true
---

# Skills Router

Compare the request with every route below. Name the closest user-invoked skill and state the reason.

## Routes

- `design-router` selects one bundled MixJam theme before UI design work.
- `deslop` removes repository content that conflicts with evidence or established conventions.
- `full-code-review` performs a strict, read-only maintainability review.
- `generate-mix` creates or revises a `.mixjam` file from the sample corpus.
- `handoff` writes the minimum state that a new agent needs to continue work.

The repository also contains model-invoked skills. The agent selects those skills directly from their descriptions.

See [`README.md`](../README.md) for the complete skill catalog and invocation modes.

## Completion Criterion

Routing is complete when the agent compares every route and names one best match with its reason.
