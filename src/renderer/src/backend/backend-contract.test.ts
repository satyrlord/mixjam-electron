// Typed adapters are checked by TypeScript. BACKEND_API_METHODS is the complete
// runtime inventory used to hold the injected plain-JavaScript E2E adapter to
// the same seam.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BACKEND_API_METHODS } from '../../../shared/backend-api'
import { createBackendAPI } from '../test/backendApi'

const E2E_MOCK_SOURCE = resolve(process.cwd(), 'tests/e2e/mock-backend.js')

const TYPED_TEST_METHODS = Object.entries(
  createBackendAPI() as unknown as Record<string, unknown>
)
  .filter(([, value]) => typeof value === 'function')
  .map(([name]) => name)
  .sort()

describe('BackendAPI contract', () => {
  it('exposes a non-trivial surface', () => {
    expect(new Set(BACKEND_API_METHODS).size).toBe(BACKEND_API_METHODS.length)
    expect(BACKEND_API_METHODS.length).toBeGreaterThan(30)
    expect(BACKEND_API_METHODS).toContain('querySamples')
    expect(BACKEND_API_METHODS).toContain('readSampleBytes')
  })

  it('the typed test adapter implements the runtime inventory exactly', () => {
    expect(TYPED_TEST_METHODS).toEqual([...BACKEND_API_METHODS].sort())
  })

  it('the e2e mock implements every contract method', () => {
    // Plain ES5 and untyped by necessity (it is injected via addInitScript),
    // so this source check is the only guard available to it.
    const text = readFileSync(E2E_MOCK_SOURCE, 'utf8')
    const missing = BACKEND_API_METHODS.filter(
      (name) => !new RegExp(`\\b${name}\\s*:`).test(text)
    )
    expect(missing).toEqual([])
  })
})
