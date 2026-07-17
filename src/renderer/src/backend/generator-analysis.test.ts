import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MixJamGeneratorParameters, SampleType } from '../../../shared/backend-api'
import { resolveFileHandle } from './folder-access'
import {
  analyzeGeneratorCandidates,
  MAX_GENERATOR_ANALYSES,
  MAX_GENERATOR_ATTEMPTS
} from './generator-analysis'
import { createMixJamGeneratorPlan } from './generator-engine'
import type { GeneratorCandidate } from './generator-library'

vi.mock('./folder-access', () => ({ resolveFileHandle: vi.fn() }))

const parameters: MixJamGeneratorParameters = {
  profileId: 'techno',
  bpmMode: 'fixed',
  bpm: 140,
  intensity: 'medium',
  durationSeconds: 180,
  seed: 'analysis-seed'
}

function candidate(index: number, sampleType: SampleType = 'Kick', relpath?: string): GeneratorCandidate {
  const percussive = ['Kick', 'Snare', 'Hi-hat', 'Percussion'].includes(sampleType)
  const wholeBar = ['Bass', 'Synth', 'Loop'].includes(sampleType)
  return {
    relpath: relpath ?? `${sampleType}/${String(index).padStart(3, '0')}.wav`,
    filename: `${sampleType}-${index}.wav`,
    sizeBytes: 1_000 + index,
    mtime: 2_000 + index,
    duration: percussive ? 0.25 : wholeBar ? 240 / 140 : 1,
    bpm: 140,
    musicalKey: sampleType === 'Kick' ? null : 'Am',
    sampleType,
    categoryName: 'Unsorted',
    paletteSlot: 8,
    metadataRevision: 1,
    analysisRevision: 1
  }
}

function wavBuffer(
  seconds = 1,
  sampleRate = 1_000,
  envelope: (progress: number) => number = () => 1
): ArrayBuffer {
  const samples = Math.round(seconds * sampleRate)
  const buffer = new ArrayBuffer(44 + samples * 2)
  const view = new DataView(buffer)
  const text = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index))
  }
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, samples * 2, true)
  for (let index = 0; index < samples; index++) {
    const pulse = index % 250 < 15 ? 0.8 * (1 - (index % 250) / 15) : 0
    const tone = Math.sin(2 * Math.PI * 110 * index / sampleRate) * 0.12
    view.setInt16(44 + index * 2, Math.round((pulse + tone) * envelope(index / samples) * 32767), true)
  }
  return buffer
}

function readableHandle(buffer = wavBuffer()): FileSystemFileHandle {
  return {
    getFile: vi.fn(async () => ({ arrayBuffer: async () => buffer }))
  } as unknown as FileSystemFileHandle
}

