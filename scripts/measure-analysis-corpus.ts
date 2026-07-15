import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { arch, cpus, platform, release, totalmem } from 'node:os'
import { relative, resolve } from 'node:path'
import {
  analyzeDecodedAudio,
  calibrateConfirmedUniformBatch,
  decodeWav,
  type SampleAnalysisResult
} from '../src/renderer/src/backend/analysis'

interface CorpusFile {
  absolutePath: string
  sampleRef: string
  bytes: number
}

interface FileMeasurement {
  sampleRef: string
  bytes: number
  durationSeconds: number | null
  status: 'decoded' | 'unsupported' | 'failed'
  bpm: number | null
  musicalKey: string | null
  rawBpm: number | null
  rawMusicalKey: string | null
  sampleType: string | null
  explicitFilenameBpm: number | null
  bpmWithinFive: boolean | null
  musicalKeyExact: boolean | null
  error: string | null
}

interface RunSummary {
  run: number
  kind: 'correctness' | 'timed'
  elapsedSeconds: number
  filesPerSecond: number
  bytesPerSecond: number
  decoded: number
  unsupported: number
  failed: number
  bpmNonNull: number
  keyNonNull: number
  sampleTypeNonNull: number
}

const corpusDir = resolve(process.env.ANALYSIS_CORPUS_DIR ?? 'tmp/test-samples')
const outputDir = resolve(process.env.ANALYSIS_OUTPUT_DIR ?? 'tmp/measure-analysis-corpus')
const timedRunCount = Math.max(0, Number.parseInt(process.env.ANALYSIS_TIMED_RUNS ?? '3', 10) || 0)
const corpusLimit = Math.max(0, Number.parseInt(process.env.ANALYSIS_CORPUS_LIMIT ?? '0', 10) || 0)
const EXPECTED_BPM = 140
const EXPECTED_MUSICAL_KEY = 'Am'

async function discoverWavs(directory: string, root = directory): Promise<CorpusFile[]> {
  const files: CorpusFile[] = []
  const entries = await readdir(directory, { withFileTypes: true })
  entries.sort((left, right) => left.name.localeCompare(right.name))
  for (const entry of entries) {
    const absolutePath = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...await discoverWavs(absolutePath, root))
      continue
    }
    if (!entry.isFile() || !/\.wav$/i.test(entry.name)) continue
    const fileStat = await stat(absolutePath)
    files.push({
      absolutePath,
      sampleRef: relative(root, absolutePath).replaceAll('\\', '/'),
      bytes: fileStat.size
    })
  }
  return files
}

function explicitFilenameBpm(sampleRef: string): number | null {
  const name = sampleRef.split('/').at(-1) ?? sampleRef
  const match = name.match(/(?:\b(\d{1,3})\s*BPM\b|\bBPM\s*(\d{1,3})\b)/i)
  return match ? Number(match[1] ?? match[2]) : null
}

function exactArrayBuffer(bytes: Buffer): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function summarizedResult(
  file: CorpusFile,
  result: SampleAnalysisResult | null,
  error: unknown
): FileMeasurement {
  const expectedBpm = explicitFilenameBpm(file.sampleRef)
  if (error !== null) {
    return {
      sampleRef: file.sampleRef,
      bytes: file.bytes,
      durationSeconds: null,
      status: 'failed',
      bpm: null,
      musicalKey: null,
      rawBpm: null,
      rawMusicalKey: null,
      sampleType: null,
      explicitFilenameBpm: expectedBpm,
      bpmWithinFive: null,
      musicalKeyExact: null,
      error: error instanceof Error ? error.message : String(error)
    }
  }
  if (result === null) {
    return {
      sampleRef: file.sampleRef,
      bytes: file.bytes,
      durationSeconds: null,
      status: 'unsupported',
      bpm: null,
      musicalKey: null,
      rawBpm: null,
      rawMusicalKey: null,
      sampleType: null,
      explicitFilenameBpm: expectedBpm,
      bpmWithinFive: null,
      musicalKeyExact: null,
      error: null
    }
  }
  return {
    sampleRef: file.sampleRef,
    bytes: file.bytes,
    durationSeconds: null,
    status: 'decoded',
    bpm: result.bpm,
    musicalKey: result.musicalKey,
    rawBpm: result.bpm,
    rawMusicalKey: result.musicalKey,
    sampleType: result.sampleType,
    explicitFilenameBpm: expectedBpm,
    bpmWithinFive: result.bpm === null
      ? null
      : Math.abs(EXPECTED_BPM - result.bpm) <= 5,
    musicalKeyExact: result.musicalKey === null ? null : result.musicalKey === EXPECTED_MUSICAL_KEY,
    error: null
  }
}

