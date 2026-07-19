import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { arch, cpus, platform, release, tmpdir, totalmem } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'

const EVIDENCE_DIR = resolve('tmp/verify-song-progress-performance')
const MOCK_BACKEND_PATH = resolve('tests/e2e/mock-backend.js')
const MAIN_ENTRY = resolve('out/main/index.js')
const RUNS_PER_MODE = 3
const CPU_THROTTLE_MODES = [
  { name: 'native', rate: 1 },
  { name: 'cpu-4x', rate: 4 }
]

function percentile(values, fraction) {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]
}

function summarize(values) {
  return {
    count: values.length,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: values.length > 0 ? Math.max(...values) : null
  }
}

async function readTraceStream(session, stream) {
  const chunks = []
  while (true) {
    const result = await session.send('IO.read', { handle: stream })
    chunks.push(Buffer.from(result.data, result.base64Encoded ? 'base64' : 'utf8'))
    if (result.eof) break
  }
  await session.send('IO.close', { handle: stream })
  return Buffer.concat(chunks)
}

async function captureTrace(session, action) {
  await session.send('Tracing.start', {
    categories: [
      'devtools.timeline',
      'toplevel',
      'blink.user_timing',
      'disabled-by-default-devtools.timeline.frame'
    ].join(','),
    options: 'record-as-much-as-possible',
    transferMode: 'ReturnAsStream',
    streamFormat: 'json'
  })
  await action()
  const complete = new Promise((resolveComplete) => {
    session.once('Tracing.tracingComplete', resolveComplete)
  })
  await session.send('Tracing.end')
  const event = await complete
  if (!event.stream) throw new Error('Chromium trace completed without a stream')
  return readTraceStream(session, event.stream)
}

async function seedFullCapacityProject(page) {
  await page.evaluate(() => {
    const harness = globalThis
    const project = JSON.parse(harness.__mixjamProjectFiles['club-night.mixjam'])
    for (let laneIndex = 0; laneIndex < project.lanes.length; laneIndex += 1) {
      project.lanes[laneIndex].placements = Array.from({ length: 999 }, (_, bar) => ({
        id: `performance-${laneIndex}-${bar}`,
        sampleRef: 'Drums/Kicks/kick_808.wav',
        sampleName: 'kick_808.wav',
        nativeBPM: 140,
        startTick: bar * 32,
        durationTicks: 32,
        durationSeconds: 4 * 60 / 140,
        slot: laneIndex % 8
      }))
    }
    project.song.bpm = 140
    harness.__mixjamProjectFiles['club-night.mixjam'] = JSON.stringify(project)
  })
  await page.getByRole('button', { name: /club-night/ }).click()
  await page.getByText('Lane 1', { exact: true }).waitFor()
  await page.getByRole('scrollbar', { name: 'Song Progress Bar' }).waitFor()
}

async function installCanvasCounter(page) {
  await page.evaluate(() => {
    if (globalThis.__mixjamCanvasCounterInstalled) return
    globalThis.__mixjamCanvasCounterInstalled = true
    globalThis.__mixjamCanvasClearCount = 0
    const original = globalThis.CanvasRenderingContext2D.prototype.clearRect
    globalThis.CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.classList.contains('lane-sample-bubble-canvas')) {
        globalThis.__mixjamCanvasClearCount += 1
      }
      return original.apply(this, args)
    }
  })
}

