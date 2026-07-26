// The project's render helper for component tests.
//
// Components are rendered inside the same app-level context providers that
// wrap them in production, so a test exercises the component as the app
// actually mounts it. Rendering a bare sub-tree instead makes tests disagree
// with the app about what context exists — which is how a component can pass
// its own tests and still throw once mounted for real.
//
// Use this in place of testing-library's `render` for anything that renders
// project components. `renderBare` stays available for the rare test that is
// deliberately checking behavior without app context.
import type { ReactElement, ReactNode } from 'react'
import { render as baseRender, type RenderOptions, type RenderResult } from '@testing-library/react'
import { TooltipProvider } from '../components/ui/Tooltip'

/**
 * Every app-level provider `App` mounts around the view tree.
 *
 * `TooltipProvider` must be one shared instance: `skipDelayDuration` is scoped
 * to a provider, so nesting one per tooltip would break hover grouping between
 * adjacent triggers.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>
}

export function render(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>): RenderResult {
  return baseRender(ui, { wrapper: AppProviders, ...options })
}

/** Renders with no app context. Only for tests that are checking its absence. */
export const renderBare = baseRender

// Re-export the rest of testing-library so a test needs one import. The local
// `render` above shadows testing-library's, which is the point.
export {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  waitForElementToBeRemoved,
  within,
  renderHook
} from '@testing-library/react'
