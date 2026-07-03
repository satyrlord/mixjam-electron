import { resolve } from 'node:path'
import { execSync } from 'node:child_process'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

// Strict CSP for the packaged renderer. Injected at build time only — the dev
// server needs inline scripts (react-refresh preamble) and websockets (HMR),
// which a static meta tag in index.html would break.
const RENDERER_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // Inline styles: theme tokens are written to element style attributes.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'"
].join('; ')

function injectCspPlugin(): Plugin {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${RENDERER_CSP}" />`
      )
    }
  }
}

// The app version is derived from the git commit count at build time.
// Format: 0.<commit-count> (e.g. 0.43). Falls back to package.json version
// when git is unavailable (e.g. in CI without a full clone).
function deriveAppVersion(): string {
  try {
    const count = execSync('git rev-list --count HEAD', { encoding: 'utf8' }).trim()
    return `0.${count}`
  } catch {
    const { version } = JSON.parse(require('fs').readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as { version: string }
    return version
  }
}
const appVersion = deriveAppVersion()

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      __APP_VERSION__: JSON.stringify(appVersion)
    },
    build: {
      rollupOptions: {
        // The indexer runs in a worker_thread and is spawned by path
        // (out/main/indexer.js), so it needs its own entry alongside the main
        // process entry. Without this electron-vite only emits index.js.
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          indexer: resolve(__dirname, 'src/main/indexer.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react(), injectCspPlugin()]
  }
})
