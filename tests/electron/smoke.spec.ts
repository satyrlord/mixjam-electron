import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { execFile } from 'node:child_process'
import { join, resolve } from 'node:path'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { buildAppIconPath } from '../../src/shared/window-config'

const MAIN_ENTRY = resolve(__dirname, '..', '..', 'out', 'main', 'index.js')
const PACKAGE_DIR = resolve(__dirname, '..', '..', 'dist-electron')
const PACKAGE_VERSION = (JSON.parse(
  readFileSync(resolve(__dirname, '..', '..', 'package.json'), 'utf8')
) as { version: string }).version
const APP_ICON = buildAppIconPath(resolve(__dirname, '..', '..', 'out', 'main'))
const ICON_PROBE = resolve(__dirname, '..', '..', 'scripts', 'inspect-window-icon.ps1')
const EVIDENCE_DIR = resolve(__dirname, '..', '..', 'tmp', 'verify-electron-window-state')
const execFileAsync = promisify(execFile)

interface NativeWindowSnapshot {
  windowHandle: string
  bounds: { x: number; y: number; width: number; height: number }
  contentBounds: { x: number; y: number; width: number; height: number }
  workArea: { x: number; y: number; width: number; height: number }
  resizable: boolean
  maximizable: boolean
  maximized: boolean
  iconAssetIsEmpty: boolean
}

function centered(snapshot: NativeWindowSnapshot): boolean {
  const expectedX = snapshot.workArea.x + Math.round((snapshot.workArea.width - snapshot.bounds.width) / 2)
  const expectedY = snapshot.workArea.y + Math.round((snapshot.workArea.height - snapshot.bounds.height) / 2)
  return Math.abs(snapshot.bounds.x - expectedX) <= 1 && Math.abs(snapshot.bounds.y - expectedY) <= 1
}

function packagedExecutable(): string {
  if (process.platform === 'win32') {
    return resolve(PACKAGE_DIR, 'win-unpacked', 'MixJam Electron.exe')
  }
  if (process.platform === 'linux') {
    return resolve(PACKAGE_DIR, 'linux-unpacked', 'mixjam-electron')
  }

  const macOutput = readdirSync(PACKAGE_DIR).find((name) => name === 'mac' || name.startsWith('mac-'))
  return resolve(PACKAGE_DIR, macOutput ?? 'mac', 'MixJam Electron.app', 'Contents', 'MacOS', 'MixJam Electron')
}

