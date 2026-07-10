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

    // Extract the file path from the URL. The static server serves files
    // from out/renderer/, so URLs look like:
    //   http://localhost:4173/assets/index-xxx.js
    //   http://localhost:4173/index.html
    let filePath = null

    // Strip protocol and host, keep the pathname.
    const pathMatch = url.match(/https?:\/\/[^/]+(\/.+)/)
    const pathname = pathMatch ? pathMatch[1] : url

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
          const sExisting = existing.s ?? {}
          const sIncoming = incoming.s ?? {}
          for (const [k, v] of Object.entries(sIncoming)) {
            sExisting[k] = (sExisting[k] ?? 0) + v
          }
          existing.s = sExisting
          // For simplicity, keep the first set of maps (they don't change).
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
