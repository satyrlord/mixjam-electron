/**
 * Presents unit and e2e coverage reports side-by-side. The unit report is the
 * primary quality-gate check (it instruments source TSX/TS directly, giving
 * accurate per-statement counts). The e2e report is supplementary — it
 * instruments the production bundle via source maps, so statement/branch IDs
 * differ and cannot be naively merged.
 *
 * Usage: node scripts/merge-coverage.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const UNIT_PATH = resolve(ROOT, 'coverage-unit', 'coverage-final.json')
const E2E_PATH = resolve(ROOT, 'coverage-e2e', 'coverage-final.json')

function loadCoverage(path) {
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf8'))
}

function computeSummary(coverage, label) {
  let totalStmts = 0, coveredStmts = 0
  let totalBranches = 0, coveredBranches = 0
  let totalFuncs = 0, coveredFuncs = 0
  let totalLines = 0, coveredLines = 0

  for (const file of Object.values(coverage)) {
    if (file.s) {
      const entries = Object.entries(file.s)
      totalStmts += entries.length
      coveredStmts += entries.filter(([, c]) => c > 0).length
    }
    if (file.b) {
      for (const counts of Object.values(file.b)) {
        totalBranches += counts.length
        for (const c of counts) coveredBranches += c > 0 ? 1 : 0
      }
    }
    if (file.f) {
      const entries = Object.entries(file.f)
      totalFuncs += entries.length
      coveredFuncs += entries.filter(([, c]) => c > 0).length
    }
    if (file.statementMap && file.s) {
      const lineHits = {}
      for (const [sid, sm] of Object.entries(file.statementMap)) {
        const line = sm.start?.line
        if (line) {
          if (!(line in lineHits)) { lineHits[line] = 0; totalLines++ }
          if (file.s[sid] > 0) lineHits[line]++
        }
      }
      coveredLines += Object.values(lineHits).filter((c) => c > 0).length
    }
  }

  const pct = (covered, total) => total ? ((covered / total) * 100).toFixed(2) : '100.00'
  const files = Object.keys(coverage).length

  return {
    label,
    files,
    statements: { total: totalStmts, covered: coveredStmts, pct: pct(coveredStmts, totalStmts) },
    branches: { total: totalBranches, covered: coveredBranches, pct: pct(coveredBranches, totalBranches) },
    functions: { total: totalFuncs, covered: coveredFuncs, pct: pct(coveredFuncs, totalFuncs) },
    lines: { total: totalLines, covered: coveredLines, pct: pct(coveredLines, totalLines) }
  }
}

function printSummary(s) {
  console.log(`  ${s.label}`)
  console.log(`    Statements : ${s.statements.pct}% (${s.statements.covered}/${s.statements.total})`)
  console.log(`    Branches   : ${s.branches.pct}% (${s.branches.covered}/${s.branches.total})`)
  console.log(`    Functions  : ${s.functions.pct}% (${s.functions.covered}/${s.functions.total})`)
  console.log(`    Lines      : ${s.lines.pct}% (${s.lines.covered}/${s.lines.total})`)
  console.log(`    Files      : ${s.files}`)
}

const unit = loadCoverage(UNIT_PATH)
const e2e = loadCoverage(E2E_PATH)

console.log('')
console.log('=========================== Coverage Report ===========================')

const unitSummary = unit ? computeSummary(unit, 'Unit (vitest + jsdom)') : null
const e2eSummary = e2e ? computeSummary(e2e, 'E2E  (Playwright + prod build)') : null

if (unitSummary) printSummary(unitSummary)
else console.log('  Unit: no data')

if (e2eSummary) printSummary(e2eSummary)
else console.log('  E2E:  no data')

console.log('=======================================================================')

// Quality gate: unit coverage must meet 70% on all cells.
const THRESHOLD = 70
if (!unitSummary) {
  console.log('FAIL: Unit coverage data missing. Run `npm run test:coverage` first.')
  process.exit(1)
}

function coverageCells(summary, prefix = '') {
  return [
    { name: `${prefix}Statements`, value: parseFloat(summary.statements.pct) },
    { name: `${prefix}Branches`, value: parseFloat(summary.branches.pct) },
    { name: `${prefix}Functions`, value: parseFloat(summary.functions.pct) },
    { name: `${prefix}Lines`, value: parseFloat(summary.lines.pct) }
  ]
}

const cells = coverageCells(unitSummary, 'Global: ')
for (const [filePath, fileCoverage] of Object.entries(unit)) {
  const fileName = relative(ROOT, filePath)
  cells.push(...coverageCells(computeSummary({ [filePath]: fileCoverage }, fileName), `${fileName}: `))
}

const failures = cells.filter((c) => c.value < THRESHOLD)
if (failures.length > 0) {
  console.log(`FAIL: ${failures.length} unit coverage cell(s) below ${THRESHOLD}%:`)
  for (const f of failures) console.log(`  ${f.name}: ${f.value.toFixed(2)}%`)
  process.exit(1)
}

console.log(`PASS: All unit coverage cells >= ${THRESHOLD}%`)
