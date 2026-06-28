import { promises as fs, type Dirent } from 'node:fs'
import { basename, extname, join, relative } from 'node:path'
import type { SampleBrowserItem } from '../shared/ipc'
import { canonicalizePath } from './path-utils'

const AUDIO_FILE_EXTENSIONS = new Set(['.wav', '.mp3', '.flac', '.ogg', '.aiff'])

export type SampleBrowserCache = Map<string, SampleBrowserItem[]>

function toPortableRelativePath(sampleFolder: string, filePath: string): string {
  return relative(sampleFolder, filePath).replaceAll('\\', '/')
}

function formatSize(sizeInBytes: number): string {
  if (sizeInBytes < 1024) return `${sizeInBytes} B`
  if (sizeInBytes < 1024 * 1024) return `${(sizeInBytes / 1024).toFixed(1)} KB`
  return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`
}

function deriveCategory(relativePath: string): string {
  const firstSegment = relativePath.split('/')[0]
  return firstSegment && firstSegment !== relativePath ? firstSegment : 'Uncategorized'
}

function sortSamples(items: SampleBrowserItem[]): SampleBrowserItem[] {
  return [...items].sort((left, right) => {
    const nameOrder = left.name.localeCompare(right.name)
    return nameOrder !== 0 ? nameOrder : left.path.localeCompare(right.path)
  })
}

async function scanSampleFolder(sampleFolder: string): Promise<SampleBrowserItem[]> {
  const results: SampleBrowserItem[] = []

  async function walk(currentPath: string): Promise<void> {
    let entries: Dirent<string>[]

    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true, encoding: 'utf8' })
    } catch {
      return
    }

    for (const entry of entries) {
      const childPath = join(currentPath, entry.name)

      if (entry.isDirectory()) {
        await walk(childPath)
        continue
      }

      if (!entry.isFile()) continue

      const extension = extname(entry.name).toLowerCase()
      if (!AUDIO_FILE_EXTENSIONS.has(extension)) continue

      let stats: Awaited<ReturnType<typeof fs.stat>>
      try {
        stats = await fs.stat(childPath)
      } catch {
        continue
      }

      const relativePath = toPortableRelativePath(sampleFolder, childPath)
      const category = deriveCategory(relativePath)
      const extensionTag = extension.slice(1).toUpperCase()

      results.push({
        id: canonicalizePath(childPath),
        name: basename(relativePath),
        path: relativePath,
        category,
        duration: '--',
        metadata: [extensionTag, formatSize(stats.size)],
        tags: [category, extensionTag]
      })
    }
  }

  await walk(sampleFolder)
  return sortSamples(results)
}

function filterSamples(items: SampleBrowserItem[], searchQuery: string): SampleBrowserItem[] {
  const query = searchQuery.trim().toLowerCase()
  if (!query) return items

  return items.filter((item) => {
    const haystack = `${item.name} ${item.path}`.toLowerCase()
    return haystack.includes(query)
  })
}

export async function querySampleBrowser(
  cache: SampleBrowserCache,
  sampleFolder: string | null,
  searchQuery: string,
  forceRescan = false
): Promise<SampleBrowserItem[]> {
  if (!sampleFolder) return []

  const cacheKey = canonicalizePath(sampleFolder)
  if (forceRescan || !cache.has(cacheKey)) {
    cache.set(cacheKey, await scanSampleFolder(sampleFolder))
  }

  return filterSamples(cache.get(cacheKey) ?? [], searchQuery)
}
