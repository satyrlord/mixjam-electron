import { promises as fs, type Dirent } from 'node:fs'
import { basename, extname, join, relative } from 'node:path'
import type { SampleListItem } from '../shared/ipc'
import { AUDIO_EXTENSIONS, canonicalizePath } from './path-utils'
import { UNSORTED_CATEGORY } from './library'

export type SampleBrowserCache = Map<string, SampleListItem[]>

function toPortableRelativePath(sampleFolder: string, filePath: string): string {
  return relative(sampleFolder, filePath).replaceAll('\\', '/')
}

function deriveCategory(relativePath: string): string {
  const firstSegment = relativePath.split('/')[0]
  // Root-level files share the same "Unsorted" label as the indexed DB browser.
  return firstSegment && firstSegment !== relativePath ? firstSegment : UNSORTED_CATEGORY
}

function sortSampleList(items: SampleListItem[]): SampleListItem[] {
  return [...items].sort((left, right) => {
    const nameOrder = left.name.localeCompare(right.name)
    return nameOrder !== 0 ? nameOrder : left.filepath.localeCompare(right.filepath)
  })
}

async function scanSampleFolder(sampleFolder: string): Promise<SampleListItem[]> {
  const results: SampleListItem[] = []

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
      if (!AUDIO_EXTENSIONS.has(extension)) continue

      const relativePath = toPortableRelativePath(sampleFolder, childPath)
      const absolutePath = canonicalizePath(childPath)
      const category = deriveCategory(relativePath)
      const extensionTag = extension.slice(1).toUpperCase()

      results.push({
        id: absolutePath,
        dbId: null,
        name: basename(relativePath),
        filepath: absolutePath,
        category,
        durationSeconds: null,
        tags: [category, extensionTag],
        categoryId: null,
        tagIds: []
      })
    }
  }

  await walk(sampleFolder)
  return sortSampleList(results)
}

function filterSampleList(items: SampleListItem[], searchQuery: string): SampleListItem[] {
  const query = searchQuery.trim().toLowerCase()
  if (!query) return items

  return items.filter((item) => {
    const haystack = `${item.name} ${item.filepath}`.toLowerCase()
    return haystack.includes(query)
  })
}

export async function querySampleBrowser(
  cache: SampleBrowserCache,
  sampleFolder: string | null,
  searchQuery: string,
  forceRescan = false
): Promise<SampleListItem[]> {
  if (!sampleFolder) return []

  const cacheKey = canonicalizePath(sampleFolder)
  if (forceRescan || !cache.has(cacheKey)) {
    cache.set(cacheKey, await scanSampleFolder(sampleFolder))
  }

  return filterSampleList(cache.get(cacheKey) ?? [], searchQuery)
}
