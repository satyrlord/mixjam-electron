// Headless CLI over the shipped generator engine.
//
//   npm run generate:mixjam -- --profile trance --bpm 140 --duration 240 \
//     --samples-dir tmp/test-samples --output-dir tmp/generated-songs --seed abc123
//
// This is a developer tool, not a product surface: it exists so every change to
// the arrangement model is testable in seconds without Electron, a prepared
// SQLite index, or a UI. It runs the same `createMixJamGeneratorPlan` the
// wizard runs. It is never wired into the `generate-mix` skill — manual and
// programmatic generation are separate tracks.

import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { evaluateOccupancyEnvelope } from '../src/shared/generator-envelope'
import { computeMixJamMetrics } from '../src/shared/mixjam-metrics'
import { MIXJAM_GENERATOR_PROFILE_IDS } from '../src/shared/generator-templates'
import { createMixJamGeneratorPlan } from '../src/renderer/src/backend/generator-engine'
import { materializeGeneratedProject } from '../src/renderer/src/project/generated-project'
import { parseProject, serializeProject } from '../src/renderer/src/project/project-file'
import { loadCorpusCandidates } from './generate-mixjam-corpus'
import { measurableProjectFromDocument } from './mixjam-metrics-project'

export interface GenerateMixJamOptions {
  profile: string
  bpm: number
  durationSeconds: number
  intensity: 'low' | 'medium' | 'high'
  seed: string
  samplesDir: string
  outputDir: string
  cluster: string | null
  name: string | null
}

const OPTION_NAMES = new Set([
  'profile', 'bpm', 'duration', 'intensity', 'seed', 'samples-dir', 'output-dir', 'cluster', 'name'
])

export function parseGenerateMixJamArgs(argv: readonly string[]): GenerateMixJamOptions {
  const values = new Map<string, string>()
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]!
    if (!argument.startsWith('--')) throw new Error(`Unexpected argument: ${argument}`)
    const key = argument.slice(2)
    if (!OPTION_NAMES.has(key)) throw new Error(`Unknown option: --${key}`)
    const next = argv[index + 1]
    if (next === undefined || next.startsWith('--')) throw new Error(`Option --${key} needs a value.`)
    values.set(key, next)
    index++
  }
  const required = (key: string): string => {
    const value = values.get(key)
    if (value === undefined) throw new Error(`Missing required option --${key}.`)
    return value
  }
  const number = (key: string, fallback?: number): number => {
    const raw = values.get(key)
    if (raw === undefined) {
      if (fallback === undefined) throw new Error(`Missing required option --${key}.`)
      return fallback
    }
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) throw new Error(`Option --${key} must be a number.`)
    return parsed
  }
  const intensity = values.get('intensity') ?? 'medium'
  if (intensity !== 'low' && intensity !== 'medium' && intensity !== 'high') {
    throw new Error('Option --intensity must be low, medium, or high.')
  }
  const profile = required('profile')
  if (!MIXJAM_GENERATOR_PROFILE_IDS.includes(profile)) {
    throw new Error(`Unknown profile ${profile}. Available: ${MIXJAM_GENERATOR_PROFILE_IDS.join(', ')}.`)
  }
  return {
    profile,
    bpm: number('bpm'),
    durationSeconds: number('duration', 240),
    intensity,
    seed: values.get('seed') ?? 'cli',
    samplesDir: resolve(required('samples-dir')),
    outputDir: resolve(values.get('output-dir') ?? 'tmp/generated-songs'),
    cluster: values.get('cluster') ?? null,
    name: values.get('name') ?? null
  }
}

export function runGenerateMixJam(
  argv: readonly string[],
  write: (text: string) => void = (text) => process.stdout.write(text)
): string {
  const options = parseGenerateMixJamArgs(argv)
  const started = Date.now()
  const { candidates, skipped } = loadCorpusCandidates(options.samplesDir, options.cluster)
  if (candidates.length === 0) {
    throw new Error(`No readable WAV files under ${options.samplesDir}${options.cluster ? `/${options.cluster}` : ''}.`)
  }
  write(
    `Loaded ${candidates.length} candidates from ${basename(options.samplesDir)}` +
    `${options.cluster ? `/${options.cluster}` : ''}` +
    `${skipped > 0 ? ` (${skipped} unreadable)` : ''} in ${Date.now() - started} ms\n`
  )

  const plan = createMixJamGeneratorPlan(
    options.samplesDir,
    'cli',
    candidates,
    {
      profileId: options.profile,
      bpmMode: 'fixed',
      bpm: options.bpm,
      intensity: options.intensity,
      durationSeconds: options.durationSeconds,
      seed: options.seed
    },
    { attemptedFiles: candidates.length, analyzedFiles: candidates.length, uniqueReads: candidates.length },
    options.bpm
  )
  const project = materializeGeneratedProject(plan)
  const timestamp = new Date(started).toISOString()
  const document = serializeProject(project, { appVersion: 'cli', createdAt: timestamp, modifiedAt: timestamp })

  // Round-trip before writing. The planner's invariants and the project loader's
  // are separate checks, and a file that satisfies only the first is one the app
  // refuses to open — which is exactly how a batch of unloadable projects once
  // shipped. Failing here costs nothing; failing at load costs the user's file.
  const parsedProject = parseProject(document)

  mkdirSync(options.outputDir, { recursive: true })
  const name = options.name ?? `${options.profile}-${options.bpm}-${options.seed}`
  const target = join(options.outputDir, `${name}.mixjam`)
  writeFileSync(target, document, 'utf8')

  const metrics = computeMixJamMetrics(measurableProjectFromDocument(parsedProject))
  const report = evaluateOccupancyEnvelope(metrics)
  write(
    `\n${target}\n` +
    `profile ${plan.profileId} v${plan.profileVersion}, arc "${plan.arcName}", ` +
    `pool ${plan.poolToken ?? 'unlabeled'}, key ${plan.dominantKey ?? 'none'}\n` +
    `${metrics.bars} bars, ${metrics.populatedLanes} lanes, ${metrics.placements} placements, ` +
    `${metrics.distinctSamples} distinct samples\n` +
    `Envelope: ${report.passed}/${report.total} — run npm run audit:mixjam -- "${target}" for the full report.\n`
  )
  for (const measure of report.measures) {
    if (!measure.pass) write(`  FAIL ${measure.label}: ${measure.measured} (target ${measure.target})\n`)
  }
  // Audio features are not available without decoding every file, so RMS gain
  // compensation and loop-quality tiebreaks are inert here. The app applies both.
  write('\nNote: CLI candidates carry no audio analysis; gain compensation is inert.\n')
  return target
}

function isMainModule(): boolean {
  return process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
}

if (isMainModule()) {
  try {
    runGenerateMixJam(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
