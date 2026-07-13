import type {
  FolderRef,
  MixJamFileContents
} from '../../../shared/backend-api'
import { isProjectRelativePath } from '../project/project-file'
import { resolveFileHandle } from './folder-access'
import { loadFolderHandle } from './handle-store'

const MIXJAM_EXTENSION = '.mixjam'
const PICKER_TYPES = [{
  description: 'MixJam project',
  accept: { 'application/json': [MIXJAM_EXTENSION] }
}]

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : !!error && typeof error === 'object' && (error as { name?: unknown }).name === 'AbortError'
}

async function loadAccessibleFolder(
  ref: FolderRef,
  mode: 'read' | 'readwrite'
): Promise<FileSystemDirectoryHandle> {
  const handle = await loadFolderHandle(ref.id)
  if (!handle) throw new Error(`The ${ref.name} folder is no longer available.`)
  let permission = await handle.queryPermission({ mode })
  if (permission !== 'granted') {
    try {
      permission = await handle.requestPermission({ mode })
    } catch {
      // Requesting stored-handle access requires transient user activation in
      // the browser. Present the same actionable message if activation expired.
    }
  }
  if (permission !== 'granted') throw new Error(`Access to the ${ref.name} folder is required.`)
  return handle
}

async function relativeProjectPath(
  root: FileSystemDirectoryHandle,
  file: FileSystemFileHandle
): Promise<string> {
  const segments = await root.resolve(file)
  const relpath = segments?.join('/') ?? ''
  if (!isProjectRelativePath(relpath)) {
    throw new Error('MixJam projects must be saved inside the selected User Folder.')
  }
  if (!relpath.toLowerCase().endsWith(MIXJAM_EXTENSION)) {
    throw new Error('MixJam project filenames must end in .mixjam.')
  }
  return relpath
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

export async function openMixJamFile(
  userFolder: FolderRef
): Promise<MixJamFileContents | null> {
  const root = await loadAccessibleFolder(userFolder, 'read')
  let handle: FileSystemFileHandle
  try {
    const selected = await window.showOpenFilePicker({
      id: 'mixjam-open-project',
      startIn: root,
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

  return {
    path: await relativeProjectPath(root, handle),
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
  const root = await loadAccessibleFolder(userFolder, 'read')
  const handle = await resolveFileHandle(root, projectRelpath)
  if (!handle) throw new Error(`The project "${projectRelpath}" could not be found.`)
  return { path: projectRelpath, contents: await readFile(handle) }
}

export async function saveMixJamFileAs(
  userFolder: FolderRef,
  suggestedName: string,
  contents: string
): Promise<MixJamFileContents | null> {
  const root = await loadAccessibleFolder(userFolder, 'readwrite')
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

  const path = await relativeProjectPath(root, handle)
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
  const root = await loadAccessibleFolder(userFolder, 'readwrite')
  const handle = await resolveFileHandle(root, projectRelpath)
  if (!handle) throw new Error(`The project "${projectRelpath}" could not be found.`)
  await writeFile(handle, contents)
}

export async function findMissingSampleFiles(
  sampleFolder: FolderRef,
  relpaths: string[]
): Promise<string[]> {
  const root = await loadAccessibleFolder(sampleFolder, 'read')
  const unique = [...new Set(relpaths)]
  const resolved = await Promise.all(unique.map(async (relpath) => ({
    relpath,
    handle: isProjectRelativePath(relpath) ? await resolveFileHandle(root, relpath) : null
  })))
  return resolved.filter((entry) => entry.handle === null).map((entry) => entry.relpath)
}
