import './index.css'
import './home.css'
import './mixer.css'
import './masterbus.css'
import './echoform-delay.css'
import './aetherform-reverb.css'
import './ui-size.css'
import { mountApp } from './bootstrapApp'
import { createBackendAPI } from './backend/client'
import { bootstrapTheme } from './theme/themes'
import { applyUiSize, loadUiSize } from './ui-size'

const rootElement = document.getElementById('root') as HTMLElement

// opfs-sahpool allows exactly one DB connection. The lock is held for the
// lifetime of the renderer so a competing Electron process cannot open the
// same profile database.
function acquireAppLock(): Promise<boolean> {
  if (!('locks' in navigator)) return Promise.resolve(true)
  return new Promise((resolve) => {
    // Phase 1 — fast path: acquire without waiting.
    void navigator.locks.request('mixjam-app', { ifAvailable: true }, async (lock) => {
      if (lock !== null) {
        resolve(true)
        await new Promise<never>(() => {})
      } else {
        // Phase 2 — slow path: the lock was not immediately available. On a
        // Playwright-driven page reload the previous execution context may not
        // have released the lock yet. Wait up to 500 ms before concluding that
        // another application instance is genuinely running.
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 500)
        void navigator.locks
          .request('mixjam-app', { signal: controller.signal }, async () => {
            clearTimeout(timer)
            resolve(true)
            await new Promise<never>(() => {})
          })
          .catch(() => {
            clearTimeout(timer)
            resolve(false)
          })
      }
    })
  })
}

function renderAlreadyOpen(element: HTMLElement): void {
  // The body stays hidden until the theme is bootstrapped (anti-flash guard in
  // index.css), so the notice path must apply geometry and bootstrap too.
  applyUiSize(document.documentElement, loadUiSize())
  bootstrapTheme()
  const message = document.createElement('div')
  message.className = 'app-single-tab-notice'
  message.textContent = 'MixJam is already open in another window. Close this window and use the existing one.'
  element.replaceChildren(message)
}

async function bootstrap(): Promise<void> {
  if (!(await acquireAppLock())) {
    renderAlreadyOpen(rootElement)
    return
  }
  // If window.backendAPI is already set (e2e mock injected by Playwright's
  // addInitScript), skip the real backend to preserve the mock.
  if (!window.backendAPI) {
    if (!window.shellAPI) throw new Error('Electron preload did not expose window.shellAPI')
    window.backendAPI = createBackendAPI(window.shellAPI)
  }
  mountApp(rootElement)
}

void bootstrap()
