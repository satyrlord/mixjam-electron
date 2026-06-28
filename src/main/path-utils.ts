import { normalize, resolve } from 'node:path'

export function canonicalizePath(filePath: string): string {
  const canonicalPath = normalize(resolve(filePath))
  return process.platform === 'win32' ? canonicalPath.toLowerCase() : canonicalPath
}
