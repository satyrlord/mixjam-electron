import { test, expect } from '@playwright/test'
import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { promisify } from 'node:util'
import { buildAppIconPath } from '../../src/shared/window-config'
import {
  NO_SANDBOX_ENV,
  PACKAGED_EXECUTABLE_ENV,
  launchMixJamElectron
} from './packaged-launch'

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

function minimumPlayerContentSize(snapshot: NativeWindowSnapshot): { width: number; height: number } {
  const frameWidth = Math.max(0, snapshot.bounds.width - snapshot.contentBounds.width)
  const frameHeight = Math.max(0, snapshot.bounds.height - snapshot.contentBounds.height)
  return {
    width: Math.max(0, Math.min(snapshot.workArea.width - frameWidth, 1920)),
    height: Math.max(0, Math.min(snapshot.workArea.height - frameHeight, 1080))
  }
}

function centered(snapshot: NativeWindowSnapshot): boolean {
  // A window larger than the work area cannot be truly centered: Chromium
  // clamps the ideal (negative-offset) origin back into the work area along
  // each overflowing axis, and the minimum-size hook keeps the size intact.
  // GitHub's 1920x1080 runners hit this on the home window — the 1080p content
  // plus native frame overflows the taskbar-reduced work area, so the OS pins
  // the window at the work-area origin. The achievable "centered" position is
  // therefore the ideal center clamped to the work-area origin per axis.
  const idealX = snapshot.workArea.x + Math.round((snapshot.workArea.width - snapshot.bounds.width) / 2)
  const idealY = snapshot.workArea.y + Math.round((snapshot.workArea.height - snapshot.bounds.height) / 2)
  const expectedX = Math.max(idealX, snapshot.workArea.x)
  const expectedY = Math.max(idealY, snapshot.workArea.y)
  return Math.abs(snapshot.bounds.x - expectedX) <= 1 && Math.abs(snapshot.bounds.y - expectedY) <= 1
}

test.describe('Electron smoke', () => {
  test('app launches and renders the home screen', async () => {
    const launched = await launchMixJamElectron()
    const { app: electronApp, page: window } = launched

    try {
      expect(window).toBeTruthy()

      await window.waitForSelector('#root > *', { timeout: 15_000 })

      const sandboxBypassed = await electronApp.evaluate(({ app }) =>
        app.commandLine.hasSwitch('no-sandbox'))
      const packagedArtifactRequested = PACKAGED_EXECUTABLE_ENV in process.env
      expect(sandboxBypassed).toBe(
        !packagedArtifactRequested &&
        (process.env[NO_SANDBOX_ENV] === 'true' || process.env['CI'] === 'true')
      )
      if (packagedArtifactRequested) expect(sandboxBypassed).toBe(false)

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
      await expect.poll(async () => {
        const [nativeState, rendererState] = await Promise.all([
          snapshot(),
          window.evaluate(() => ({ width: innerWidth, height: innerHeight }))
        ])
        // Maximize fills the native work area, but content/renderer sizes can be
        // smaller when window frame chrome consumes part of the area.
        const minimumPlayerSize = minimumPlayerContentSize(nativeState)
        return {
          resizable: nativeState.resizable,
          maximizable: nativeState.maximizable,
          maximized: nativeState.maximized,
          contentMeetsMinimum:
            nativeState.contentBounds.width >= minimumPlayerSize.width &&
            nativeState.contentBounds.height >= minimumPlayerSize.height,
          rendererMeetsMinimum:
            rendererState.width >= minimumPlayerSize.width &&
            rendererState.height >= minimumPlayerSize.height
        }
      }).toEqual({
        resizable: true,
        maximizable: true,
        maximized: true,
        contentMeetsMinimum: true,
        rendererMeetsMinimum: true
      })
      const player = await snapshot()
      // isMaximized() is the cross-platform native state. A managed X11
      // window's reported bounds can exclude theme-specific frame extents, so
      // they do not have to equal the display work area.
      const minimumPlayerSize = minimumPlayerContentSize(player)
      expect(player.contentBounds.width).toBeGreaterThanOrEqual(minimumPlayerSize.width)
      expect(player.contentBounds.height).toBeGreaterThanOrEqual(minimumPlayerSize.height)

      await window.evaluate(() => window.shellAPI.resizeToHome())
      await expect.poll(async () => snapshot()).toMatchObject({
        resizable: true,
        maximizable: true,
        maximized: false
      })
      // Poll: a Windows unmaximize can asynchronously reapply restore bounds
      // after the explicit center(), so wait for the position to settle.
      await expect.poll(async () => centered(await snapshot())).toBe(true)
      const returnedHome = await snapshot()
      expect(returnedHome.bounds.width).toBeGreaterThanOrEqual(1920)
      expect(returnedHome.bounds.height).toBeGreaterThanOrEqual(1080)
      expect(returnedHome.contentBounds).toMatchObject({ width: 1920, height: 1080 })
      await expect.poll(async () => centered(await snapshot())).toBe(true)

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
        iconProbe,
        sandboxBypassed
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
      await launched.close()
    }
  })
})
