import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// The app version is a build-time constant. Inlining it from package.json keeps
// the footer/mixjam.json correct in every runtime — dev, packaged, and when the
// built main entry is launched directly (where app.getAppPath() has no manifest).
const appVersion = (JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as { version: string }).version

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
    plugins: [react()]
  }
})
