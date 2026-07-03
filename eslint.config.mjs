import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'node_modules/**', '*.config.*', 'tmp/**', 'coverage/**', 'coverage-unit/**', '.design-sync/**', '.ds-sync/**', 'ds-bundle/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Main and preload run in the Electron Node/CommonJS environment.
    files: ['src/main/**/*.{ts,js}', 'src/preload/**/*.{ts,js}'],
    languageOptions: { globals: { ...globals.node } }
  },
  {
    // Renderer runs in the Chromium browser environment.
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    }
  },
  {
    // Build scripts run under Node.js.
    files: ['scripts/**/*.{mjs,js}'],
    languageOptions: { globals: { ...globals.node } }
  },
  {
    // E2E test files run under Node.js / Playwright.
    files: ['tests/**/*.{ts,js}'],
    languageOptions: { globals: { ...globals.node } }
  }
)
