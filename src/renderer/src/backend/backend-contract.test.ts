// The BackendAPI contract, checked across every facade that must implement it.
//
// `BackendAPI` is restated four times: the contract type, the worker's
// `BackendCalls`, the vitest facade, and the plain-JS e2e mock. Only the first
// two are type-checked against each other, so a method added to one and
// forgotten in another surfaces as a runtime TypeError in an e2e run — or, as
// happened with `getGeneratorProgress`, is simply never exposed to the UI.
//
// The vitest facade is fully typed as `BackendAPI`, so its own key set is a
// trustworthy, self-maintaining list of the contract's members. These tests
// hold the untyped facades against it.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createBackendAPI } from '../test/backendApi'

// Vitest runs with the repo root as cwd (see vitest.config.ts `root`).
const E2E_MOCK_SOURCE = resolve('tests/e2e/mock-backend.js')

const CONTRACT_METHODS = Object.entries(
  createBackendAPI() as unknown as Record<string, unknown>
)
  .filter(([, value]) => typeof value === 'function')
  .map(([name]) => name)
  .sort()

describe('BackendAPI contract', () => {
  it('exposes a non-trivial surface', () => {
    expect(CONTRACT_METHODS.length).toBeGreaterThan(30)
    expect(CONTRACT_METHODS).toContain('querySamples')
    expect(CONTRACT_METHODS).toContain('readSampleBytes')
  })

  it('exposes generator planning together with its progress', () => {
    // The pair that had drifted: the worker serviced `getGeneratorProgress`
    // but no facade exposed it, so nothing but a test could reach it.
    expect(CONTRACT_METHODS).toContain('planMixJam')
    expect(CONTRACT_METHODS).toContain('cancelMixJamPlanning')
    expect(CONTRACT_METHODS).toContain('getGeneratorProgress')
  })

  it('the e2e mock implements every contract method', () => {
    // Plain ES5 and untyped by necessity (it is injected via addInitScript),
    // so this source check is the only guard available to it.
    const text = readFileSync(E2E_MOCK_SOURCE, 'utf8')
    const missing = CONTRACT_METHODS.filter(
      (name) => !new RegExp(`\\b${name}\\s*:`).test(text)
    )
    expect(missing).toEqual([])
  })
})
