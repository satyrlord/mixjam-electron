// DEV-ONLY audio-scheduler probe. Imported from main.tsx behind
// `import.meta.env.DEV`, so it is stripped from production builds entirely.
//
// It measures whether main-thread work (a tab switch, a knob drag) is stalling
// the Web Audio lookahead scheduler, and shows the result in a small on-screen
// panel — no DevTools needed. Install runs before the app mounts, so the hooks
// are in place before the scheduler's 25 ms interval is ever created.
//
// Read the panel like this while a song plays:
//   gap max   — longest pause between scheduler passes. Under ~75 ms is healthy.
//   gaps >100 — pauses long enough to bunch/overlap notes. Want 0.
//   gaps >200 — pauses long enough to DROP notes. Want 0.
//   late notes— notes handed to Web Audio with a start time already in the past
//               (these are what you hear as overlap). Want 0.
//   per-pass  — the scheduler's OWN work per pass. Stays tiny; if it climbs with
//               the gaps, the audio engine is the cost, not the UI.
//
// Press the Reset button (or Ctrl+Shift+0) to start a clean measurement, e.g.
// right before you cycle the bottom tabs 20 times.

const SCHEDULER_INTERVAL_MS = 25
const MAX_SAMPLES = 20000
// Mirror of SCHEDULER_LOOKAHEAD_MS in playback-engine.ts. A UI stall shorter
// than this is absorbed (notes were already queued), so the audible-glitch test
// is NOT "was the main thread stalled" but "were notes past-dated (overlap) or
// was a stall longer than the whole lookahead (drops)".
const LOOKAHEAD_MS = 600

type TabName = 'master' | 'mixer' | 'samples'

interface Samples {
  gaps: number[]
  passMs: number[]
  margins: number[]
  longTasks: number[]
  ticks: number
  // Worst scheduler gap in the ~900 ms after switching TO each tab, and how many
  // times each tab was activated. Discriminates the switch cost: if a heavy panel
  // (Mixer) dominates it is the reveal paint; if it tracks which switches change
  // the panel height it is the resize/tracker relayout.
  switchWorst: Record<TabName, number>
  switchCount: Record<TabName, number>
}

const ATTRIBUTION_WINDOW_MS = 900

function push(list: number[], value: number): void {
  list.push(value)
  if (list.length > MAX_SAMPLES) list.shift()
}

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]!
}

