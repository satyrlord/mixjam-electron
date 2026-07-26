// Audit harness for .mixjam arrangements.
//
//   npm run audit:mixjam -- <path|dir> [...]            report the occupancy envelope
//   npm run audit:mixjam -- <path> --baseline           add distance from the reference range
//   npm run audit:mixjam -- <dir> --emit-baseline <out> write the distilled reference metrics
//
// Per spec-021 the envelope is a report, not a gate: a FAIL row is information
// for the person listening, and the exit code is non-zero only so CI can pin the
// generated fixtures.

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ENVELOPE_MEASURES, evaluateOccupancyEnvelope } from '../src/shared/generator-envelope'
import { computeMixJamMetrics, type MeasurableProject, type MixJamMetrics } from '../src/shared/mixjam-metrics'
import { parseProject } from '../src/renderer/src/project/project-file'
import { measurableProjectFromDocument } from './mixjam-metrics-project'
import {
  REFERENCE_METRICS_PATH,
  loadReferenceBaseline,
  referenceRange,
  distilReferenceEntry,
  type ReferenceBaseline
} from '../src/shared/generator-reference-metrics'

interface Options {
  inputs: string[]
  baseline: boolean
  emitBaseline: string | null
}

export function parseAuditArgs(argv: readonly string[]): Options {
  const options: Options = { inputs: [], baseline: false, emitBaseline: null }
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]!
    if (argument === '--baseline') options.baseline = true
    else if (argument === '--emit-baseline') options.emitBaseline = argv[++index] ?? REFERENCE_METRICS_PATH
    else if (argument.startsWith('--')) throw new Error(`Unknown option: ${argument}`)
    else options.inputs.push(argument)
  }
  if (options.inputs.length === 0) throw new Error('Usage: audit-mixjam <path|dir> [...] [--baseline] [--emit-baseline <file>]')
  return options
}

function expandInputs(inputs: readonly string[]): string[] {
  return inputs.flatMap((input) => {
    const path = resolve(input)
    if (!statSync(path).isDirectory()) return [path]
    return readdirSync(path)
      .filter((entry) => extname(entry).toLowerCase() === '.mixjam')
      .sort()
      .map((entry) => join(path, entry))
  })
}

export function readAuditProject(path: string): MeasurableProject {
  try {
    return measurableProjectFromDocument(parseProject(readFileSync(path, 'utf8')))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${path}: ${message}`, { cause: error })
  }
}

const SPARK = '▁▂▃▄▅▆▇█'

function sparkline(values: readonly number[]): string {
  const peak = Math.max(1, ...values)
  return values.map((value) =>
    SPARK[Math.min(SPARK.length - 1, Math.round(value / peak * (SPARK.length - 1)))]
  ).join('')
}

function pad(value: string, width: number, align: 'left' | 'right' = 'left'): string {
  return align === 'left' ? value.padEnd(width) : value.padStart(width)
}

function renderTable(headers: readonly string[], rows: readonly (readonly string[])[], right: ReadonlySet<number>): string {
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => row[column]!.length))
  )
  const line = (cells: readonly string[]): string =>
    cells.map((cell, column) => pad(cell, widths[column]!, right.has(column) ? 'right' : 'left')).join('  ')
  return [line(headers), widths.map((width) => '-'.repeat(width)).join('  '), ...rows.map(line)].join('\n')
}

function reportProject(
  name: string, metrics: MixJamMetrics, baseline: ReferenceBaseline | null
): { text: string; passed: number; total: number } {
  const report = evaluateOccupancyEnvelope(metrics)
  const rows = report.measures.map((measure) => {
    const cells = [measure.pass ? 'PASS' : 'FAIL', measure.label, measure.target, measure.measured]
    if (!baseline) return cells
    const range = referenceRange(baseline, measure.id)
    const value = ENVELOPE_MEASURES.find((candidate) => candidate.id === measure.id)!.value(metrics)
    if (!range) return [...cells, 'n/a']
    const distance = value < range.min ? value - range.min : value > range.max ? value - range.max : 0
    return [...cells, distance === 0
      ? 'in range'
      : `${distance > 0 ? '+' : ''}${Number(distance.toFixed(3))}`]
  })
  const headers = ['', 'Measure', 'Target', 'Measured']
  if (baseline) headers.push('vs reference')

  const laneRows = metrics.lanes.map((lane) => [
    lane.name,
    lane.gain.toFixed(2),
    lane.pan.toFixed(2),
    lane.sends.map((send) => send.toFixed(2)).join('/') || '—',
    String(lane.placements),
    String(lane.distinctSamples),
    `${Math.round(lane.occupancy * 100)}%`,
    String(lane.entries)
  ])

  const text = [
    `\n${'='.repeat(72)}`,
    `${name}  —  ${metrics.bpm} BPM, ${metrics.bars} bars, ${metrics.populatedLanes} lanes, ` +
      `${metrics.placements} placements, ${metrics.distinctSamples} distinct samples`,
    `natural-rate ${metrics.naturalRatePlacements}, sub-beat ${metrics.subBeatPlacements}`,
    '='.repeat(72),
    renderTable(headers, rows, new Set()),
    '',
    `Density curve (peak ${metrics.densityPeak}, min ${metrics.densityMin}, mean ${metrics.densityMean.toFixed(1)}):`,
    sparkline(metrics.densityCurve),
    '',
    renderTable(
      ['Lane', 'gain', 'pan', 'sends', 'plc', 'dist', 'occ', 'ent'],
      laneRows,
      new Set([1, 2, 4, 5, 6, 7])
    ),
    '',
    `Envelope: ${report.passed}/${report.total} measures pass.`
  ].join('\n')
  return { text, passed: report.passed, total: report.total }
}

export function runAuditMixJam(
  argv: readonly string[],
  write: (text: string) => void = (text) => process.stdout.write(text)
): number {
  const options = parseAuditArgs(argv)
  const paths = expandInputs(options.inputs)
  const measured = paths.map((path) => ({
    name: basename(path, '.mixjam'),
    path,
    metrics: computeMixJamMetrics(readAuditProject(path))
  }))

  if (options.emitBaseline) {
    const baseline: ReferenceBaseline = {
      generatedFrom: measured.map((entry) => entry.name).sort(),
      projects: Object.fromEntries(
        measured.map((entry) => [entry.name, distilReferenceEntry(entry.metrics)])
      )
    }
    const target = resolve(options.emitBaseline)
    writeFileSync(target, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8')
    write(`Wrote ${measured.length} reference projects to ${target}\n`)
    return 0
  }

  const baseline = options.baseline ? loadReferenceBaseline() : null
  let failures = 0
  for (const entry of measured) {
    const report = reportProject(entry.name, entry.metrics, baseline)
    write(`${report.text}\n`)
    failures += report.total - report.passed
  }
  write(`\n${measured.length} project(s) audited, ${failures} measure failure(s).\n`)
  return failures === 0 ? 0 : 1
}

function isMainModule(): boolean {
  return process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
}

if (isMainModule()) {
  try {
    process.exitCode = runAuditMixJam(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
