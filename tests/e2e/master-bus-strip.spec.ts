import { expect, test } from './fixtures'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'

interface ProjectFileHarness {
  __mixjamProjectFiles: Record<string, string>
}

interface SavedMasterBus {
  order: string[]
  power: Record<string, boolean>
  params: Record<string, number>
  preset: string | null
}

async function savedMasterBus(page: import('@playwright/test').Page): Promise<SavedMasterBus> {
  await page.keyboard.press('Control+Shift+S')
  await expect(page.getByLabel('saved-project')).toBeVisible()
  return page.evaluate(() => {
    const harness = window as unknown as ProjectFileHarness
    return JSON.parse(harness.__mixjamProjectFiles['saved-project.mixjam']).masterBus
  })
}

test.describe('Master Bus Strip (spec-012)', () => {
  test('renders 13 slots with pinned meters and live ordinals on the Master tab', async ({ seededPage }) => {
    await seededPage.getByRole('button', { name: 'Start New MixJam' }).click()
    await seededPage.getByRole('tab', { name: 'Master' }).click()

    const modules = seededPage.locator('.mbs-module')
    await expect(modules).toHaveCount(13)
    await expect(modules.first()).toContainText('01')
    await expect(modules.first()).toContainText('INPUT')
    await expect(modules.last()).toContainText('13')
    await expect(modules.last()).toContainText('OUTPUT')
    // Processors occupy slots 02..12 in the default order.
    await expect(modules.nth(1)).toContainText('GAIN STAGE')
    await expect(modules.nth(11)).toContainText('LIMITER')
    // The four preset chips are present with Cheat Sheet active.
    await expect(seededPage.getByRole('button', { name: 'Cheat Sheet' })).toBeVisible()
    await expect(seededPage.getByRole('button', { name: 'Bypass All' })).toBeVisible()
  })

  test('keyboard reorder from the grip renumbers slots and persists the order', async ({ seededPage }) => {
    await seededPage.getByRole('button', { name: 'Start New MixJam' }).click()
    await seededPage.getByRole('tab', { name: 'Master' }).click()

    const gainGrip = seededPage.getByRole('button', { name: /Move GAIN STAGE/ })
    await gainGrip.focus()
    await gainGrip.press('ArrowRight')

    const modules = seededPage.locator('.mbs-module')
    await expect(modules.nth(1)).toContainText('SOFT CLIP')
    await expect(modules.nth(2)).toContainText('GAIN STAGE')

    const saved = await savedMasterBus(seededPage)
    expect(saved.order.slice(0, 2)).toEqual(['clip', 'gain'])
    expect(saved.preset).toBeNull()
  })

  test('power LED bypass persists and dims the module', async ({ seededPage }) => {
    await seededPage.getByRole('button', { name: 'Start New MixJam' }).click()
    await seededPage.getByRole('tab', { name: 'Master' }).click()

    const limiterPower = seededPage.getByRole('button', { name: 'Power: LIMITER' })
    await expect(limiterPower).toHaveAttribute('aria-pressed', 'true')
    await limiterPower.click()
    await expect(limiterPower).toHaveAttribute('aria-pressed', 'false')
    await expect(seededPage.locator('.mbs-module-off')).toHaveCount(1)

    const saved = await savedMasterBus(seededPage)
    expect(saved.power.lim).toBe(false)
    expect(saved.power.comp).toBe(true)
  })

  test('preset recall applies the documented power map and values', async ({ seededPage }) => {
    await seededPage.getByRole('button', { name: 'Start New MixJam' }).click()
    await seededPage.getByRole('tab', { name: 'Master' }).click()

    await seededPage.getByRole('button', { name: 'Gentle' }).click()
    // Gentle powers off Maximizer and Multiband Comp and lowers Soft Clip.
    await expect(seededPage.getByRole('button', { name: 'Power: MAXIMIZER' })).toHaveAttribute('aria-pressed', 'false')
    await expect(seededPage.getByRole('button', { name: 'Power: MB COMP' })).toHaveAttribute('aria-pressed', 'false')

    const saved = await savedMasterBus(seededPage)
    expect(saved.preset).toBe('Gentle')
    expect(saved.power.max).toBe(false)
    expect(saved.power.mbc).toBe(false)
    expect(saved.params['clip.amount']).toBeCloseTo(0.8)
    expect(saved.params['comp.thr']).toBe(-12)

    // Undo restores the pre-preset record as one edit.
    await seededPage.keyboard.press('Control+Z')
    await expect(seededPage.getByRole('button', { name: 'Power: MAXIMIZER' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('knob edits persist through save and reload', async ({ seededPage }) => {
    await seededPage.getByRole('button', { name: 'Start New MixJam' }).click()
    await seededPage.getByRole('tab', { name: 'Master' }).click()

    const trim = seededPage.getByRole('slider', { name: 'GAIN STAGE TRIM' })
    await trim.focus()
    for (let i = 0; i < 5; i++) await trim.press('ArrowUp')
    const value = Number(await trim.getAttribute('aria-valuenow'))
    expect(value).toBeGreaterThan(0)

    const saved = await savedMasterBus(seededPage)
    expect(saved.params['gain.trim']).toBeCloseTo(value)
    expect(saved.preset).toBeNull()

    // Reload the saved project and confirm the strip state round-trips.
    await seededPage.getByRole('button', { name: /Return to Main Menu/ }).click()
    await seededPage.getByRole('button', { name: /saved-project/ }).click()
    await seededPage.getByRole('tab', { name: 'Master' }).click()
    await expect(seededPage.getByRole('slider', { name: 'GAIN STAGE TRIM' })).toHaveAttribute('aria-valuenow', String(value))
  })

  test('loaded fixture project exposes the Cheat Sheet strip on the Master tab', async ({ seededPage }) => {
    await seededPage.getByRole('button', { name: /club-night/ }).click()
    await seededPage.getByRole('tab', { name: 'Master' }).click()
    await expect(seededPage.locator('.mbs-module')).toHaveCount(13)
    await expect(seededPage.getByRole('slider', { name: 'BUS COMP THRESH' })).toHaveAttribute('aria-valuenow', '-16')
  })

  test('shipped worklet enforces the true-peak ceiling under production CSP', async ({ seededPage }) => {
    await seededPage.getByRole('button', { name: 'Start New MixJam' }).click()
    const assetName = readdirSync(resolve(process.cwd(), 'out', 'renderer', 'assets'))
      .find((name) => /^master-bus\.worklet-.*\.js$/.test(name))
    expect(assetName).toBeTruthy()
    const processorUrl = new URL(`/assets/${assetName}`, seededPage.url()).href

    const result = await seededPage.evaluate(async (url) => {
      const sampleRate = 48000
      const seconds = 4
      const length = sampleRate * seconds
      const context = new OfflineAudioContext(2, length, sampleRate)
      await context.audioWorklet.addModule(url)

      // Hostile program: a hot inter-sample-peak tone at fs/4.
      const buffer = context.createBuffer(2, length, sampleRate)
      for (let channel = 0; channel < 2; channel++) {
        const data = buffer.getChannelData(channel)
        for (let i = 0; i < length; i++) {
          data[i] = 0.9 * Math.sin((2 * Math.PI * (sampleRate / 4) * i) / sampleRate + Math.PI / 4)
        }
      }
      const source = context.createBufferSource()
      source.buffer = buffer
      const node = new AudioWorkletNode(context, 'master-bus-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2]
      })
      let snapshots = 0
      node.port.onmessage = () => {
        snapshots++
      }
      source.connect(node).connect(context.destination)
      source.start()
      const rendered = await context.startRendering()
      // 8x windowed-sinc true-peak estimate over the rendered output.
      const data = rendered.getChannelData(0)
      let peak = 0
      const HALF = 16
      for (let i = sampleRate; i < data.length; i++) {
        const a = Math.abs(data[i])
        if (a > peak) peak = a
        for (let sub = 1; sub < 8; sub++) {
          const frac = sub / 8
          let acc = 0
          for (let k = -HALF + 1; k <= HALF; k++) {
            const idx = i + k
            if (idx < 0 || idx >= data.length) continue
            const t = frac - k
            const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t)
            const win = 0.5 * (1 + Math.cos((Math.PI * (k - frac)) / HALF))
            acc += data[idx] * sinc * win
          }
          const av = Math.abs(acc)
          if (av > peak) peak = av
        }
      }
      return { truePeakDb: 20 * Math.log10(peak), snapshots }
    }, processorUrl)

    // Default chain (Cheat Sheet, limiter ceiling -1 dBTP).
    expect(result.truePeakDb).toBeLessThanOrEqual(-0.95)
    expect(result.snapshots).toBeGreaterThan(0)
  })
})