async function startBrowserMetrics(page) {
  await page.evaluate(() => {
    const progress = globalThis.document.querySelector('.song-progress-bar')
    const scrollport = globalThis.document.querySelector('.tracker-lanes')
    if (!(progress instanceof globalThis.HTMLElement) || !(scrollport instanceof globalThis.HTMLElement)) {
      throw new Error('Song Progress Bar or Tracker scrollport is missing')
    }
    scrollport.scrollLeft = 0
    const metrics = {
      active: true,
      raf: [],
      pointerMoves: [],
      scrolls: [],
      longTasks: [],
      clearRectStart: globalThis.__mixjamCanvasClearCount,
      stop: null
    }
    const onPointerMove = () => metrics.pointerMoves.push(performance.now())
    const onScroll = () => metrics.scrolls.push({
      timestamp: performance.now(),
      scrollLeft: scrollport.scrollLeft
    })
    progress.addEventListener('pointermove', onPointerMove)
    scrollport.addEventListener('scroll', onScroll)
    let observer = null
    if (typeof PerformanceObserver !== 'undefined') {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) metrics.longTasks.push(entry.duration)
      })
      try {
        observer.observe({ type: 'longtask', buffered: false })
      } catch {
        observer = null
      }
    }
    const onFrame = (timestamp) => {
      if (!metrics.active) return
      metrics.raf.push(timestamp)
      globalThis.requestAnimationFrame(onFrame)
    }
    globalThis.requestAnimationFrame(onFrame)
    metrics.stop = () => {
      metrics.active = false
      progress.removeEventListener('pointermove', onPointerMove)
      scrollport.removeEventListener('scroll', onScroll)
      observer?.disconnect()
    }
    globalThis.__mixjamPerformanceMetrics = metrics
  })
}

async function dragAcrossCapacity(page) {
  const progress = page.getByRole('scrollbar', { name: 'Song Progress Bar' })
  const track = page.locator('.song-progress-track')
  const thumb = page.locator('.song-progress-thumb')
  const progressBox = await progress.boundingBox()
  const trackBox = await track.boundingBox()
  let thumbBox = await thumb.boundingBox()
  if (!progressBox || !trackBox || !thumbBox) throw new Error('Song Progress Bar geometry is unavailable')
  const hitTargets = await page.evaluate(({ thumbPoint, trackPoint }) => {
    const describe = (point) => {
      const element = globalThis.document.elementFromPoint(point.x, point.y)
      return element instanceof globalThis.Element
        ? `${element.tagName.toLowerCase()}.${element.className}`
        : 'none'
    }
    return { thumb: describe(thumbPoint), track: describe(trackPoint) }
  }, {
    thumbPoint: { x: thumbBox.x + thumbBox.width / 2, y: thumbBox.y + thumbBox.height / 2 },
    trackPoint: { x: trackBox.x + trackBox.width / 2, y: trackBox.y + trackBox.height / 2 }
  })
  if (!hitTargets.thumb.includes('song-progress') || !hitTargets.track.includes('song-progress')) {
    const layout = await page.evaluate(() => Object.fromEntries([
      ['progress', '.song-progress-bar'],
      ['trackerRegion', '.tracker-region'],
      ['trackerLanes', '.tracker-lanes'],
      ['upperGroup', '.upper-work-group'],
      ['songControls', '.song-controls-main']
    ].map(([name, selector]) => {
      const element = globalThis.document.querySelector(selector)
      const rect = element?.getBoundingClientRect()
      return [name, rect ? { top: rect.top, bottom: rect.bottom, height: rect.height } : null]
    })))
    const trackerAncestors = await page.evaluate(() => {
      const rows = []
      let element = globalThis.document.querySelector('.tracker-region')
      while (element && rows.length < 6) {
        const rect = element.getBoundingClientRect()
        const style = globalThis.getComputedStyle(element)
        rows.push({
          tag: element.tagName.toLowerCase(),
          className: element.className,
          dataPanel: element.getAttribute('data-panel'),
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height,
          cssHeight: style.height,
          display: style.display,
          overflow: style.overflow
        })
        element = element.parentElement
      }
      return rows
    })
    await page.screenshot({ path: resolve(EVIDENCE_DIR, 'occluded-progress-bar.png'), fullPage: true })
    throw new Error(`Song Progress Bar is occluded: ${JSON.stringify({ hitTargets, layout, trackerAncestors })}`)
  }

  await page.mouse.move(thumbBox.x + thumbBox.width / 2, thumbBox.y + thumbBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(trackBox.x + trackBox.width - 1, thumbBox.y + thumbBox.height / 2, { steps: 120 })
  await page.mouse.up()

  thumbBox = await thumb.boundingBox()
  if (!thumbBox) throw new Error('Song Progress Bar thumb disappeared after forward drag')
  await page.mouse.move(thumbBox.x + thumbBox.width / 2, thumbBox.y + thumbBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(trackBox.x + 1, thumbBox.y + thumbBox.height / 2, { steps: 120 })
  await page.mouse.up()

  await page.evaluate(() => new Promise((resolveFrame) => globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolveFrame))))
}

