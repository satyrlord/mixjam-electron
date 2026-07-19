/**
 * Converts raw V8 coverage (collected by Playwright e2e tests) to Istanbul
 * format and writes it to coverage-e2e/. Run after test:e2e:coverage.
 *
 * Usage: node scripts/convert-e2e-coverage.mjs
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import v8toIstanbul from 'v8-to-istanbul'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const RAW_DIR = resolve(ROOT, 'coverage-e2e', 'raw')
const OUT_DIR = resolve(ROOT, 'coverage-e2e')

if (!existsSync(RAW_DIR)) {
  console.log('No raw e2e coverage data found. Run test:e2e:coverage first.')
  process.exit(0)
}

const rawFiles = readdirSync(RAW_DIR).filter((f) => f.endsWith('.json'))
if (rawFiles.length === 0) {
  console.log('No raw coverage files in', RAW_DIR)
  process.exit(0)
}

console.log(`Processing ${rawFiles.length} raw coverage file(s)...`)

// Istanbul coverage map: file path → { path, statementMap, fnMap, branchMap, s, f, b }
const merged = {}

for (const rawFile of rawFiles) {
  const raw = JSON.parse(readFileSync(resolve(RAW_DIR, rawFile), 'utf8'))

  for (const entry of raw) {
    // Only instrument source files, not third-party bundles.
    if (!entry.url) continue
    const url = entry.url.replace(/\\/g, '/')

    // Extract the file path from the app:// URL served by Electron. URLs look
    // like app://bundle/assets/index-xxx.js or app://bundle/index.html.
    let filePath = null

    let pathname = null
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'app:' && parsed.hostname === 'bundle') {
        pathname = parsed.pathname
      }
    } catch {
      // V8 may report anonymous or internal scripts that are not URLs.
    }

    if (pathname) {
      filePath = resolve(ROOT, 'out', 'renderer', ...pathname.split('/').filter(Boolean))
    }

    if (!filePath || !existsSync(filePath)) continue

    try {
      const converter = v8toIstanbul(filePath)
      await converter.load()
      converter.applyCoverage(entry.functions)
      const istanbulCoverage = await converter.toIstanbul()

      for (const [key, value] of Object.entries(istanbulCoverage)) {
        if (merged[key]) {
          // Merge statement/fn/branch hit counts.
          const existing = merged[key]
          const incoming = value
          for (const counterName of ['s', 'f', 'b']) {
            const existingCounters = existing[counterName] ?? {}
            const incomingCounters = incoming[counterName] ?? {}
            for (const [counterId, incomingValue] of Object.entries(incomingCounters)) {
              if (Array.isArray(incomingValue)) {
                const existingValue = existingCounters[counterId] ?? []
                existingCounters[counterId] = incomingValue.map(
                  (hitCount, branchIndex) => (existingValue[branchIndex] ?? 0) + hitCount
                )
              } else {
                existingCounters[counterId] = (existingCounters[counterId] ?? 0) + incomingValue
              }
            }
            existing[counterName] = existingCounters
          }
          // Keep the first set of maps; a bundle and its source map do not
          // change between tests in one coverage run.
        } else {
          merged[key] = value
        }
      }
    } catch (error) {
      console.warn(`Skipped coverage entry ${entry.url} from ${rawFile}:`, error)
    }
  }
}

const outPath = resolve(OUT_DIR, 'coverage-final.json')
writeFileSync(outPath, JSON.stringify(merged))
console.log(`Wrote Istanbul coverage to ${outPath}`)
console.log(`Covered ${Object.keys(merged).length} file(s).`)