export function installSchedulerProbe(): void {
  const flag = window as unknown as { __mjSchedulerProbe?: boolean }
  if (flag.__mjSchedulerProbe) return
  flag.__mjSchedulerProbe = true

  const S: Samples = {
    gaps: [], passMs: [], margins: [], longTasks: [], ticks: 0,
    switchWorst: { master: 0, mixer: 0, samples: 0 },
    switchCount: { master: 0, mixer: 0, samples: 0 }
  }
  const reset = (): void => {
    S.gaps.length = 0
    S.passMs.length = 0
    S.margins.length = 0
    S.longTasks.length = 0
    S.ticks = 0
    S.switchWorst = { master: 0, mixer: 0, samples: 0 }
    S.switchCount = { master: 0, mixer: 0, samples: 0 }
  }

  // Track the most recent bottom-tab activation so a following scheduler gap can
  // be attributed to it.
  let lastSwitch: { tab: TabName; time: number } | null = null
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null
    const tab = target?.closest('[role="tab"]')
    if (!tab || !tab.closest('.bottom-workspace-tabs')) return
    const label = (tab.textContent ?? '').toLowerCase()
    const name: TabName | null =
      label.includes('master') ? 'master' : label.includes('mixer') ? 'mixer' : label.includes('samples') ? 'samples' : null
    if (!name) return
    lastSwitch = { tab: name, time: performance.now() }
    S.switchCount[name] += 1
  }, true)

  // Wrap only the scheduler's 25 ms interval; other timers pass through.
  const nativeSetInterval = window.setInterval.bind(window)
  window.setInterval = function (
    handler: TimerHandler,
    timeout?: number,
    ...args: unknown[]
  ): number {
    if (timeout !== SCHEDULER_INTERVAL_MS || typeof handler !== 'function') {
      return nativeSetInterval(handler, timeout, ...args)
    }
    let last = performance.now()
    return nativeSetInterval(() => {
      const now = performance.now()
      const gap = now - last
      push(S.gaps, gap)
      if (lastSwitch && now - lastSwitch.time < ATTRIBUTION_WINDOW_MS) {
        const tab = lastSwitch.tab
        if (gap > S.switchWorst[tab]) S.switchWorst[tab] = gap
      }
      last = now
      const started = performance.now()
      ;(handler as () => void)()
      push(S.passMs, performance.now() - started)
      S.ticks += 1
    }, SCHEDULER_INTERVAL_MS)
  } as typeof window.setInterval

  // Note start times relative to the audio clock: negative = past-dated (clamped
  // by Web Audio to "now", heard as overlap).
  const nativeStart = AudioBufferSourceNode.prototype.start
  AudioBufferSourceNode.prototype.start = function (
    this: AudioBufferSourceNode,
    when?: number,
    ...rest: number[]
  ): void {
    if (typeof when === 'number' && this.context) {
      push(S.margins, (when - this.context.currentTime) * 1000)
    }
    return nativeStart.call(this, when as number, ...rest)
  }

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) push(S.longTasks, entry.duration)
    }).observe({ type: 'longtask', buffered: false })
  } catch {
    // longtask timing unsupported; the rest still works.
  }

  // ── On-screen panel ──────────────────────────────────────────────────────
  const panel = document.createElement('div')
  panel.setAttribute('data-mj-scheduler-probe', '')
  Object.assign(panel.style, {
    position: 'fixed',
    right: '10px',
    bottom: '10px',
    zIndex: '2147483647',
    font: '11px/1.35 ui-monospace, "JetBrains Mono", Consolas, monospace',
    color: '#e8f0ec',
    background: 'rgba(8, 12, 11, 0.92)',
    border: '1px solid #1a4d3e',
    borderRadius: '8px',
    padding: '8px 10px',
    minWidth: '190px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    pointerEvents: 'auto',
    userSelect: 'none'
  } as Partial<CSSStyleDeclaration>)

  const readout = document.createElement('div')
  const controls = document.createElement('div')
  Object.assign(controls.style, { display: 'flex', gap: '6px', marginTop: '6px' } as Partial<CSSStyleDeclaration>)

  const makeButton = (label: string, onClick: () => void): HTMLButtonElement => {
    const button = document.createElement('button')
    button.textContent = label
    Object.assign(button.style, {
      flex: '1',
      font: 'inherit',
      color: '#e8f0ec',
      background: '#0c2d32',
      border: '1px solid #2d6b5e',
      borderRadius: '5px',
      padding: '3px 6px',
      cursor: 'pointer'
    } as Partial<CSSStyleDeclaration>)
    button.addEventListener('click', onClick)
    return button
  }

  let hidden = false
  const resetButton = makeButton('Reset', reset)
  const hideButton = makeButton('Hide', () => {
    hidden = true
    readout.style.display = 'none'
    controls.style.display = 'none'
    title.textContent = '⏱ probe (hidden — Ctrl+Shift+0)'
  })
  controls.append(resetButton, hideButton)

  const title = document.createElement('div')
  title.textContent = '⏱ SCHEDULER PROBE (dev)'
  Object.assign(title.style, { fontWeight: '700', marginBottom: '6px', letterSpacing: '0.02em' } as Partial<CSSStyleDeclaration>)

  panel.append(title, readout, controls)
  document.body.append(panel)

  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.shiftKey && event.code === 'Digit0') {
      event.preventDefault()
      reset()
      if (hidden) {
        hidden = false
        readout.style.display = ''
        controls.style.display = 'flex'
        title.textContent = '⏱ SCHEDULER PROBE (dev)'
      }
    }
  })

  const color = (ok: boolean, warn: boolean): string => (ok ? '#6fd98f' : warn ? '#f4c14f' : '#ff5347')
  const row = (label: string, value: string, tint: string): string =>
    `<div style="display:flex;justify-content:space-between;gap:12px"><span style="opacity:.75">${label}</span><span style="color:${tint};font-weight:700">${value}</span></div>`
  const switchRow = (label: string, worst: number, count: number): string =>
    row(label, count === 0 ? '—' : `${worst.toFixed(0)}ms (${count})`, count === 0 || worst < LOOKAHEAD_MS ? '#b8d0c8' : '#f4c14f')

  // Refresh at 2 Hz (timeout 500 is ignored by the 25 ms filter above).
  window.setInterval(() => {
    if (hidden) return
    if (S.ticks === 0) {
      readout.innerHTML = '<div style="opacity:.7">press Play to start<br/>measuring…</div>'
      return
    }
    const passes = [...S.passMs].sort((a, b) => a - b)
    const gapMax = S.gaps.length ? Math.max(...S.gaps) : 0
    const marginMin = S.margins.length ? Math.min(...S.margins) : 0
    const lateNotes = S.margins.filter((m) => m < 0).length
    const dropRisk = S.gaps.filter((g) => g > LOOKAHEAD_MS).length
    const passP99 = percentile(passes, 0.99)
    const longMax = S.longTasks.length ? Math.max(...S.longTasks) : 0

    // The audible-glitch test: notes past-dated (overlap) or stalls longer than
    // the whole lookahead (drops). A big UI stall alone no longer glitches audio.
    const clean = lateNotes === 0 && dropRisk === 0
    const verdict = clean
      ? '<div style="color:#6fd98f;font-weight:700;margin-bottom:6px">✓ AUDIO CLEAN</div>'
      : '<div style="color:#ff5347;font-weight:700;margin-bottom:6px">✕ AUDIO GLITCHING</div>'

    readout.innerHTML = [
      verdict,
      row('late notes (overlap)', `${lateNotes}`, color(lateNotes === 0, lateNotes < 3)),
      row('drop risk (>600ms)', `${dropRisk}`, color(dropRisk === 0, false)),
      row('note margin min', `${marginMin.toFixed(0)}ms`, color(marginMin >= 0, marginMin > -10)),
      '<div style="margin-top:6px;padding-top:6px;border-top:1px solid #1a4d3e;opacity:.6">— context (not a glitch on its own) —</div>',
      row('UI stall max', `${gapMax.toFixed(0)}ms`, gapMax < LOOKAHEAD_MS ? '#b8d0c8' : '#f4c14f'),
      row('per-pass p99', `${passP99.toFixed(2)}ms`, color(passP99 < 2, passP99 < 5)),
      row('longtask max', `${longMax.toFixed(0)}ms`, '#b8d0c8'),
      row('ticks', `${S.ticks}`, '#b8d0c8'),
      '<div style="margin-top:6px;padding-top:6px;border-top:1px solid #1a4d3e;opacity:.6">worst UI stall after switch →</div>',
      switchRow('→ Master', S.switchWorst.master, S.switchCount.master),
      switchRow('→ Mixer', S.switchWorst.mixer, S.switchCount.mixer),
      switchRow('→ Samples', S.switchWorst.samples, S.switchCount.samples)
    ].join('')
  }, 500)
}
