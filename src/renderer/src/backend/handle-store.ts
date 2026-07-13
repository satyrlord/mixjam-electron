// IndexedDB store for user-granted FileSystemDirectoryHandles. A FolderRef's
// id keys a handle here; the same store is read from the main thread (picker,
// validation, sample reads) and the backend worker (indexer traversal).
import type { FolderRef } from '../../../shared/backend-api'

const DB_NAME = 'mixjam-folders'
const DB_VERSION = 1
const STORE = 'handles'

interface StoredFolder {
  id: string
  name: string
  handle: FileSystemDirectoryHandle
  addedAt: number
}

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('indexedDB open failed'))
  })
}

function requestAsPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('indexedDB request failed'))
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openStore()
  try {
    return await requestAsPromise(fn(db.transaction(STORE, mode).objectStore(STORE)))
  } finally {
    db.close()
  }
}

/**
 * Persists a granted directory handle and returns its FolderRef. Picking the
 * same directory again reuses the existing ref (isSameEntry), so a folder's
 * scan root and indexed samples survive re-picking after a restart or a
 * permission loss.
 */
export async function saveFolderHandle(handle: FileSystemDirectoryHandle): Promise<FolderRef> {
  const existing = await withStore<StoredFolder[]>('readonly', (store) => store.getAll())
  for (const stored of existing) {
    try {
      if (await handle.isSameEntry(stored.handle)) {
        // Refresh the stored handle and name: the new grant may carry fresher
        // permission state than the stale stored one.
        await withStore('readwrite', (store) =>
          store.put({ ...stored, name: handle.name, handle })
        )
        return { id: stored.id, name: handle.name }
      }
    } catch {
      // A corrupt stored entry must not block picking; fall through to insert.
    }
  }

  const record: StoredFolder = {
    id: crypto.randomUUID(),
    name: handle.name,
    handle,
    addedAt: Date.now()
  }
  await withStore('readwrite', (store) => store.put(record))
  return { id: record.id, name: record.name }
}

/** Loads a stored directory handle, or null when the ref is unknown. */
export async function loadFolderHandle(id: string): Promise<FileSystemDirectoryHandle | null> {
  const record = await withStore<StoredFolder | undefined>('readonly', (store) => store.get(id))
  return record?.handle ?? null
}
