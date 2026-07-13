// Folder picking, permission management, and relpath-based file access over
// the File System Access API. Containment is structural: a directory handle
// can only reach its own subtree, so no realpath/prefix checks exist here.
import type { FolderRef, FolderRole, FolderValidation } from '../../../shared/backend-api'
import { loadFolderHandle, saveFolderHandle } from './handle-store'

/** The User Folder is written to (mixjam.json, projects); the Sample Folder is
 *  only ever read. */
function permissionMode(role: FolderRole): 'read' | 'readwrite' {
  return role === 'user' ? 'readwrite' : 'read'
}

/** Shows the directory picker. Resolves null when the user cancels. */
export async function pickFolder(role: FolderRole): Promise<FolderRef | null> {
  let handle: FileSystemDirectoryHandle
  try {
    handle = await window.showDirectoryPicker({
      id: `mixjam-${role}`,
      mode: permissionMode(role),
      startIn: role === 'user' ? 'documents' : 'music'
    })
  } catch {
    // AbortError (user cancelled) or SecurityError — either way, no folder.
    return null
  }
  return saveFolderHandle(handle)
}

/** Probes writability with a real temp file — the same operation the app
 *  performs when it writes mixjam.json into the User Folder. */
async function isWritable(dir: FileSystemDirectoryHandle): Promise<boolean> {
  const probeName = `.mixjam-write-test-${Date.now()}`
  try {
    const probe = await dir.getFileHandle(probeName, { create: true })
    const writable = await probe.createWritable()
    await writable.close()
    await dir.removeEntry(probeName)
    return true
  } catch {
    return false
  }
}

export async function validateFolder(ref: FolderRef, role: FolderRole): Promise<FolderValidation> {
  let handle: FileSystemDirectoryHandle | null
  try {
    handle = await loadFolderHandle(ref.id)
  } catch {
    return 'invalid'
  }
  if (!handle) return 'invalid'

  const permission = await handle.queryPermission({ mode: permissionMode(role) })
  if (permission !== 'granted') {
    // Regaining access needs a user gesture (browser host); the Electron shell
    // auto-grants, so this state is browser-only in practice.
    return 'needs-permission'
  }

  if (role === 'user') return (await isWritable(handle)) ? 'ok' : 'invalid'

  // Confirm the directory still exists (a granted handle to a deleted folder
  // throws on first access).
  try {
    await handle.keys().next()
    return 'ok'
  } catch {
    return 'invalid'
  }
}

/** Re-requests permission on a stored handle. Must be called from a user
 *  gesture. Returns true when access was granted. */
export async function requestFolderAccess(ref: FolderRef, role: FolderRole): Promise<boolean> {
  const handle = await loadFolderHandle(ref.id)
  if (!handle) return false
  try {
    return (await handle.requestPermission({ mode: permissionMode(role) })) === 'granted'
  } catch {
    return false
  }
}

/** Splits a '/'-separated relpath into safe segments; null when the relpath
 *  is empty or contains traversal segments. */
function relpathSegments(relpath: string): string[] | null {
  const segments = relpath.split('/').filter((s) => s.length > 0)
  if (segments.length === 0) return null
  if (segments.some((s) => s === '.' || s === '..')) return null
  return segments
}

/** Resolves a file handle by relpath under a directory handle, or null when
 *  any segment is missing. */
export async function resolveFileHandle(
  dir: FileSystemDirectoryHandle,
  relpath: string
): Promise<FileSystemFileHandle | null> {
  const segments = relpathSegments(relpath)
  if (!segments) return null
  try {
    let current = dir
    for (const segment of segments.slice(0, -1)) {
      current = await current.getDirectoryHandle(segment)
    }
    return await current.getFileHandle(segments[segments.length - 1])
  } catch {
    return null
  }
}

/** Reads the raw bytes of a file inside a stored folder. Returns null if the
 *  ref, path, or permission is invalid — never throws. */
export async function readSampleBytes(
  rootId: string,
  relpath: string
): Promise<ArrayBuffer | null> {
  try {
    const dir = await loadFolderHandle(rootId)
    if (!dir) return null
    const fileHandle = await resolveFileHandle(dir, relpath)
    if (!fileHandle) return null
    const file = await fileHandle.getFile()
    return await file.arrayBuffer()
  } catch {
    return null
  }
}
