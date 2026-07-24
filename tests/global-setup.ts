import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

export default function globalSetup(): void {
  rmSync(resolve(process.cwd(), 'coverage-e2e', 'raw'), {
    recursive: true,
    force: true
  })
}
