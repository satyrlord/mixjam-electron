---
name: design-critique
description: >
  Critique a design — UI mockup, screenshot, Figma link, or live page —
  across usability, visual hierarchy, consistency, accessibility, and
  MJE-specific conventions. Use when the user asks to "review this design",
  "critique this mockup", "what do you think of this screen?", shares a
  screenshot or Figma link for feedback, or wants a design audit before
  handoff or implementation.
argument-hint: "<Figma URL, screenshot, or description>"
---

# Design Critique

Give structured, actionable design feedback. Work from any input — a Figma
URL, a screenshot, a live page, or a written description. Ask for the design
if none is provided.

## What I Need From You

- **The design** — Figma URL, screenshot, or description
- **Context** — what is this, who is it for, what stage (exploration,
  refinement, final polish)
- **Focus** (optional) — "just the navigation", "mobile only", "the
  onboarding flow"

## Critique Framework

Walk every design through these five dimensions. Skip none. Flag the
dimension as N/A only when it genuinely does not apply.

### 1. First Impression

What hits the eye in the first two seconds? Is that the right thing?
What is the emotional read — polished, cluttered, playful, cold?
Is the purpose immediately legible?

### 2. Usability

Can the user accomplish the core task without friction?
Are interactive elements obvious and reachable?
Are there unnecessary steps, clicks, or cognitive jumps?
Does the layout match the user's mental model?

### 3. Visual Hierarchy

Is there a clear reading order — where does the eye go first, second, third?
Are the right elements emphasised?
Is whitespace used to group and separate, or is it fighting the layout?
Is typography creating the right hierarchy (size, weight, colour)?

### 4. Consistency

Does every repeated element behave the same way?
Are spacing, colours, and typography drawn from the same system?
Do interactive elements share the same affordance patterns?
Are naming and labelling conventions uniform?

### 5. Accessibility

Colour contrast — do key text/UI pairs meet WCAG 2.1 AA (4.5:1 normal,
3:1 large)?
Touch targets — are interactive areas at least 44×44 px?
Text readability — font size, line height, truncation behaviour.
Keyboard and screen-reader — focus order, ARIA labels, announcements.
(For a full audit, invoke `a11y-debugging`.)

### MJE-Specific Conventions

When critiquing MixJam Electron UI, also check:

- **Sample bubbles** — identical height and width everywhere (tracker,
  browser, any view). See `AGENTS.md` hard rules.
- **Theme parity** — colours and tokens match the active theme JSON in
  `public/themes/`. No hardcoded hex values outside the theme.
- **Virtualization** — large lists use TanStack Virtual or react-window;
  never render the full dataset as real DOM nodes.
- **Sandbox safety** — the renderer stays sandboxed; no direct Node or
  SQLite access.

## How to Give Feedback

- **Be specific** — "the CTA competes with the navigation" not "the layout
  is confusing"
- **Explain why** — connect every finding to a design principle or user need
- **Propose alternatives** — identify the problem and suggest a direction
- **Acknowledge what works** — good feedback includes positive observations
- **Match the stage** — early exploration gets directional feedback; final
  polish gets pixel-level scrutiny

## Output

Produce a report in this shape:

```markdown
## Design Critique: [name or screen]

### Overall Impression
[1–2 sentence first reaction — what works, the biggest opportunity]

### Usability
| Finding | Severity | Recommendation |
|---------|----------|----------------|
| [issue] | Critical / Moderate / Minor | [fix] |

### Visual Hierarchy
- **First draw**: [element] — correct or not?
- **Reading flow**: [how the eye moves]
- **Emphasis**: [are the right things emphasised?]

### Consistency
| Element | Issue | Recommendation |
|---------|-------|----------------|
| [spacing/colour/type] | [inconsistency] | [fix] |

### Accessibility
- **Colour contrast**: [pass/fail for key text]
- **Touch targets**: [adequate?]
- **Text readability**: [font size, line height]

### What Works Well
- [positive observation]

### Priority Recommendations
1. **[Most impactful change]** — why and how
2. **[Second priority]** — why and how
3. **[Third priority]** — why and how
```

## Completion Criterion

The critique is complete when all five framework dimensions are addressed
(even if only to mark "N/A — does not apply"), every finding is specific
and tied to a principle, positive observations are recorded, and the
priority recommendations are ordered by impact.
