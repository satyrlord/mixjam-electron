import { resolve } from 'node:path'
import { execSync } from 'node:child_process'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

// Strict CSP for the packaged renderer. Injected at build time only — the dev
// server needs inline scripts (react-refresh preamble) and websockets (HMR),
// which a static meta tag in index.html would break.
// 'wasm-unsafe-eval' is required to compile the sqlite-wasm module.
const RENDERER_CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self'",
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
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    build: {
      // Source maps are required for e2e coverage (v8-to-istanbul maps
      // bundled coverage back to source files via the sourceMappingURL).
      sourcemap: true
    },
    plugins: [react(), injectCspPlugin()],
    define: {
      __APP_VERSION__: JSON.stringify(appVersion)
    },
    // The backend worker uses dynamic import (music-metadata lazy-load), which
    // the default iife worker format cannot express.
    worker: {
      format: 'es'
    },
    optimizeDeps: {
      // sqlite-wasm resolves its .wasm asset relative to import.meta.url;
      // pre-bundling would break that resolution in dev.
      exclude: ['@sqlite.org/sqlite-wasm']
    }
  }
})
