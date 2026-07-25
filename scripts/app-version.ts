import { execFileSync } from 'node:child_process'

export function deriveAppVersion(repositoryRoot: string, fallbackVersion: string): string {
  try {
    const commitCount = execFileSync('git', ['rev-list', '--count', 'HEAD'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()

    if (!/^\d+$/.test(commitCount)) return fallbackVersion
    return `0.${commitCount}`
  } catch {
    return fallbackVersion
  }
}
