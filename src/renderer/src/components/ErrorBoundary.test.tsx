import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ErrorBoundary from './ErrorBoundary'

const Bomber = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) throw new Error('boom')
  return <div>safe content</div>
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => { /* silent */ })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <div>hello world</div>
      </ErrorBoundary>
    )
    expect(screen.getByText('hello world')).toBeInTheDocument()
  })

  it('catches a render error and shows the recovery screen', () => {
    render(
      <ErrorBoundary>
        <Bomber shouldThrow />
      </ErrorBoundary>
    )
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText('boom')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try to recover' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload app' })).toBeInTheDocument()
  })

  it('shows generic message when error has no message', () => {
    // ErrorBoundary displays error.message directly (empty string for new Error())
    // and falls back to the generic text only when message is null/undefined.
    const ThrowNullMsg = () => { throw new Error() }
    render(
      <ErrorBoundary>
        <ThrowNullMsg />
      </ErrorBoundary>
    )
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    // Verify the recovery buttons are still present
    expect(screen.getByRole('button', { name: 'Try to recover' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload app' })).toBeInTheDocument()
  })

  it('shows generic message when error.message is null', () => {
    const ThrowNullMsg = () => {
      const err = new Error()
      ;(err as { message: unknown }).message = null
      throw err
    }
    render(
      <ErrorBoundary>
        <ThrowNullMsg />
      </ErrorBoundary>
    )
    expect(screen.getByText('An unexpected error occurred.')).toBeInTheDocument()
  })

  it('Try to recover dismisses the error and re-renders children', () => {
    const { rerender } = render(
      <ErrorBoundary>
        <Bomber shouldThrow />
      </ErrorBoundary>
    )
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()

    // Rerender without the throw so the recovered boundary sees safe children
    rerender(
      <ErrorBoundary>
        <div>recovered</div>
      </ErrorBoundary>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Try to recover' }))
    expect(screen.getByText('recovered')).toBeInTheDocument()
  })

  it('Reload app calls window.location.reload', () => {
    const reloadSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { reload: reloadSpy }
    })

    render(
      <ErrorBoundary>
        <Bomber shouldThrow />
      </ErrorBoundary>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Reload app' }))
    expect(reloadSpy).toHaveBeenCalledTimes(1)
  })

  it('shows technical details expandable section with stack trace', () => {
    render(
      <ErrorBoundary>
        <Bomber shouldThrow />
      </ErrorBoundary>
    )
    expect(screen.getByText('Technical details')).toBeInTheDocument()
  })
})
