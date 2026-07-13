import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { resolve } from 'node:path'
import { existsSync, readdirSync } from 'node:fs'

const MAIN_ENTRY = resolve(__dirname, '..', '..', 'out', 'main', 'index.js')

test.describe('Electron smoke', () => {
  test('app launches and renders the home screen', async () => {
    if (!existsSync(MAIN_ENTRY)) {
      test.skip(true, `Production build not found at ${MAIN_ENTRY}. Run "npm run build" first.`)
      return
    }

    const env = { ...process.env } as Record<string, string>
    delete env.ELECTRON_RUN_AS_NODE

    const electronApp = await electron.launch({
      args: process.env['CI'] ? [MAIN_ENTRY, '--no-sandbox'] : [MAIN_ENTRY],
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

      const footerText = await footer.textContent()
      expect(footerText).toBeTruthy()

      await expect(window.locator('.folder-card').first()).toBeVisible({ timeout: 5_000 })

      const startBtn = window.getByRole('button', { name: 'Start New MixJam' })
      await expect(startBtn).toBeVisible()

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
    }
  })
})