async function finishBrowserMetrics(page) {
  return page.evaluate(() => {
    const metrics = globalThis.__mixjamPerformanceMetrics
    metrics.stop()
    const scrollport = globalThis.document.querySelector('.tracker-lanes')
    if (!(scrollport instanceof globalThis.HTMLElement)) throw new Error('Tracker scrollport is missing')
    const canvases = [...globalThis.document.querySelectorAll('.lane-sample-bubble-canvas')]
    return {
      raf: metrics.raf,
      pointerMoves: metrics.pointerMoves,
      scrolls: metrics.scrolls,
      longTasks: metrics.longTasks,
      clearRectCount: globalThis.__mixjamCanvasClearCount - metrics.clearRectStart,
      scrollLeft: scrollport.scrollLeft,
      maxScroll: scrollport.scrollWidth - scrollport.clientWidth,
      scrollWidth: scrollport.scrollWidth,
      clientWidth: scrollport.clientWidth,
      devicePixelRatio: globalThis.devicePixelRatio,
      canvasCount: canvases.length,
      canvases: canvases.map((canvas) => ({
        width: canvas.width,
        height: canvas.height,
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight
      })),
      rulerCells: globalThis.document.querySelectorAll('.tracker-ruler-tick-bar').length,
      placementCount: 999 * 16
    }
  })
}

function inputToScrollLatencies(pointerMoves, scrolls) {
  const latencies = []
  let scrollIndex = 0
  for (const pointerTime of pointerMoves) {
    while (scrollIndex < scrolls.length && scrolls[scrollIndex].timestamp < pointerTime) scrollIndex += 1
    if (scrollIndex < scrolls.length) latencies.push(scrolls[scrollIndex].timestamp - pointerTime)
  }
  return latencies
}

function summarizeRun(raw, mode, run, traceBytes) {
  const frameIntervals = raw.raf.slice(1).map((timestamp, index) => timestamp - raw.raf[index])
  const latencies = inputToScrollLatencies(raw.pointerMoves, raw.scrolls)
  const maximumObservedScrollLeft = raw.scrolls.reduce(
    (maximum, sample) => Math.max(maximum, sample.scrollLeft),
    raw.scrollLeft
  )
  const maxBackingWidth = Math.max(...raw.canvases.map((canvas) => canvas.width))
  const maxAllowedBackingWidth = Math.ceil(raw.clientWidth * raw.devicePixelRatio) + 2
  const redrawLimit = (raw.raf.length + 2) * raw.canvasCount
  return {
    mode: mode.name,
    cpuThrottleRate: mode.rate,
    run,
    traceBytes,
    frameIntervalsMs: summarize(frameIntervals),
    inputToScrollMs: summarize(latencies),
    longTasksMs: summarize(raw.longTasks),
    pointerMoves: raw.pointerMoves.length,
    scrollEvents: raw.scrolls.length,
    canvasClearCount: raw.clearRectCount,
    redrawLimit,
    redrawsCoalesced: raw.clearRectCount <= redrawLimit,
    canvasCount: raw.canvasCount,
    maxBackingWidth,
    maxAllowedBackingWidth,
    backingStoresBounded: maxBackingWidth <= maxAllowedBackingWidth,
    scrollLeft: raw.scrollLeft,
    maximumObservedScrollLeft,
    maxScroll: raw.maxScroll,
    reachedCapacityEnd: Math.abs(maximumObservedScrollLeft - raw.maxScroll) <= 2,
    scrollWidth: raw.scrollWidth,
    clientWidth: raw.clientWidth,
    rulerCells: raw.rulerCells,
    placementCount: raw.placementCount,
    devicePixelRatio: raw.devicePixelRatio
  }
}