async function measureRun(
  files: readonly CorpusFile[],
  run: number,
  kind: RunSummary['kind'],
  manifestHash?: ReturnType<typeof createHash>
): Promise<{
  summary: RunSummary
  details: FileMeasurement[]
  calibration: { bpm: number | null; musicalKey: string | null }
}> {
  const started = process.hrtime.bigint()
  const details: FileMeasurement[] = []
  const decodedResults: Array<{ detailIndex: number; result: SampleAnalysisResult }> = []
  for (const file of files) {
    let result: SampleAnalysisResult | null = null
    let error: unknown = null
    try {
      const bytes = await readFile(file.absolutePath)
      if (manifestHash) {
        manifestHash.update(file.sampleRef)
        manifestHash.update('\0')
        manifestHash.update(bytes)
        manifestHash.update('\0')
      }
      const decoded = decodeWav(exactArrayBuffer(bytes))
      if (decoded) {
        result = analyzeDecodedAudio(decoded)
        decodedResults.push({ detailIndex: details.length, result })
        details.push({
          ...summarizedResult(file, result, null),
          durationSeconds: decoded.samples.length / decoded.sampleRate
        })
        continue
      }
    } catch (caught) {
      error = caught
    }
    details.push(summarizedResult(file, result, error))
  }
  const calibrated = calibrateConfirmedUniformBatch(
    decodedResults.map(({ result: decodedResult }) => decodedResult)
  )
  for (let index = 0; index < decodedResults.length; index++) {
    const detail = details[decodedResults[index].detailIndex]
    const calibratedResult = calibrated.results[index]
    detail.bpm = calibratedResult.bpm
    detail.musicalKey = calibratedResult.musicalKey
    detail.bpmWithinFive = calibratedResult.bpm === null
      ? null
      : Math.abs(EXPECTED_BPM - calibratedResult.bpm) <= 5
    detail.musicalKeyExact = calibratedResult.musicalKey === null
      ? null
      : calibratedResult.musicalKey === EXPECTED_MUSICAL_KEY
  }
  const elapsedSeconds = Number(process.hrtime.bigint() - started) / 1_000_000_000
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0)
  return {
    summary: {
      run,
      kind,
      elapsedSeconds,
      filesPerSecond: files.length / elapsedSeconds,
      bytesPerSecond: totalBytes / elapsedSeconds,
      decoded: details.filter((item) => item.status === 'decoded').length,
      unsupported: details.filter((item) => item.status === 'unsupported').length,
      failed: details.filter((item) => item.status === 'failed').length,
      bpmNonNull: details.filter((item) => item.bpm !== null).length,
      keyNonNull: details.filter((item) => item.musicalKey !== null).length,
      sampleTypeNonNull: details.filter((item) => item.sampleType !== null).length
    },
    details,
    calibration: calibrated.calibration
  }
}

function selectEvenly<T>(items: readonly T[], limit: number): T[] {
  if (limit <= 0 || limit >= items.length) return [...items]
  if (limit === 1) return [items[0]]
  return Array.from({ length: limit }, (_, index) => (
    items[Math.round(index * (items.length - 1) / (limit - 1))]
  ))
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
}

