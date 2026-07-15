import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { arch, cpus, platform, release, totalmem } from 'node:os'
import { relative, resolve } from 'node:path'
import { analyzeWav, type SampleAnalysisResult } from '../src/renderer/src/backend/analysis'

interface CorpusFile {
  absolutePath: string
  sampleRef: string
  bytes: number
}

interface FileMeasurement {
  sampleRef: string
  bytes: number
  status: 'decoded' | 'unsupported' | 'failed'
  bpm: number | null
  musicalKey: string | null
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

const corpusDir = resolve('tmp/test-samples')
const outputDir = resolve('tmp/measure-analysis-corpus')
const timedRunCount = 3
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
      status: 'failed',
      bpm: null,
      musicalKey: null,
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
      status: 'unsupported',
      bpm: null,
      musicalKey: null,
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
    status: 'decoded',
    bpm: result.bpm,
    musicalKey: result.musicalKey,
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
): Promise<{ summary: RunSummary; details: FileMeasurement[] }> {
  const started = process.hrtime.bigint()
  const details: FileMeasurement[] = []
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
      result = analyzeWav(exactArrayBuffer(bytes))
    } catch (caught) {
      error = caught
    }
    details.push(summarizedResult(file, result, error))
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
    details
  }
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

async function main(): Promise<void> {
  const files = await discoverWavs(corpusDir)
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
      wavFiles: files.length,
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
    groundTruth: {
      source: 'User-confirmed corpus contract',
      expectedBpm: EXPECTED_BPM,
      expectedMusicalKey: EXPECTED_MUSICAL_KEY,
      bpmDetected: bpmDetected.length,
      bpmWithinFive: bpmWithinFive.length,
      bpmCoveragePercent: files.length === 0 ? 0 : bpmDetected.length / files.length * 100,
      bpmAccuracyAmongDetectedPercent: bpmDetected.length === 0 ? 0 : bpmWithinFive.length / bpmDetected.length * 100,
      keyDetected: keyDetected.length,
      keyExact: keyExact.length,
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

- Corpus: ${evidence.corpus.wavFiles} WAV files, ${evidence.corpus.bytes} bytes
- Corpus SHA-256: \`${evidence.corpus.sha256}\`
- Environment: ${evidence.environment.cpuModel}, ${evidence.environment.logicalCpuCount} logical CPUs, Node ${evidence.environment.node}
- Execution: sequential production \`analyzeWav\`; one correctness pass followed by ${timedRunCount} timed passes
- Decoded: ${evidence.correctness.decoded}
- Unsupported: ${evidence.correctness.unsupported}
- Failed: ${evidence.correctness.failed}
- Non-null BPM: ${evidence.correctness.bpmNonNull}
- Non-null musical key: ${evidence.correctness.keyNonNull}
- Non-null sample type: ${evidence.correctness.sampleTypeNonNull}
- Ground truth: ${EXPECTED_BPM} BPM and ${EXPECTED_MUSICAL_KEY} for every file
- BPM within 5 of ground truth: ${evidence.groundTruth.bpmWithinFive}/${evidence.groundTruth.bpmDetected} detected (${evidence.groundTruth.bpmAccuracyAmongDetectedPercent.toFixed(2)}%); coverage ${evidence.groundTruth.bpmCoveragePercent.toFixed(2)}%
- Exact musical key: ${evidence.groundTruth.keyExact}/${evidence.groundTruth.keyDetected} detected (${evidence.groundTruth.keyAccuracyAmongDetectedPercent.toFixed(2)}%); coverage ${evidence.groundTruth.keyCoveragePercent.toFixed(2)}%
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
