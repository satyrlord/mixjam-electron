import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { applyTrackerGeometry, bootstrapTheme } from './theme/themes'

interface AppRoot {
  render(node: React.ReactNode): void
}

type CreateRoot = (container: HTMLElement) => AppRoot

export function mountApp(rootElement: HTMLElement, createRoot: CreateRoot = ReactDOM.createRoot): void {
  applyTrackerGeometry()
  bootstrapTheme()
  createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  )
}