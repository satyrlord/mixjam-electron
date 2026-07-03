import './index.css'
import { mountApp } from './bootstrapApp'
import { createBackendAPI } from './backend/client'
import { bootstrapTheme } from './theme/themes'

const rootElement = document.getElementById('root') as HTMLElement

// opfs-sahpool allows exactly one DB connection, so MixJam runs in exactly one
// tab. The lock is held for the lifetime of the tab; a second tab sees it
// taken and shows a friendly message instead of failing on DB open.
function acquireSingleTabLock(): Promise<boolean> {
  if (!('locks' in navigator)) return Promise.resolve(true)
  return new Promise((resolve) => {
    void navigator.locks.request('mixjam-app', { ifAvailable: true }, async (lock) => {
      resolve(lock !== null)
      if (lock !== null) {
        await new Promise(() => {})
      }
    })
  })
}

function renderAlreadyOpen(element: HTMLElement): void {
  // The body stays hidden until the theme is bootstrapped (anti-flash guard in
  // index.css), so the notice path must bootstrap it too.
  bootstrapTheme()
  const message = document.createElement('div')
  message.className = 'app-single-tab-notice'
  message.textContent = 'MixJam is already open in another tab. Close this tab and use the existing one.'
  element.replaceChildren(message)
}

async function bootstrap(): Promise<void> {
  if (!(await acquireSingleTabLock())) {
    renderAlreadyOpen(rootElement)
    return
  }
  // The browser backend runs everywhere; host detection only selects the
  // optional Electron shellAPI (window sizing, openExternal, version).
  // If window.backendAPI is already set (e2e mock injected by Playwright's
  // addInitScript), skip the real backend to preserve the mock.
  if (!window.backendAPI) {
    window.backendAPI = createBackendAPI(window.shellAPI ?? null)
  }
  mountApp(rootElement)
}

void bootstrap()
