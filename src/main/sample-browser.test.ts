import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { querySampleBrowser, type SampleBrowserCache } from './sample-browser'

let workDir: string
let cache: SampleBrowserCache

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'mixjam-sample-browser-'))
  cache = new Map()
})

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true })
})

describe('querySampleBrowser', () => {
  it('returns an empty list when sample folder is unset', async () => {
    expect(await querySampleBrowser(cache, null, '', false)).toEqual([])
  })

  it('recursively scans audio files only and derives category/path metadata', async () => {
    const drumsPath = join(workDir, 'Drums')
    const nestedPath = join(workDir, 'Loops', 'Bass')

    await mkdir(drumsPath, { recursive: true })
    await mkdir(nestedPath, { recursive: true })

    await writeFile(join(drumsPath, 'kick.wav'), 'a')
    await writeFile(join(nestedPath, 'acid.mp3'), 'ab')
    await writeFile(join(nestedPath, 'notes.txt'), 'ignore')

    const rows = await querySampleBrowser(cache, workDir, '', true)

    expect(rows).toHaveLength(2)
    const expectedPaths = [
      join(workDir, 'Drums', 'kick.wav'),
      join(workDir, 'Loops', 'Bass', 'acid.mp3')
    ].map((p) => p.toLowerCase()).sort()
    expect(rows.map((row) => row.filepath).sort()).toEqual(expectedPaths)
    expect(rows[0]?.category === 'Loops' || rows[0]?.category === 'Drums').toBe(true)
    expect(rows[1]?.category === 'Loops' || rows[1]?.category === 'Drums').toBe(true)
    expect(rows[0]?.tags.includes('MP3') || rows[0]?.tags.includes('WAV')).toBe(true)
    expect(rows[1]?.tags.includes('MP3') || rows[1]?.tags.includes('WAV')).toBe(true)
  })

  it('filters by name/path using the query value', async () => {
    await mkdir(join(workDir, 'Drums'), { recursive: true })
    await writeFile(join(workDir, 'Drums', 'kick_808.wav'), 'x')
    await writeFile(join(workDir, 'Drums', 'snare_clap.wav'), 'x')

    const rows = await querySampleBrowser(cache, workDir, 'kick', true)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.name).toBe('kick_808.wav')
  })

  it('reuses cached scan results until forceRescan is requested', async () => {
    await mkdir(join(workDir, 'Drums'), { recursive: true })
    await writeFile(join(workDir, 'Drums', 'kick.wav'), 'x')

    expect(await querySampleBrowser(cache, workDir, '', true)).toHaveLength(1)

    await writeFile(join(workDir, 'Drums', 'hat.wav'), 'x')

    expect(await querySampleBrowser(cache, workDir, '', false)).toHaveLength(1)
    expect(await querySampleBrowser(cache, workDir, '', true)).toHaveLength(2)
  })
})
