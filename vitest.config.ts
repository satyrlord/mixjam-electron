import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['src/renderer/src/test/setup.ts'],
    include: ['src/renderer/src/**/*.test.{ts,tsx}'],
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
