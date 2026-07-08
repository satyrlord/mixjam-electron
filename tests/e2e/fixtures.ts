/**
 * Shared Playwright fixtures for e2e tests.
 *
 * The mock BackendAPI is defined INLINE inside addInitScript — functions
 * cannot survive structured-clone serialization, so the entire mock lives
 * as a string in the browser context. main.tsx's guard
 * (`if (!window.backendAPI)`) leaves the injected mock in place.
 */
import { test as base, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Playwright transpiles TS to CJS at runtime, so import.meta is unavailable.
// Tests are always started from the repo root by the npm scripts.
const RAW_COVERAGE_DIR = resolve(process.cwd(), 'coverage-e2e', 'raw')

interface E2EFixtures {
  seededPage: Page
}

export const test = base.extend<E2EFixtures>({
  seededPage: async ({ page }, use, testInfo) => {
    // Start V8 JS coverage before anything loads so the entire app bundle,
    // worker, and wasm paths are captured.
    await page.coverage.startJSCoverage({ resetOnNavigation: false })

    // Must be inline: structured clone strips functions from objects passed
    // through addInitScript's argument serialization.
    await page.addInitScript(() => {
      // Everything is defined inside the browser context — no imports, no
      // TypeScript, just plain ES5-compatible JavaScript.
      const MOCK_SESSION = {
        userFolder: { id: 'e2e-user-folder', name: 'MixJam' },
        sampleFolder: { id: 'e2e-sample-folder', name: 'Samples' }
      }

      const MOCK_RECENT = [
        { path: 'club-night.mixjam', displayName: 'club-night', lastOpened: '2026-06-28T12:00:00.000Z' },
        { path: 'archive/sunrise.mixjam', displayName: 'sunrise', lastOpened: null }
      ]

      const MOCK_SAMPLES = [
        { id: 1, relpath: 'Drums/Kicks/kick_808.wav', filename: 'kick_808.wav', ext: 'wav', sizeBytes: 1024, duration: 0.5, sampleRate: 44100, channels: 1, bpm: null, musicalKey: null, dateAdded: 1000, scanState: 1, categoryId: 2, tagIds: [], tags: [] },
        { id: 2, relpath: 'Drums/Snares/snare_clap.wav', filename: 'snare_clap.wav', ext: 'wav', sizeBytes: 2048, duration: 0.3, sampleRate: 44100, channels: 1, bpm: null, musicalKey: null, dateAdded: 1001, scanState: 1, categoryId: 2, tagIds: [], tags: [] },
        { id: 3, relpath: 'Bass/deep_sub.wav', filename: 'deep_sub.wav', ext: 'wav', sizeBytes: 4096, duration: 1.2, sampleRate: 44100, channels: 1, bpm: null, musicalKey: null, dateAdded: 1002, scanState: 1, categoryId: 1, tagIds: [], tags: [] },
        { id: 4, relpath: 'Synth/pad_warm.wav', filename: 'pad_warm.wav', ext: 'wav', sizeBytes: 8192, duration: 2.0, sampleRate: 44100, channels: 2, bpm: 120, musicalKey: 'C', dateAdded: 1003, scanState: 1, categoryId: 4, tagIds: [], tags: [] },
        { id: 5, relpath: 'FX/riser_imp.wav', filename: 'riser_imp.wav', ext: 'wav', sizeBytes: 1536, duration: 0.8, sampleRate: 44100, channels: 1, bpm: null, musicalKey: null, dateAdded: 1004, scanState: 1, categoryId: 3, tagIds: [1], tags: ['fav'] }
      ]

      const MOCK_CATEGORIES = [
        { id: 1, name: 'Bass', parentId: null },
        { id: 2, name: 'Drums', parentId: null },
        { id: 3, name: 'FX', parentId: null },
        { id: 4, name: 'Synth', parentId: null },
        { id: 5, name: 'Vocal', parentId: null },
        { id: 6, name: 'Loop', parentId: null },
        { id: 7, name: 'Percussion', parentId: null },
        { id: 8, name: 'Atmosphere', parentId: null },
        { id: 9, name: 'Unsorted', parentId: null }
      ]

      const MOCK_TAGS = [
        { id: 1, name: 'fav', color: '#ffcc00' }
      ]

      function querySamples(req) {
        let rows = MOCK_SAMPLES.slice()
        if (req.textSearch) {
          const q = req.textSearch.trim().toLowerCase()
          rows = rows.filter(function (r) { return (r.filename + ' ' + r.relpath).toLowerCase().indexOf(q) !== -1 })
        }
        if (req.categoryId !== undefined) {
          rows = rows.filter(function (r) { return r.categoryId === req.categoryId })
        }
        if (req.tagIds && req.tagIds.length) {
          rows = rows.filter(function (r) {
            return req.tagIds.some(function (id) { return r.tagIds.indexOf(id) !== -1 })
          })
        }
        const total = rows.length
        const offset = req.offset || 0
        const limit = req.limit || 200
        return { rows: rows.slice(offset, offset + limit), total: total }
      }

      // Assign BEFORE the app bundle executes.
      window.backendAPI = {
        getVersion: function () { return Promise.resolve('v0.test.0') },
        resizeToTracker: function () { return Promise.resolve() },
        resizeToHome: function () { return Promise.resolve() },
        openExternal: function () { return Promise.resolve() },
        loadSession: function () { return Promise.resolve(MOCK_SESSION) },
        saveSession: function () { return Promise.resolve() },
        loadRecentProjects: function () { return Promise.resolve(MOCK_RECENT) },
        recordRecentProject: function () { return Promise.resolve() },
        pickFolder: function () { return Promise.resolve(null) },
        validateFolder: function () { return Promise.resolve('ok') },
        requestFolderAccess: function () { return Promise.resolve(true) },
        hasSamples: function () { return Promise.resolve(true) },
        listMissingRelpaths: function () { return Promise.resolve([]) },
        startScan: function () { return Promise.resolve() },
        getScanProgress: function () { return Promise.resolve({ status: 'idle', phase: null, found: 0, processed: 0, total: 0 }) },
        querySamples: function (req) { return Promise.resolve(querySamples(req)) },
        listTags: function () { return Promise.resolve(MOCK_TAGS) },
        createTag: function (name) { return Promise.resolve({ id: 99, name: name, color: null }) },
        renameTag: function () { return Promise.resolve() },
        deleteTag: function () { return Promise.resolve() },
        assignTag: function () { return Promise.resolve() },
        unassignTag: function () { return Promise.resolve() },
        listCategories: function () { return Promise.resolve(MOCK_CATEGORIES) },
        createCategory: function (name) { return Promise.resolve({ id: 99, name: name, parentId: null }) },
        deleteCategory: function () { return Promise.resolve() },
        listLibraries: function () { return Promise.resolve([]) },
        saveLibrary: function (name, ruleJson) { return Promise.resolve({ id: 1, name: name, createdAt: Date.now(), ruleJson: ruleJson }) },
        deleteLibrary: function () { return Promise.resolve() },
        readSampleBytes: function () { return Promise.resolve(null) },
        onScanProgress: function () { return function () {} },
        onScanDone: function () { return function () {} }
      }
    })

    await page.goto('/')
    // Wait for the React root to render children.
    await page.waitForSelector('#root > *', { timeout: 15_000 })
    await use(page)

    // Stop coverage and persist raw V8 data for the Istanbul converter.
    const coverage = await page.coverage.stopJSCoverage()
    if (coverage.length > 0) {
      mkdirSync(RAW_COVERAGE_DIR, { recursive: true })
      const safeName = testInfo.title.replace(/[^a-zA-Z0-9_-]/g, '_')
      const outPath = resolve(RAW_COVERAGE_DIR, `${safeName}.json`)
      writeFileSync(outPath, JSON.stringify(coverage))
    }
  }
})

export { expect } from '@playwright/test'
