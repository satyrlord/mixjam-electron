---
name: design-critique
description: >
  Structured design critique across usability, hierarchy, consistency, and
  accessibility. Use when the user shares a Figma link, screenshot, mockup, or
  asks for design feedback ("review this design", "critique this screen",
  "what do you think of this UI?"). Use after design-router when a theme has
  been selected and applied.
argument-hint: "<Figma URL, screenshot, file, or description>"
---

# Design Critique

A **critique** is structured feedback against design principles, not a
preference list. Every finding must name the principle it violates and the
severity of the violation.

## Collect Input

1. The design: Figma URL, screenshot, referenced file, or description.
   If the user provided none, ask for at least one concrete artifact before
   proceeding — a critique without a surface to inspect is speculation.
2. Context: what is this screen, who is the audience, and what stage
   (exploration, refinement, final)? If the user omitted context, state
   your assumptions explicitly and flag them as assumptions.
3. Focus area (optional): a specific region, flow, or breakpoint the user
   wants depth on. When provided, give that area disproportionate weight in
   every lens.

## Lenses

Apply all five lenses; each finding gets a severity and a principle anchor.

### 1. First Impression

What draws the eye in the first two seconds? Is that the correct focal point?
State the emotional read and whether the purpose is immediately legible.

### 2. Usability

Can the user accomplish the primary goal without friction? Flag unnecessary
steps, ambiguous interactive elements, and navigation dead ends. For
multi-step flows, walk the happy path and one error path.

### 3. Visual Hierarchy

Is there a clear reading order? Are the right elements emphasized through
size, color, position, or whitespace? Is typography creating the intended
hierarchy? Call out competing focal points — two elements fighting for
primary attention is a bug, not a style choice.

### 4. Consistency

Does the design follow the project's stated or implied design system? Flag
drift in spacing, color, typography, component behavior, or interaction
patterns. When no system is stated, flag internal inconsistency — the same
thing rendered differently in two places, or different things rendered
identically.

### 5. Accessibility

Minimum bar: color contrast ratios for all text-on-background pairs, touch
target sizes (minimum 44x44 CSS px), font sizes and line heights for
readability, and missing alternative text. Flag violations; do not soften
them.

## Output

Write findings to [OUTPUT.md](OUTPUT.md) following that template. The output
is complete when every lens has at least one observation (positive or
negative), every negative finding has a severity and a concrete
recommendation, and the priority recommendations are ordered by impact.

## Completion Criterion

The critique is done when design input is collected, all five lenses are
applied with at least one finding each, every negative finding carries a
severity and a concrete recommendation, at least one thing that works well
is named, and the output follows the OUTPUT.md template.
