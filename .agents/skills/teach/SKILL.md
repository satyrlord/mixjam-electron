---
name: teach
description: Teach a skill or concept over multiple sessions using the workspace as a durable learning record.
disable-model-invocation: true
argument-hint: "What would you like to learn about?"
---

# Teach

Build one **lesson** at a time around the learner's mission and current zone of
proximal development. Preserve learning state in the workspace so later
sessions start from evidence rather than repetition.

## Read the Workspace

Inspect these paths when present:

- `MISSION.md` for the concrete outcome; create it with
  [MISSION-FORMAT.md](MISSION-FORMAT.md).
- `RESOURCES.md` for trusted sources and communities; use
  [RESOURCES-FORMAT.md](RESOURCES-FORMAT.md).
- `learning-records/*.md` for demonstrated knowledge; use
  [LEARNING-RECORD-FORMAT.md](LEARNING-RECORD-FORMAT.md).
- `GLOSSARY.md` for established language; use
  [GLOSSARY-FORMAT.md](GLOSSARY-FORMAT.md).
- `assets/`, `lessons/`, `reference/`, and `NOTES.md` for reusable components,
  prior outputs, and teaching preferences.

Read [REFERENCE.md](REFERENCE.md) when selecting pedagogy, retrieval practice,
or a knowledge, skill, or wisdom branch.

## Select the Session Branch

### Bootstrap

Use when `MISSION.md` is missing or vague. Ask only for the concrete outcome,
observable success, and constraints needed to write it. Do not create a lesson
until the mission can select what belongs and what does not.

### Lesson

1. Infer the smallest current skill gap from the mission and learning records.
2. Gather the minimum trusted source material needed for that gap and update
   `RESOURCES.md` with annotated sources.
3. Produce one short `lessons/NNNN-slug.html` lesson that gives one tangible
   win and includes an immediate feedback loop.
4. Reuse `assets/` before adding a component. Create a shared stylesheet when
   the first lesson needs one.
5. Add or update a printable `reference/*.html` artifact only when the lesson
   yields reusable compressed knowledge.
6. Write a learning record only after the user demonstrates understanding or
   states prior knowledge; exposure alone is not evidence.

### Wisdom

Use when the question requires real-world judgment. Answer what the available
evidence supports, then recommend a reputable community or practitioner where
the learner can test the skill. Respect a recorded preference not to join a
community.

## Lesson Contract

- Tie every activity to `MISSION.md`.
- Keep content inside the learner's current zone of proximal development.
- Cite primary or high-trust sources for factual claims.
- Teach only the knowledge required for the target skill, then require
  retrieval or performance with prompt feedback.
- Avoid answer-length or formatting clues in quizzes.
- Link related lessons and reference artifacts with relative HTML links.
- Confirm before changing the mission.

## Completion Criterion

A session is complete when the mission and current skill gap are explicit, one
branch-specific artifact has been created or updated, its claims are grounded
in recorded sources, any learning record is backed by evidence, and the next
practice step follows directly from the mission without re-litigating it.