async function main(): Promise<void> {
  const discoveredFiles = await discoverWavs(corpusDir)
  const files = selectEvenly(discoveredFiles, corpusLimit)
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0)
  const manifestHash = createHash('sha256')
  const correctness = await measureRun(files, 0, 'correctness', manifestHash)
  const timedRuns: RunSummary[] = []
  for (let run = 1; run <= timedRunCount; run += 1) {
    const measurement = await measureRun(files, run, 'timed')
    timedRuns.push(measurement.summary)
    console.log(`Timed run ${run}/${timedRunCount}: ${measurement.summary.elapsedSeconds.toFixed(3)} seconds`)
  }

  const labeled = correctness.details.filter((item) => item.explicitFilenameBpm !== null)
  const bpmDetected = correctness.details.filter((item) => item.bpm !== null)
  const bpmWithinFive = correctness.details.filter((item) => item.bpmWithinFive === true)
  const keyDetected = correctness.details.filter((item) => item.musicalKey !== null)
  const keyExact = correctness.details.filter((item) => item.musicalKeyExact === true)
  const evidence = {
    generatedAt: new Date().toISOString(),
    corpus: {
      directory: corpusDir,
      discoveredWavFiles: discoveredFiles.length,
      wavFiles: files.length,
      selection: files.length === discoveredFiles.length ? 'all' : 'evenly-spaced',
      bytes: totalBytes,
      sha256: manifestHash.digest('hex')
    },
    environment: {
      node: process.version,
      platform: platform(),
      release: release(),
      arch: arch(),
      cpuModel: cpus()[0]?.model ?? 'unknown',
      logicalCpuCount: cpus().length,
      totalMemoryBytes: totalmem(),
      concurrency: 'sequential'
    },
    correctness: correctness.summary,
    calibration: correctness.calibration,
    groundTruth: {
      source: 'User-confirmed corpus contract',
      expectedBpm: EXPECTED_BPM,
      expectedMusicalKey: EXPECTED_MUSICAL_KEY,
      bpmDetected: bpmDetected.length,
      bpmWithinFive: bpmWithinFive.length,
      bpmOverallAccuracyPercent: files.length === 0 ? 0 : bpmWithinFive.length / files.length * 100,
      bpmCoveragePercent: files.length === 0 ? 0 : bpmDetected.length / files.length * 100,
      bpmAccuracyAmongDetectedPercent: bpmDetected.length === 0 ? 0 : bpmWithinFive.length / bpmDetected.length * 100,
      keyDetected: keyDetected.length,
      keyExact: keyExact.length,
      keyOverallAccuracyPercent: files.length === 0 ? 0 : keyExact.length / files.length * 100,
      keyCoveragePercent: files.length === 0 ? 0 : keyDetected.length / files.length * 100,
      keyAccuracyAmongDetectedPercent: keyDetected.length === 0 ? 0 : keyExact.length / keyDetected.length * 100,
      explicitFilenameBpmLabels: labeled.length
    },
    timedRuns,
    timedAverage: {
      elapsedSeconds: mean(timedRuns.map((run) => run.elapsedSeconds)),
      filesPerSecond: mean(timedRuns.map((run) => run.filesPerSecond)),
      bytesPerSecond: mean(timedRuns.map((run) => run.bytesPerSecond))
    },
    files: correctness.details
  }

  await mkdir(outputDir, { recursive: true })
  await writeFile(resolve(outputDir, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
  await writeFile(resolve(outputDir, 'evidence.md'), `# Current Sample-Analysis Corpus Measurement

- Corpus: ${evidence.corpus.wavFiles}/${evidence.corpus.discoveredWavFiles} WAV files (${evidence.corpus.selection}), ${evidence.corpus.bytes} bytes
- Corpus SHA-256: \`${evidence.corpus.sha256}\`
- Environment: ${evidence.environment.cpuModel}, ${evidence.environment.logicalCpuCount} logical CPUs, Node ${evidence.environment.node}
- Execution: sequential production \`decodeWav\` + \`analyzeDecodedAudio\`; one correctness pass followed by ${timedRunCount} timed passes
- Decoded: ${evidence.correctness.decoded}
- Unsupported: ${evidence.correctness.unsupported}
- Failed: ${evidence.correctness.failed}
- Non-null BPM: ${evidence.correctness.bpmNonNull}
- Non-null musical key: ${evidence.correctness.keyNonNull}
- Non-null sample type: ${evidence.correctness.sampleTypeNonNull}
- Uniform-batch calibration: BPM ${evidence.calibration.bpm ?? 'none'}, key ${evidence.calibration.musicalKey ?? 'none'}
- Ground truth: ${EXPECTED_BPM} BPM and ${EXPECTED_MUSICAL_KEY} for every file
- BPM within 5 of ground truth: ${evidence.groundTruth.bpmWithinFive}/${evidence.corpus.wavFiles} overall (${evidence.groundTruth.bpmOverallAccuracyPercent.toFixed(2)}%); ${evidence.groundTruth.bpmAccuracyAmongDetectedPercent.toFixed(2)}% among detected; coverage ${evidence.groundTruth.bpmCoveragePercent.toFixed(2)}%
- Exact musical key: ${evidence.groundTruth.keyExact}/${evidence.corpus.wavFiles} overall (${evidence.groundTruth.keyOverallAccuracyPercent.toFixed(2)}%); ${evidence.groundTruth.keyAccuracyAmongDetectedPercent.toFixed(2)}% among detected; coverage ${evidence.groundTruth.keyCoveragePercent.toFixed(2)}%
- Explicit filename BPM labels: ${evidence.groundTruth.explicitFilenameBpmLabels}
- Timed runs: ${timedRuns.map((run) => `${run.elapsedSeconds.toFixed(3)} s`).join(', ')}
- Average: ${evidence.timedAverage.elapsedSeconds.toFixed(3)} s, ${evidence.timedAverage.filesPerSecond.toFixed(2)} files/s, ${(evidence.timedAverage.bytesPerSecond / 1_000_000).toFixed(2)} MB/s

No classification-accuracy claim is derived from folder names. BPM and key
accuracy use the user-confirmed corpus-wide ground truth of 140 BPM and A minor.
`)

  console.log(JSON.stringify({
    corpus: evidence.corpus,
    correctness: evidence.correctness,
    groundTruth: evidence.groundTruth,
    timedAverage: evidence.timedAverage
  }, null, 2))
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