describe('generator transient analysis', () => {
  beforeEach(() => {
    vi.mocked(resolveFileHandle).mockReset()
    vi.mocked(resolveFileHandle).mockResolvedValue(readableHandle())
  })

  it('caps attempts at 96 unique paths', async () => {
    vi.mocked(resolveFileHandle).mockResolvedValue(null)
    const input = Array.from({ length: 120 }, (_, index) => candidate(index))

    const result = await analyzeGeneratorCandidates({} as FileSystemDirectoryHandle, input, parameters, vi.fn(), () => true)

    expect(result).toEqual([])
    expect(resolveFileHandle).toHaveBeenCalledTimes(MAX_GENERATOR_ATTEMPTS)
    expect(new Set(vi.mocked(resolveFileHandle).mock.calls.map((call) => call[1])).size)
      .toBe(MAX_GENERATOR_ATTEMPTS)
  })

  it('retains no more than 64 successful analyses', async () => {
    const input = (['Kick', 'Bass', 'Synth'] as const).flatMap((sampleType, typeIndex) =>
      Array.from({ length: 40 }, (_, index) => candidate(typeIndex * 100 + index, sampleType))
    )

    const result = await analyzeGeneratorCandidates({} as FileSystemDirectoryHandle, input, parameters, vi.fn(), () => true)

    expect(result).toHaveLength(MAX_GENERATOR_ANALYSES)
    expect(resolveFileHandle).toHaveBeenCalledTimes(MAX_GENERATOR_ANALYSES)
  })

  it('applies cheap span filters before spending the 96-read budget', async () => {
    const oversized = Array.from({ length: 120 }, (_, index) => ({
      ...candidate(index),
      duration: 10
    }))
    const valid = Array.from({ length: 3 }, (_, index) => candidate(200 + index))

    const result = await analyzeGeneratorCandidates(
      {} as FileSystemDirectoryHandle,
      [...oversized, ...valid],
      parameters,
      vi.fn(),
      () => true
    )

    expect(result).toHaveLength(3)
    expect(resolveFileHandle).toHaveBeenCalledTimes(3)
  })

  it('does not retain decoded role mismatches ahead of later core candidates', async () => {
    let reads = 0
    vi.mocked(resolveFileHandle).mockImplementation(async () =>
      readableHandle(reads++ < 64 ? wavBuffer(3) : wavBuffer(0.25))
    )
    const input = Array.from({ length: MAX_GENERATOR_ATTEMPTS }, (_, index) => candidate(index))

    const result = await analyzeGeneratorCandidates(
      {} as FileSystemDirectoryHandle,
      input,
      parameters,
      vi.fn(),
      () => true
    )

    expect(resolveFileHandle).toHaveBeenCalledTimes(MAX_GENERATOR_ATTEMPTS)
    expect(result).toHaveLength(MAX_GENERATOR_ATTEMPTS - 64)
    expect(result.every((entry) => entry.plannerKind === 'one-shot')).toBe(true)
  })

  it('reserves retained-analysis capacity for a late successful core role', async () => {
    let kickReads = 0
    let lateKickPath = ''
    vi.mocked(resolveFileHandle).mockImplementation(async (_root, relpath) => {
      if (relpath.startsWith('Kick/')) {
        kickReads++
        if (kickReads < 23) return null
        lateKickPath = relpath
      }
      return readableHandle()
    })
    const input = [
      ...Array.from({ length: 23 }, (_, index) => candidate(index, 'Kick')),
      ...Array.from({ length: 30 }, (_, index) => candidate(100 + index, 'Bass')),
      ...Array.from({ length: 60 }, (_, index) => candidate(200 + index, 'Synth'))
    ]
    const tranceParameters = { ...parameters, profileId: 'trance' as const }

    const result = await analyzeGeneratorCandidates(
      {} as FileSystemDirectoryHandle,
      input,
      tranceParameters,
      vi.fn(),
      () => true
    )

    expect(kickReads).toBe(23)
    expect(result).toHaveLength(MAX_GENERATOR_ANALYSES)
    expect(result.some((entry) => entry.relpath === lateKickPath)).toBe(true)
    expect(() => createMixJamGeneratorPlan(
      'root',
      'fingerprint',
      result,
      tranceParameters
    )).not.toThrow()
  })

  it('shortlists core roles before optional material', async () => {
    const optional = Array.from({ length: 120 }, (_, index) => candidate(index, 'Other'))
    const core = [candidate(200, 'Kick'), candidate(201, 'Bass'), candidate(202, 'Synth')]

    const result = await analyzeGeneratorCandidates(
      {} as FileSystemDirectoryHandle,
      [...optional, ...core],
      parameters,
      vi.fn(),
      () => true
    )

    expect(result.map((entry) => entry.sampleType)).toEqual(expect.arrayContaining(['Kick', 'Bass', 'Synth']))
  })

  it('shortlists in deterministic order and reads duplicate paths once', async () => {
    const input = [
      candidate(0, 'Kick', 'shared.wav'),
      candidate(1, 'Kick', 'shared.wav'),
      candidate(2, 'Bass'),
      candidate(3, 'Synth'),
      candidate(4, 'Kick')
    ]
    const first = await analyzeGeneratorCandidates({} as FileSystemDirectoryHandle, input, parameters, vi.fn(), () => true)
    const firstOrder = first.map((entry) => entry.relpath)
    vi.mocked(resolveFileHandle).mockClear()

    const second = await analyzeGeneratorCandidates(
      {} as FileSystemDirectoryHandle,
      [...input].reverse(),
      parameters,
      vi.fn(),
      () => true
    )

    expect(second.map((entry) => entry.relpath)).toEqual(firstOrder)
    expect(firstOrder.filter((path) => path === 'shared.wav')).toHaveLength(1)
    expect(new Set(vi.mocked(resolveFileHandle).mock.calls.map((call) => call[1])).size)
      .toBe(vi.mocked(resolveFileHandle).mock.calls.length)
  })

  it('advances past read and decode failures', async () => {
    vi.mocked(resolveFileHandle)
      .mockRejectedValueOnce(new Error('read failed'))
      .mockResolvedValueOnce(readableHandle(new ArrayBuffer(8)))
      .mockResolvedValue(readableHandle())
    const input = Array.from({ length: 6 }, (_, index) => candidate(index))

    const result = await analyzeGeneratorCandidates({} as FileSystemDirectoryHandle, input, parameters, vi.fn(), () => true)

    expect(resolveFileHandle).toHaveBeenCalledTimes(6)
    expect(result).toHaveLength(4)
  })

  it('returns bounded deterministic planner metrics and typed progress', async () => {
    const progress: Array<{ phase: string; completed: number; total: number }> = []
    const [result] = await analyzeGeneratorCandidates(
      {} as FileSystemDirectoryHandle,
      [candidate(0)],
      parameters,
      (event) => progress.push(event),
      () => true
    )

    expect(result).toBeDefined()
    expect(result!.rms).toBeGreaterThanOrEqual(0)
    expect(result!.rms).toBeLessThanOrEqual(1)
    expect(result!.peak).toBeGreaterThanOrEqual(0)
    expect(result!.peak).toBeLessThanOrEqual(1)
    expect(result!.spectralCentroid).toBeGreaterThanOrEqual(0)
    expect(result!.spectralCentroid).toBeLessThanOrEqual(500)
    for (const metric of ['transientDensity', 'attackStrength', 'rhythmicRegularity', 'loopConfidence', 'boundaryContinuity'] as const) {
      expect(result![metric]).toBeGreaterThanOrEqual(0)
      expect(result![metric]).toBeLessThanOrEqual(1)
    }
    expect(result!.energySlope).toBeGreaterThanOrEqual(-1)
    expect(result!.energySlope).toBeLessThanOrEqual(1)
    expect(result!.plannerKind).toBe('one-shot')
    expect(progress.map((event) => event.phase)).toEqual(['shortlisting', 'analyzing', 'analyzing'])
  })

  it('classifies metric-qualified Other audio as transition material', async () => {
    vi.mocked(resolveFileHandle)
      .mockResolvedValueOnce(readableHandle(wavBuffer(1, 1_000, (progress) => progress)))
      .mockResolvedValueOnce(readableHandle(wavBuffer(
        1,
        1_000,
        (progress) => progress >= 0.4 && progress < 0.5 ? 1 : 0
      )))

    const result = await analyzeGeneratorCandidates(
      {} as FileSystemDirectoryHandle,
      [candidate(0, 'Other', 'Other/riser.wav'), candidate(1, 'Other', 'Other/impact.wav')],
      parameters,
      vi.fn(),
      () => true
    )

    expect(result.map((entry) => entry.plannerKind).sort()).toEqual(['impact', 'riser'])
  })

  it('throws a clear cancellation error before and during analysis', async () => {
    await expect(analyzeGeneratorCandidates(
      {} as FileSystemDirectoryHandle,
      [candidate(0)],
      parameters,
      vi.fn(),
      () => false
    )).rejects.toThrow('MixJam generator planning was cancelled.')

    let checks = 0
    await expect(analyzeGeneratorCandidates(
      {} as FileSystemDirectoryHandle,
      [candidate(0), candidate(1)],
      parameters,
      vi.fn(),
      () => ++checks < 3
    )).rejects.toThrow('MixJam generator planning was cancelled.')
  })
})
