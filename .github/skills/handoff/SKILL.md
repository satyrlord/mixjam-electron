---
name: handoff
description: Transfer current session state to a fresh agent through one concise Markdown file.
argument-hint: "Focus for the next session."
disable-model-invocation: true
---

# Handoff

Write the minimum state that a fresh agent needs for the next action.
Save the file under `tmp/` in the current workspace.

## 1. Critique the Current State

- List each low-confidence fact.
- Pair each low-confidence fact with a command, test, or file check.
- List all skipped or deferred work.
- List each unstated assumption.
- Name the largest remaining blind spot.
- Do not repair a new issue during this critique.

This step is complete when every known gap has a check or an explicit reason for no check.

## 2. Write the Handoff

Use these headings in this order.

| Order | Heading | Required content |
| --- | --- | --- |
| 1 | **Current task** | The current objective in one sentence |
| 2 | **State snapshot** | The last action and the exact next action |
| 3 | **Decisions** | Each accepted choice, rejected choice, and reason |
| 4 | **Open questions** | Each unresolved question, owner, and effect |
| 5 | **Files touched** | Paths and relevant diffs or commits |
| 6 | **Verification** | Completed checks and exact results |
| 7 | **Suggested skills** | The next skills in order |
| 8 | **Critique** | The gaps from step one |

If an open question blocks progress, make that question the exact next action.
Otherwise, no open question can block the exact next action.

Reference existing artifacts by path or URL.
Do not copy conversation history, dead ends, secrets, passwords, keys, or personal data.
Use the invocation argument to emphasize the next session focus.

This step is complete when each required heading contains current and specific state.

## 3. Save and Check

- Save `tmp/handoff-<YYYY-MM-DD>-<slug>.md`.
- Read the saved file from disk.
- Check every required heading.
- Check each path and command for exact spelling.
- Check that the exact next action can start immediately.
- Run `markdownlint-cli2` on the saved file when the command is available.
- Report the saved path and any unavailable check.

The handoff is complete when a fresh agent can start the exact next action from the saved file.
