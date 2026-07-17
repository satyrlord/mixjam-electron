import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// The two DB-backed backend suites run under plain Node (sqlite-wasm loads
// fine there with an in-memory database); everything else runs under jsdom.
const NODE_BACKEND_TESTS = [
  'src/renderer/src/backend/library.test.ts',
  'src/renderer/src/backend/indexer.test.ts',
  'src/renderer/src/backend/analysis.test.ts',
  'src/renderer/src/backend/analysis-runner.test.ts',
  'src/renderer/src/backend/analysis-library.test.ts',
  'src/renderer/src/backend/generator-engine.test.ts',
  'src/renderer/src/backend/generator-library.test.ts',
  'src/renderer/src/backend/schema.test.ts',
  'scripts/generate-mixer-test-song.test.ts'
]

export default defineConfig({
  plugins: [react()],
  test: {
    setupFiles: ['src/renderer/src/test/setup.ts'],
    projects: [
      {
        extends: true,
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['src/renderer/src/**/*.test.{ts,tsx}'],
          exclude: [...configDefaults.exclude, ...NODE_BACKEND_TESTS]
        }
      },
      {
        extends: true,
        test: {
          name: 'backend',
          environment: 'node',
          include: NODE_BACKEND_TESTS
        }
      }
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json'],
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
        'src/renderer/src/test/**',
        // Backend glue files depend on browser APIs (Worker, IndexedDB,
        // FileSystemDirectoryHandle) that cannot be mocked in the jsdom
        // unit-test environment. They are exercised by the e2e suite instead.
        'src/renderer/src/backend/client.ts',
        'src/renderer/src/backend/folder-access.ts',
        'src/renderer/src/backend/handle-store.ts',
        'src/renderer/src/backend/worker.ts'
      ]
    }
  }
})
