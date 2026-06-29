import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['src/renderer/src/test/setup.ts'],
    environmentMatchGlobs: [
      // Native-module tests run in Node so better-sqlite3 can load.
      ['src/main/library.test.ts', 'node']
    ],
    poolMatchGlobs: [
      // Run native-addon tests in a forked process (real Node require, no Vite transforms).
      ['src/main/library.test.ts', 'forks']
    ],
    include: ['src/renderer/src/**/*.test.{ts,tsx}', 'src/main/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage-unit',
      all: false,
      include: ['src/renderer/src/**/*.{ts,tsx}'],
      exclude: [
        '**/out/**',
        '**/*.test.{ts,tsx}',
        'src/main/**',
        'src/preload/**',
        'electron.vite.config.*',
        'src/renderer/src/**/*.d.ts',
        'src/renderer/src/main.tsx',
        'src/renderer/src/test/**'
      ]
    }
  }
})
