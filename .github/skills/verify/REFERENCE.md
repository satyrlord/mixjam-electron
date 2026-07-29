# Renderer Verification Reference

## Mock Data

Use this branch only when the run cannot use real folders.

1. Read the mock source from `tests/e2e/mock-backend.js`.
   Complete this step when the mock exposes every required method.
2. Compare the shape with `src/shared/backend-api.ts`.
   Complete this step when every mock method matches the current contract.
3. Install the mock source through `page.addInitScript`.
   Complete this step when the page receives the mock before application code.
4. Reload the first window before the renderer starts.
   Complete this step when the application starts with the installed mock.
5. Assert the feature supplied by each mocked method.
   Complete this step when each required method has a feature assertion.

The branch is complete when the tested feature consumes every required mock method.

## Tracker Actions

Use this branch only for Tracker changes.

- Change themes through `.theme-selector`.
- Place a clip through a `DragEvent('drop')` on `.tracker-lane-canvas`.
- Put serialized `FooterSampleDetail` data in `application/mixjam-sample`.
- Use a duration that gives stable pixel samples.
- Start playback before checking the playhead.

The branch is complete when each changed Tracker state has direct evidence.
