import { normalize, resolve } from 'node:path'

// The audio file extensions the library recognises. Shared by the background
// indexer (indexer.ts) and the legacy folder browser (sample-browser.ts) so the
// two scanners always agree on what counts as a sample.
export const AUDIO_EXTENSIONS = new Set(['.wav', '.mp3', '.flac', '.ogg', '.aiff'])

export function canonicalizePath(filePath: string): string {
  const canonicalPath = normalize(resolve(filePath))
  return process.platform === 'win32' ? canonicalPath.toLowerCase() : canonicalPath
}
