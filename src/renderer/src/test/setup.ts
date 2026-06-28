import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { createElectronAPI } from './electronApi'
import { bootstrapTheme } from '../theme/themes'

Object.defineProperty(window, 'electronAPI', {
  configurable: true,
  value: createElectronAPI()
})

// Mirror the synchronous theme bootstrap from main.tsx (spec-002 AC-001).
// In production, main.tsx applies the theme before React mounts; tests must
// do the same since they render <App /> directly.
bootstrapTheme()

afterEach(() => {
  cleanup()
})