async function main() {
  await mkdir(EVIDENCE_DIR, { recursive: true })
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const userDataDir = await mkdtemp(join(tmpdir(), 'mixjam-performance-'))
  let electronApp
  try {
    electronApp = await electron.launch({
      args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
      env
    })
    const page = await electronApp.firstWindow()
    const mockBackend = await readFile(MOCK_BACKEND_PATH, 'utf8')
    await page.addInitScript(mockBackend)
    await page.reload()
    await page.waitForSelector('#root > *', { timeout: 15_000 })
    await seedFullCapacityProject(page)
    await installCanvasCounter(page)

    const session = await page.context().newCDPSession(page)
    const runs = []
    for (const mode of CPU_THROTTLE_MODES) {
      await session.send('Emulation.setCPUThrottlingRate', { rate: mode.rate })
      for (let run = 1; run <= RUNS_PER_MODE; run += 1) {
        await startBrowserMetrics(page)
        const trace = await captureTrace(session, () => dragAcrossCapacity(page))
        const raw = await finishBrowserMetrics(page)
        const tracePath = resolve(EVIDENCE_DIR, `trace-${mode.name}-${run}.json`)
        await writeFile(tracePath, trace)
        const summary = summarizeRun(raw, mode, run, trace.length)
        if (!summary.backingStoresBounded) throw new Error(`${mode.name} run ${run}: canvas backing store exceeded viewport bound`)
        if (!summary.redrawsCoalesced) throw new Error(`${mode.name} run ${run}: canvas redraws exceeded one per frame per lane`)
        if (!summary.reachedCapacityEnd) {
          throw new Error(
            `${mode.name} run ${run}: gesture reached ${summary.maximumObservedScrollLeft} of ${summary.maxScroll}; ` +
            `${summary.pointerMoves} pointer moves and ${summary.scrollEvents} scroll events were observed`
          )
        }
        if (summary.rulerCells !== 999) throw new Error(`${mode.name} run ${run}: expected 999 ruler cells`)
        runs.push(summary)
        console.log(`${mode.name} run ${run}: p95 frame ${summary.frameIntervalsMs.p95?.toFixed(2)} ms, ` +
          `p95 input-to-scroll ${summary.inputToScrollMs.p95?.toFixed(2)} ms`)
      }
    }
    await session.send('Emulation.setCPUThrottlingRate', { rate: 1 })
    await page.screenshot({ path: resolve(EVIDENCE_DIR, 'full-capacity-end.png'), fullPage: false })

    const electronVersion = await electronApp.evaluate(({ app }) => app.getVersion())
    const chromeVersion = await electronApp.evaluate(() => process.versions.chrome)
    const evidence = {
      generatedAt: new Date().toISOString(),
      status: 'characterization-only-no-approved-budget',
      environment: {
        electron: electronVersion,
        chromium: chromeVersion,
        platform: platform(),
        release: release(),
        arch: arch(),
        cpuModel: cpus()[0]?.model ?? 'unknown',
        logicalCpuCount: cpus().length,
        totalMemoryBytes: totalmem(),
        viewport: { width: 1920, height: 1080 }
      },
      gesture: 'Drag Song Progress Bar thumb start-to-end and end-to-start with 120 pointer steps each.',
      runs
    }
    await writeFile(resolve(EVIDENCE_DIR, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
    await writeFile(resolve(EVIDENCE_DIR, 'evidence.md'), `# Song Progress Bar Full-Capacity Performance Characterization

- Status: characterization only; the repository has no approved numeric frame-time budget.
- Surface: built Electron renderer, 999 bars, 16 lanes, 15,984 placements, 999 ruler cells.
- Gesture: ${evidence.gesture}
- Repetitions: three native-speed runs and three runs with 4x CPU slowdown.
- Structural result: every run reached the capacity end, kept all lane canvas backing stores viewport-bounded, and stayed within one redraw per animation frame per lane.

| Mode | Run | p95 frame ms | Max frame ms | p95 input-to-scroll ms | Long tasks | Canvas clears |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${runs.map((run) => `| ${run.mode} | ${run.run} | ${run.frameIntervalsMs.p95?.toFixed(2)} | ${run.frameIntervalsMs.max?.toFixed(2)} | ${run.inputToScrollMs.p95?.toFixed(2)} | ${run.longTasksMs.count} | ${run.canvasClearCount} |`).join('\n')}

Raw Chrome DevTools Protocol traces are stored beside this summary. These
measurements are not labeled a performance pass until the project approves a
numeric budget.
`)
  } finally {
    await electronApp?.close()
    await rm(userDataDir, { recursive: true, force: true })
  }
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
