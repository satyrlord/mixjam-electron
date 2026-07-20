import { _electron as electron, type ElectronApplication, type Page } from 'playwright'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const REPOSITORY_ROOT = resolve(__dirname, '..', '..')
const MAIN_ENTRY = resolve(REPOSITORY_ROOT, 'out', 'main', 'index.js')
const MOCK_BACKEND_PATH = resolve(REPOSITORY_ROOT, 'tests', 'e2e', 'mock-backend.js')

export const PACKAGED_EXECUTABLE_ENV = 'MIXJAM_PACKAGED_EXECUTABLE'
const NO_SANDBOX_ENV = 'MIXJAM_ELECTRON_NO_SANDBOX'

export interface ElectronLaunch {
  app: ElectronApplication
  page: Page
  close: () => Promise<void>
}

function packagedExecutablePath(): string | undefined {
  if (!(PACKAGED_EXECUTABLE_ENV in process.env)) return undefined

  const executablePath = process.env[PACKAGED_EXECUTABLE_ENV]?.trim()
  if (!executablePath) {
    throw new Error(
      `${PACKAGED_EXECUTABLE_ENV} was set but did not name a packaged application executable.`
    )
  }
  return resolve(executablePath)
}

function launchArguments(executablePath: string | undefined, userDataDir: string): string[] {
  return executablePath
    ? [`--user-data-dir=${userDataDir}`]
    : [MAIN_ENTRY, `--user-data-dir=${userDataDir}`]
}

/**
 * Launch either the built development entry or an explicit packaged artifact.
 * A packaged run never falls back to an inferred unpacked application path.
 */
export async function launchMixJamElectron(): Promise<ElectronLaunch> {
  const executablePath = packagedExecutablePath()
  const launchTarget = executablePath ?? MAIN_ENTRY
  if (!existsSync(launchTarget)) {
    throw new Error(`Electron launch target not found at ${launchTarget}. Build it first.`)
  }

  const env = { ...process.env } as Record<string, string>
  delete env.ELECTRON_RUN_AS_NODE
  const userDataDir = mkdtempSync(join(tmpdir(), 'mixjam-electron-'))
  let app: ElectronApplication | undefined
  try {
    app = await electron.launch({
      executablePath,
      args: launchArguments(executablePath, userDataDir),
      chromiumSandbox: process.env[NO_SANDBOX_ENV] !== 'true',
      env
    })
    const page = await app.firstWindow()
    return {
      app,
      page,
      close: async () => {
        try {
          await app?.close()
        } finally {
          rmSync(userDataDir, { recursive: true, force: true })
        }
      }
    }
  } catch (error) {
    try {
      await app?.close()
    } finally {
      rmSync(userDataDir, { recursive: true, force: true })
    }
    throw error
  }
}

/** Seed the Player with the same deterministic BackendAPI used by Electron E2E. */
export async function seedMockBackend(page: Page): Promise<void> {
  await page.addInitScript(readFileSync(MOCK_BACKEND_PATH, 'utf8'))
  await page.reload()
  await page.waitForSelector('#root > *', { timeout: 15_000 })
}
