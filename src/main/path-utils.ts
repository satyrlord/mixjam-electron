import { normalize, resolve, win32 } from 'node:path'

// The audio file extensions the library recognises. Shared by the background
// indexer (indexer.ts) and the legacy folder browser (sample-browser.ts) so the
// two scanners always agree on what counts as a sample.
export const AUDIO_EXTENSIONS = new Set(['.wav', '.mp3', '.flac', '.ogg', '.aiff'])

function isWindowsStylePath(filePath: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(filePath) || filePath.startsWith('\\\\')
}

export function canonicalizePath(filePath: string): string {
  if (isWindowsStylePath(filePath)) {
    return win32.resolve(filePath).toLowerCase()
  }

  const canonicalPath = normalize(resolve(filePath))
  return process.platform === 'win32' ? canonicalPath.toLowerCase() : canonicalPath
}
