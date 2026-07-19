import type {
  FolderRef,
  MixJamFileContents,
  OpenedMixJamFileContents
} from '../../../shared/backend-api'
import { isProjectRelativePath } from '../project/project-file'
import {
  openFolderForAutomaticAccess,
  relativePathForHandle,
  requireFolderForAutomaticAccess,
  requireFolderForUserAction,
  resolveFileHandle
} from './folder-access'

const MIXJAM_EXTENSION = '.mixjam'
const GENERATED_BASENAME_PATTERN = /^[A-Za-z0-9_-]+$/
const MAX_GENERATED_SUFFIX = 999_999
const PICKER_TYPES = [{
  description: 'MixJam project',
  accept: { 'application/json': [MIXJAM_EXTENSION] }
}]

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : !!error && typeof error === 'object' && (error as { name?: unknown }).name === 'AbortError'
}

function assertMixJamFileName(fileName: string): void {
  if (!fileName.toLowerCase().endsWith(MIXJAM_EXTENSION)) {
    throw new Error('MixJam project filenames must end in .mixjam.')
  }
}

async function writableProjectPath(
  root: FileSystemDirectoryHandle,
  file: FileSystemFileHandle
): Promise<string> {
  const relpath = (await relativePathForHandle(root, file)) ?? ''
  if (!isProjectRelativePath(relpath)) {
    throw new Error('MixJam projects must be saved inside the selected User Folder.')
  }
  assertMixJamFileName(relpath)
  return relpath
}

async function projectPathWithinUserFolder(
  root: FileSystemDirectoryHandle | null,
  file: FileSystemFileHandle
): Promise<string | null> {
  if (!root) return null
  try {
    const relpath = (await relativePathForHandle(root, file)) ?? ''
    return isProjectRelativePath(relpath) && relpath.toLowerCase().endsWith(MIXJAM_EXTENSION)
      ? relpath
      : null
  } catch {
    // The picker grants access to the selected file itself. Failure to inspect
    // the stored User Folder only means the file cannot be treated as writable.
    return null
  }
}

async function readFile(fileHandle: FileSystemFileHandle): Promise<string> {
  return (await fileHandle.getFile()).text()
}

async function writeFile(fileHandle: FileSystemFileHandle, contents: string): Promise<void> {
  const writable = await fileHandle.createWritable()
  try {
    await writable.write(contents)
    // createWritable commits its temporary backing file only when close
    // succeeds, so the old project is not replaced by a partial JSON write.
    await writable.close()
  } catch (error) {
    try {
      await writable.abort(error)
    } catch {
      // Preserve the original write error.
    }
    throw error
  }
}

let serialQueueHead: Promise<unknown> = Promise.resolve(null)

function serialQueue<T>(run: () => Promise<T>): Promise<T> {
  const next = serialQueueHead.then(run, run)
  serialQueueHead = next.then(
    (value) => value,
    () => null
  )
  return next
}

async function createGeneratedMixJamFileUnlocked(
  userFolder: FolderRef,
  basename: string,
  contents: string
): Promise<MixJamFileContents> {
  if (!GENERATED_BASENAME_PATTERN.test(basename)) {
    throw new Error('Generated MixJam basenames may contain only letters, numbers, underscores, and hyphens.')
  }
  const root = await requireFolderForAutomaticAccess(userFolder, 'user')
  let maximumExistingSuffix = 0
  const prefix = `${basename}-`
  for await (const name of root.keys()) {
    if (!name.startsWith(prefix) || !name.endsWith(MIXJAM_EXTENSION)) continue
    const rawSuffix = name.slice(prefix.length, -MIXJAM_EXTENSION.length)
    if (/^[0-9]{3,6}$/.test(rawSuffix)) {
      maximumExistingSuffix = Math.max(maximumExistingSuffix, Number(rawSuffix))
    }
  }
  for (let suffix = maximumExistingSuffix + 1; suffix <= MAX_GENERATED_SUFFIX; suffix++) {
    const filename = `${basename}-${String(suffix).padStart(3, '0')}${MIXJAM_EXTENSION}`
    try {
      await root.getFileHandle(filename)
      continue
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error
    }
    const handle = await root.getFileHandle(filename, { create: true })
    try {
      await writeFile(handle, contents)
    } catch (error) {
      try {
        await root.removeEntry(filename)
      } catch {
        // Preserve the write failure; cleanup is best effort.
      }
      throw error
    }
    return { path: filename, contents }
  }
  throw new Error('MixJam could not allocate a generated project filename.')
}