test.describe('Electron smoke', () => {
  test('app launches and renders the home screen', async () => {
    const usePackagedApp = process.env['MIXJAM_SMOKE_PACKAGED'] === 'true'
    const executablePath = usePackagedApp ? packagedExecutable() : undefined
    const launchTarget = executablePath ?? MAIN_ENTRY
    if (!existsSync(launchTarget)) {
      test.skip(true, `Electron launch target not found at ${launchTarget}. Build it first.`)
      return
    }

    const env = { ...process.env } as Record<string, string>
    delete env.ELECTRON_RUN_AS_NODE
    const userDataDir = mkdtempSync(join(tmpdir(), 'mixjam-smoke-'))
    const args = executablePath
      ? [`--user-data-dir=${userDataDir}`]
      : [MAIN_ENTRY, `--user-data-dir=${userDataDir}`]
    if (process.env['CI']) args.push('--no-sandbox')

    const electronApp = await electron.launch({
      executablePath,
      args,
      env
    })

    try {
      const window = await electronApp.firstWindow()
      expect(window).toBeTruthy()

      await window.waitForSelector('#root > *', { timeout: 15_000 })

      await expect(window.locator('header')).toBeVisible({ timeout: 5_000 })
      await expect(window.locator('.home-wordmark')).toBeVisible()
      await expect(window.locator('.home-wordmark')).toHaveText('MixJam')

      const footer = window.locator('footer')
      await expect(footer).toBeVisible({ timeout: 5_000 })
      await expect(footer.getByRole('button', { name: PACKAGE_VERSION })).toBeVisible()

      const footerText = await footer.textContent()
      expect(footerText).toBeTruthy()

      await expect(window.locator('.folder-card').first()).toBeVisible({ timeout: 5_000 })

      const startBtn = window.getByRole('button', { name: 'Start New MixJam' })
      await expect(startBtn).toBeVisible()

      const snapshot = async (): Promise<NativeWindowSnapshot> => electronApp.evaluate(
        ({ BrowserWindow, nativeImage, screen }, iconPath) => {
          const nativeWindow = BrowserWindow.getAllWindows()[0]
          if (!nativeWindow) throw new Error('The main BrowserWindow is missing')
          const bounds = nativeWindow.getBounds()
          const contentBounds = nativeWindow.getContentBounds()
          const handle = nativeWindow.getNativeWindowHandle()
          // This must be inlined because evaluate() runs in Electron's main
          // process. The native handle may contain fewer than eight bytes, so
          // read only the available little-endian bytes.
          function parseNativeWindowHandle(h: Buffer): string {
            let value = 0n
            const byteLength = Math.min(h.length, 8)
            for (let index = byteLength - 1; index >= 0; index -= 1) {
              value = (value << 8n) | BigInt(h[index] ?? 0)
            }
            return value.toString()
          }
          return {
            windowHandle: parseNativeWindowHandle(handle),
            bounds,
            contentBounds,
            workArea: screen.getDisplayMatching(bounds).workArea,
            resizable: nativeWindow.isResizable(),
            maximizable: nativeWindow.isMaximizable(),
            maximized: nativeWindow.isMaximized(),
            iconAssetIsEmpty: nativeImage.createFromPath(iconPath).isEmpty()
          }
        },
        APP_ICON
      )

      const home = await snapshot()
      expect(home.bounds.width).toBeGreaterThanOrEqual(1920)
      expect(home.bounds.height).toBeGreaterThanOrEqual(1080)
      expect(home.contentBounds).toMatchObject({ width: 1920, height: 1080 })
      expect(await window.evaluate(() => ({ width: innerWidth, height: innerHeight })))
        .toEqual({ width: 1920, height: 1080 })
      expect(home.resizable).toBe(true)
      expect(home.maximizable).toBe(true)
      expect(home.maximized).toBe(false)
      expect(home.iconAssetIsEmpty).toBe(false)

      await window.evaluate(() => window.shellAPI.resizeToPlayer())
      await expect.poll(async () => snapshot()).toMatchObject({
        resizable: true,
        maximizable: true,
        maximized: true
      })
      const player = await snapshot()
      expect(player.bounds.width).toBeGreaterThanOrEqual(player.workArea.width)
      expect(player.bounds.height).toBeGreaterThanOrEqual(player.workArea.height)
      expect(player.contentBounds.width).toBeGreaterThanOrEqual(1920)
      expect(player.contentBounds.height).toBeGreaterThanOrEqual(1080)

      await window.evaluate(() => window.shellAPI.resizeToHome())
      await expect.poll(async () => snapshot()).toMatchObject({
        resizable: true,
        maximizable: true,
        maximized: false
      })
      const returnedHome = await snapshot()
      expect(returnedHome.bounds.width).toBeGreaterThanOrEqual(1920)
      expect(returnedHome.bounds.height).toBeGreaterThanOrEqual(1080)
      expect(returnedHome.contentBounds).toMatchObject({ width: 1920, height: 1080 })
      expect(centered(returnedHome)).toBe(true)

      let iconProbe: Record<string, unknown> | null = null
      if (process.platform === 'win32') {
        mkdirSync(EVIDENCE_DIR, { recursive: true })
        const expectedIconPng = await electronApp.evaluate(({ nativeImage }, iconPath) =>
          nativeImage.createFromPath(iconPath).resize({ width: 32, height: 32 }).toPNG().toString('base64'),
        APP_ICON)
        const expectedIconPngPath = resolve(EVIDENCE_DIR, 'expected-window-icon.png')
        writeFileSync(expectedIconPngPath, Buffer.from(expectedIconPng, 'base64'))
        const { stdout } = await execFileAsync('powershell', [
          '-NoProfile',
          '-ExecutionPolicy', 'Bypass',
          '-File', ICON_PROBE,
          '-NativeWindowHandle', returnedHome.windowHandle,
          '-ExpectedImagePath', expectedIconPngPath,
          '-OutputDirectory', EVIDENCE_DIR
        ])
        iconProbe = JSON.parse(stdout.trim()) as Record<string, unknown>
        expect(iconProbe['bestMeanAbsoluteChannelDifference']).toBeLessThan(20)
        expect(iconProbe['bestForegroundIntersectionOverUnion']).toBeGreaterThan(0.6)
      }

      mkdirSync(EVIDENCE_DIR, { recursive: true })
      writeFileSync(resolve(EVIDENCE_DIR, 'evidence.json'), `${JSON.stringify({
        home,
        player,
        returnedHome,
        iconProbe
      }, null, 2)}\n`)
      await window.screenshot({ path: resolve(EVIDENCE_DIR, 'home-window.png') })

      const shellCapabilities = await window.evaluate(() => Object.keys(window.shellAPI).sort())
      expect(shellCapabilities).toEqual([
        'getVersion',
        'openExternal',
        'resizeToHome',
        'resizeToPlayer'
      ])

      const assetName = readdirSync(resolve(__dirname, '..', '..', 'out', 'renderer', 'assets'))
        .find((name) => /^loudness\.worklet-.*\.js$/.test(name))
      expect(assetName).toBeTruthy()
      const workletResult = await window.evaluate(async (name) => {
        if (!name) throw new Error('Loudness worklet asset is missing')
        const context = new AudioContext({ sampleRate: 48000 })
        try {
          const url = new URL(`assets/${name}`, window.location.href).href
          await context.audioWorklet.addModule(url)
          const node = new AudioWorkletNode(context, 'loudness-processor', {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [2],
            processorOptions: { interval: 0.1 }
          })
          const oscillator = context.createOscillator()
          const sink = context.createGain()
          sink.gain.value = 0
          oscillator.connect(node).connect(sink).connect(context.destination)
          const snapshot = new Promise<boolean>((resolveSnapshot, reject) => {
            const timer = window.setTimeout(() => reject(new Error('No worklet snapshot received')), 2000)
            node.port.onmessage = () => {
              window.clearTimeout(timer)
              resolveSnapshot(true)
            }
          })
          await context.resume()
          oscillator.start()
          const received = await snapshot
          oscillator.stop()
          node.port.close()
          return { received, origin: window.location.origin }
        } finally {
          await context.close()
        }
      }, assetName)
      expect(workletResult).toEqual({ received: true, origin: 'app://bundle' })
    } finally {
      await electronApp.close()
      rmSync(userDataDir, { recursive: true, force: true })
    }
  })
})
