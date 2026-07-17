---
name: design-critique
description: >
  Structured design critique of the running MixJam app across usability,
  hierarchy, consistency, and accessibility. Use when the user asks for design
  feedback, a screen review, or a UI critique. Use after design-router when a
  theme has been selected and applied.
---

# Design Critique

A **critique** is structured feedback against design principles, not a
preference list. Every finding must name the principle it violates and the
severity of the violation.

## Auto-Capture Phase

Before any critique work begins, capture screenshots of the running app
automatically. The user does not need to supply any artifact — the skill
gathers its own surfaces.

### 1. Ensure the app is running

Check whether the dev server is already listening on `http://localhost:5173`
(or the production preview on `http://localhost:4173`). If neither is
reachable, start the app:

```sh
npm run dev
```

Wait for the Vite dev server to report readiness. If the build is stale or
missing, build first:

```sh
npm run build && npm run preview
```

### 2. Capture screenshots via Playwright

Write a temporary Playwright script at
`tmp/design-critique/capture.mjs` that:

1. Launches a headless Chromium browser.
2. Navigates to the running app URL.
3. Injects the mock backend (same pattern as `tests/e2e/fixtures.ts`:
   read `tests/e2e/mock-backend.js` and call `page.addInitScript`).
4. Waits for `#root > *` to render.
5. Navigates to each relevant view (home screen, player/tracker, sample
   browser, settings if applicable) and takes a full-page screenshot.
6. Saves screenshots to `tmp/design-critique/screenshots/<view>.png`.

Execute the capture script:

```sh
node tmp/design-critique/capture.mjs
```

### 3. Verify the captures

Read the screenshot files with the `view_image` tool (or equivalent) to
confirm they loaded correctly and are usable for critique. If any capture is
blank or broken, diagnose and re-capture before proceeding to the critique.

### 4. Screenshot coverage

At minimum, capture these views:

| View | Navigation trigger | What to capture |
| --- | --- | --- |
| Home | `/` (initial load) | Full home screen with wordmark, folder cards, recents, theme swatches |
| Player/Tracker | Click "Start New MixJam" or navigate | Lane heads, transport strip, mixer panel |
| Sample Browser | Open the samples panel | Category filter, sample list, sample bubbles |
| Theme variant | Cycle through 2-3 themes via theme swatches | One screenshot per theme to assess consistency across themes |

If the user specified a focus area or a particular screen, capture that
screen in addition to (or instead of) the defaults above.

## Collect Input

After auto-capture, gather remaining context:

1. The design: the screenshots captured above serve as the primary artifact.
   If the user provided additional artifacts (Figma URL, mockup, description),
   layer those in as well.
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

Write every critique to `<repository-root>/tmp/design-critique/OUTPUT.md`.
Create the directory when absent and overwrite the previous critique unless
the user requests a versioned artifact. Never write generated output inside
the skill folder.

The `tmp/design-critique/` directory will contain:

- `OUTPUT.md` — the full critique
- `capture.mjs` — the one-shot Playwright capture script (can be deleted after)
- `screenshots/` — the captured PNG files referenced in the critique

Use these headings in order:

1. `Context and assumptions`
2. `Overall impression`
3. `First impression`
4. `Usability`
5. `Visual hierarchy`
6. `Consistency`
7. `Accessibility`
8. `What works well`
9. `Priority recommendations`

The output is complete when every lens has at least one observation (positive
or negative), every negative finding has a severity and a concrete
recommendation, and the priority recommendations are ordered by impact.

## Cleanup

After the critique is written, stop any server that was started specifically
for the capture. If the server was already running before the skill was
invoked, leave it running.

## Completion Criterion

The critique is done when:

- Screenshots have been auto-captured (or the user overrode with their own
  artifact)
- All five lenses are applied with at least one finding each
- Every negative finding carries a severity and a concrete recommendation
- At least one thing that works well is named
- `tmp/design-critique/OUTPUT.md` exists with the required heading order
- Screenshot paths are referenced inline in the critique where they support
  a specific finding