/**
 * Creates the first free monotonically suffixed project name. Calls are queued
 * inside this app instance so two generator actions cannot claim the same name.
 * File System Access has no cross-process exclusive-create primitive; the
 * check-before-create behavior therefore follows the single-tab app contract.
 */
export function createGeneratedMixJamFile(
  userFolder: FolderRef,
  basename: string,
  contents: string
): Promise<MixJamFileContents> {
  return serialQueue(() => createGeneratedMixJamFileUnlocked(userFolder, basename, contents))
}

export async function openMixJamFile(
  userFolder: FolderRef
): Promise<OpenedMixJamFileContents | null> {
  const root = await openFolderForAutomaticAccess(userFolder, 'user')
  let handle: FileSystemFileHandle
  try {
    const selected = await window.showOpenFilePicker({
      id: 'mixjam-open-project',
      types: PICKER_TYPES,
      excludeAcceptAllOption: true,
      multiple: false
    })
    const first = selected[0]
    if (!first) return null
    handle = first
  } catch (error) {
    if (isAbortError(error)) return null
    throw error
  }

  assertMixJamFileName(handle.name)
  return {
    path: await projectPathWithinUserFolder(root, handle),
    fileName: handle.name,
    contents: await readFile(handle)
  }
}

export async function readMixJamFile(
  userFolder: FolderRef,
  projectRelpath: string
): Promise<MixJamFileContents> {
  if (!isProjectRelativePath(projectRelpath) || !projectRelpath.toLowerCase().endsWith(MIXJAM_EXTENSION)) {
    throw new Error('The MixJam project path is invalid.')
  }
  const root = await requireFolderForAutomaticAccess(userFolder, 'user')
  const handle = await resolveFileHandle(root, projectRelpath)
  if (!handle) throw new Error(`The project "${projectRelpath}" could not be found.`)
  return { path: projectRelpath, contents: await readFile(handle) }
}

export async function saveMixJamFileAs(
  userFolder: FolderRef,
  suggestedName: string,
  contents: string
): Promise<MixJamFileContents | null> {
  const root = await requireFolderForUserAction(userFolder, 'user')
  let handle: FileSystemFileHandle
  try {
    handle = await window.showSaveFilePicker({
      id: 'mixjam-save-project',
      startIn: root,
      suggestedName: suggestedName.toLowerCase().endsWith(MIXJAM_EXTENSION)
        ? suggestedName
        : `${suggestedName}${MIXJAM_EXTENSION}`,
      types: PICKER_TYPES,
      excludeAcceptAllOption: true
    })
  } catch (error) {
    if (isAbortError(error)) return null
    throw error
  }

  const path = await writableProjectPath(root, handle)
  await writeFile(handle, contents)
  return { path, contents }
}

export async function writeMixJamFile(
  userFolder: FolderRef,
  projectRelpath: string,
  contents: string
): Promise<void> {
  if (!isProjectRelativePath(projectRelpath) || !projectRelpath.toLowerCase().endsWith(MIXJAM_EXTENSION)) {
    throw new Error('The MixJam project path is invalid.')
  }
  const root = await requireFolderForUserAction(userFolder, 'user')
  const handle = await resolveFileHandle(root, projectRelpath)
  if (!handle) throw new Error(`The project "${projectRelpath}" could not be found.`)
  await writeFile(handle, contents)
}

export async function findMissingSampleFiles(
  sampleFolder: FolderRef,
  relpaths: string[]
): Promise<string[]> {
  const root = await requireFolderForAutomaticAccess(sampleFolder, 'sample')
  const unique = [...new Set(relpaths)]
  const resolved = await Promise.all(unique.map(async (relpath) => ({
    relpath,
    handle: isProjectRelativePath(relpath) ? await resolveFileHandle(root, relpath) : null
  })))
  return resolved.filter((entry) => entry.handle === null).map((entry) => entry.relpath)
}
