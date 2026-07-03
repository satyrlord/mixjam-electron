import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  resetKey: number
}

/**
 * Top-level React error boundary. Catches unhandled render errors anywhere in
 * the tree and shows a recovery screen instead of an empty white page.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, resetKey: 0 }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] Uncaught render error:', error, info.componentStack)
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  private handleDismiss = (): void => {
    this.setState((s) => ({ hasError: false, error: null, resetKey: s.resetKey + 1 }))
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      // Keyed Fragment (not a div): an extra wrapper element between #root and
      // .app breaks the height:100% chain and collapses the app layout.
      return <Fragment key={this.state.resetKey}>{this.props.children}</Fragment>
    }

    return (
      <div className="error-boundary">
        <h1>Something went wrong</h1>
        <p className="error-boundary-message">
          {this.state.error?.message ?? 'An unexpected error occurred.'}
        </p>
        <div className="error-boundary-actions">
          <button type="button" onClick={this.handleDismiss}>Try to recover</button>
          <button type="button" onClick={this.handleReload}>Reload app</button>
        </div>
        <details className="error-boundary-details">
          <summary>Technical details</summary>
          <pre>{this.state.error?.stack}</pre>
        </details>
      </div>
    )
  }
}
