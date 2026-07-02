import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    setupFiles: ['src/renderer/src/test/setup.ts'],
    // Split into projects (environmentMatchGlobs/poolMatchGlobs are removed in
    // Vitest 4): renderer + pure-Node main tests run under jsdom threads, while
    // the better-sqlite3 tests need a real Node environment in a forked process
    // so the native addon can load without Vite transforms.
    projects: [
      {
        extends: true,
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['src/renderer/src/**/*.test.{ts,tsx}', 'src/main/**/*.test.ts'],
          exclude: [...configDefaults.exclude, 'src/main/library.test.ts']
        }
      },
      {
        extends: true,
        test: {
          name: 'native',
          environment: 'node',
          pool: 'forks',
          include: ['src/main/library.test.ts']
        }
      }
    ],
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
