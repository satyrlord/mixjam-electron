---
name: grill-me
description: >
  Stress-tests a plan or design through a decision-tree interview. Use when
  the user asks to be grilled before building.
---

# Grilling

Interrogate the plan until its consequential decisions and dependencies are
explicit. Use the available user-input mechanism; fall back to one concise
plain-text question when no structured mechanism is available.

## Design Tree

Walk down each branch of the design tree. A **branch** is a decision point:
an architectural choice, a UX trade-off, an integration seam, a sequencing
question. Resolve dependencies between branches one-by-one — don't jump
ahead to child branches until the parent decision is made.

Before questioning, inventory the branches visible in the plan. Add a newly
discovered branch only when an answer exposes a consequential dependency. For
each question, provide your recommended answer before asking for mine.

## Rhythm

- Ask questions **one at a time**. Asking multiple at once is bewildering
  and breaks the tree walk.
- Summarize advantages and disadvantages for each option.
- If a question can be answered by exploring the repo, explore the repo instead of asking.
- When I answer with a constraint or preference, incorporate it immediately
  — don't ask the same branch again later.
- Keep a concise decision ledger in the conversation. Update repository docs
  only when the user requests documentation or when the original task already
  authorizes it.

## Completion Criterion

The grill is done when every inventoried branch is resolved or explicitly
deferred with an owner and reason, all dependencies between resolved decisions
are consistent, and the decision ledger is specific enough for a fresh agent
to continue without re-litigating them.
