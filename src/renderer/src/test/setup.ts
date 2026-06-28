import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { createElectronAPI } from './electronApi'

Object.defineProperty(window, 'electronAPI', {
  configurable: true,
  value: createElectronAPI()
})

afterEach(() => {
  cleanup()
})
