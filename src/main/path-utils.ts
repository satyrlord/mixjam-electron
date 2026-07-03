import { normalize, resolve, win32 } from 'node:path'

// The audio file extensions the library recognises (used by the background
// indexer in indexer.ts).
export const AUDIO_EXTENSIONS = new Set(['.wav', '.mp3', '.flac', '.ogg', '.aiff'])

function isWindowsStylePath(filePath: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(filePath) || filePath.startsWith('\\\\')
}

export function canonicalizePath(filePath: string): string {
  if (isWindowsStylePath(filePath)) {
    return win32.resolve(filePath).toLowerCase()
  }

  return normalize(resolve(filePath))
}
