import { memo, useCallback, useState, type DragEvent, type ReactNode } from 'react'
import {
  MASTER_BUS_PARAMS,
  type MasterBusModuleId,
  type MasterBusParamDef,
  type MasterBusParamId,
  type ProcessorId
} from '../engine/masterbus/params'
import {
  MASTER_BUS_PRESET_NAMES,
  type MasterBusPresetName,
  type MasterBusState
} from '../engine/masterbus/presets'
import { clamp } from '../lib/sample-utils'
import { RotaryControl, RotaryDial } from './RotaryField'

export interface MasterBusUiMeters {
  /** Input VU in dBFS; needle position derives from vuDb + 18 on a -10..+4 VU scale. */
  vuDb: number
  peakL: boolean
  peakR: boolean
  compGrDb: number
  limGrDb: number
  momentaryLufs: number | null
  integratedLufs: number | null
  truePeakDbtp: number | null
  overLatched: boolean
}

export interface MasterBusStripProps {
  state: MasterBusState
  meters: MasterBusUiMeters
  onSetParam: (id: MasterBusParamId, value: number) => void
  onGestureStart: () => void
  onGestureEnd: () => void
  onTogglePower: (id: ProcessorId) => void
  onReorder: (order: ProcessorId[]) => void
  onApplyPreset: (name: MasterBusPresetName) => void
  onResetOver: () => void
}

type ModuleFamily = 'GAIN' | 'SAT' | 'EQ' | 'DYN' | 'IMG'

interface ModuleMeta {
  name: string
  family: ModuleFamily
  finish: 'cream' | 'graphite' | 'oxblood' | 'steel' | 'sand' | 'sage' | 'night'
  wide?: boolean
  /** GR LED thresholds in dB (spec-012 Metering). */
  gr?: readonly number[]
  desc: string
}

const COMP_GR_THRESHOLDS = [0.5, 1, 1.5, 2, 3, 4] as const
const LIM_GR_THRESHOLDS = [0.5, 1, 2, 3, 4.5, 6] as const

const MODULE_META: Record<MasterBusModuleId, ModuleMeta> = {
  gain: {
    name: 'GAIN STAGE',
    family: 'GAIN',
    finish: 'cream',
    desc: 'Trim the source until the input VU floats around 0 (-18 dBFS).'
  },
  clip: {
    name: 'SOFT CLIP',
    family: 'SAT',
    finish: 'graphite',
    desc: 'Gentle clipping shaves transient peaks before the dynamics section.'
  },
  tube: {
    name: 'TUBE SAT',
    family: 'SAT',
    finish: 'oxblood',
    desc: 'Even-harmonic warmth from a virtual triode stage.'
  },
  subeq: {
    name: 'TRIM EQ',
    family: 'EQ',
    finish: 'steel',
    desc: 'Trim rumble, mud, and harshness with focused cuts. High-pass at 20 Hz.'
  },
  comp: {
    name: 'BUS COMP',
    family: 'DYN',
    finish: 'cream',
    wide: true,
    gr: COMP_GR_THRESHOLDS,
    desc: 'Glue. Aim for 1-2 dB of gain reduction on loud sections.'
  },
  max: {
    name: 'MAXIMIZER',
    family: 'DYN',
    finish: 'graphite',
    desc: 'Push perceived loudness toward the streaming target.'
  },
  addeq: {
    name: 'LIFT EQ',
    family: 'EQ',
    finish: 'steel',
    desc: 'Lift weight and air with wide, musical shelves.'
  },
  tape: {
    name: 'TAPE SAT',
    family: 'SAT',
    finish: 'sand',
    desc: 'Odd harmonics and a softened top end from the virtual reel.'
  },
  width: {
    name: 'STEREO IMG',
    family: 'IMG',
    finish: 'sage',
    desc: 'Widen above the bass. Lows stay dead-center below the mono frequency.'
  },
  mbc: {
    name: 'MB COMP',
    family: 'DYN',
    finish: 'graphite',
    desc: 'Even out low, mid and high energy before the final ceiling.'
  },
  lim: {
    name: 'LIMITER',
    family: 'DYN',
    finish: 'night',
    gr: LIM_GR_THRESHOLDS,
    desc: 'The final ceiling at -1 dBTP. Catches what the soft clip let through.'
  }
}

const DRAG_MIME = 'application/mixjam-masterbus-slot'

/** The flat parameter registry grouped by owning module, built once at module
 *  scope. Filtering MASTER_BUS_PARAMS per module per render ran the predicate
 *  264 times on every meter frame, 30 times a second, for a result that never
 *  changes. */
function groupParamsByModule(): Record<MasterBusModuleId, readonly MasterBusParamDef[]> {
  const groups = {} as Record<MasterBusModuleId, MasterBusParamDef[]>
  for (const def of MASTER_BUS_PARAMS) {
    const existing = groups[def.processor]
    if (existing) existing.push(def)
    else groups[def.processor] = [def]
  }
  return groups
}

const PARAMS_BY_MODULE = groupParamsByModule()

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Formats a registry value for display and aria-valuetext, e.g. "+1.5 dB",
    "2.0:1", "100 %". Bipolar values carry an explicit + when positive. */
function formatParamValue(def: MasterBusParamDef, value: number): string {
  let s = value.toFixed(def.dp)
  if (def.min < 0 && def.max > 0 && value > 0) s = `+${s}`
  if (def.unit === ':1') return `${s}:1`
  return def.unit ? `${s} ${def.unit}` : s
}

// Memoized: every prop is a primitive or a stable callback, so a meter frame
// re-rendering the rack shell leaves all 23 knobs and their SVG dials untouched.
const ModuleKnob = memo(function ModuleKnob({
  def,
  moduleName,
  value,
  powered,
  onSetParam,
  onGestureStart,
  onGestureEnd
}: {
  def: MasterBusParamDef
  moduleName: string
  value: number
  powered: boolean
  onSetParam: (id: MasterBusParamId, value: number) => void
  onGestureStart: () => void
  onGestureEnd: () => void
}) {
  const handleChange = useCallback(
    (next: number) => onSetParam(def.id, next),
    [def.id, onSetParam]
  )
  const step = Math.pow(10, -def.dp)
  const bipolar = def.min < 0 && def.max > 0
  const span = def.max - def.min
  const controlClass = `mbs-knob-control${def.big ? ' mbs-knob-control-big' : ''}`
  const dial = (
    <RotaryDial
      className="mbs-knob-dial"
      value={span === 0 ? 0 : (value - def.min) / span}
      defaultValue={span === 0 ? 0 : (def.def - def.min) / span}
      mode={bipolar ? 'bipolar' : 'unipolar'}
    />
  )
  return (
    <div className={`mbs-knob${def.big ? ' mbs-knob-big' : ''}`}>
      {powered ? (
        <RotaryControl
          className={controlClass}
          label={`${moduleName} ${def.label}`}
          value={value}
          min={def.min}
          max={def.max}
          step={step}
          valueText={formatParamValue(def, value)}
          defaultValue={def.def}
          onGestureStart={onGestureStart}
          onGestureEnd={onGestureEnd}
          onChange={handleChange}
        >
          {dial}
        </RotaryControl>
      ) : (
        <div className={`${controlClass} mbs-knob-inert`} aria-hidden="true">
          {dial}
        </div>
      )}
      <span className="mbs-knob-label" aria-hidden="true">
        {def.label}
      </span>
      <span className="mbs-knob-value">{formatParamValue(def, value)}</span>
    </div>
  )
})

const SpeedSwitch = memo(function SpeedSwitch({
  moduleName,
  value,
  powered,
  onSetParam
}: {
  moduleName: string
  value: number
  powered: boolean
  onSetParam: (id: MasterBusParamId, value: number) => void
}) {
  const thirty = value >= 0.5
  return (
    <div className="mbs-knob mbs-switch-field">
      <button
        type="button"
        role="switch"
        className="mbs-switch"
        aria-checked={thirty}
        aria-label={`${moduleName} SPEED`}
        disabled={!powered}
        onClick={() => onSetParam('tape.ips', thirty ? 0 : 1)}
      >
        {thirty ? '30 IPS' : '15 IPS'}
      </button>
      <span className="mbs-knob-label" aria-hidden="true">
        SPEED
      </span>
    </div>
  )
})

const GrLedRow = memo(function GrLedRow({
  thresholds,
  grDb,
  powered
}: {
  thresholds: readonly number[]
  grDb: number
  powered: boolean
}) {
  return (
    <div className="mbs-gr" aria-hidden="true">
      <span className="mbs-gr-lbl">GR</span>
      {thresholds.map((t) => (
        <span key={t} className={`mbs-gr-led${powered && grDb >= t ? ' mbs-gr-led-lit' : ''}`} />
      ))}
    </div>
  )
})

/* ── Input meter (slot 01) ── */

// Marks are evenly spaced (2 VU apart) across the whole arc so the scale reads
// linearly. The sweep spans -10..+4 VU (-28..-14 dBFS): below -28 dBFS is not
// musically useful for setting input gain, so it gets no space on the dial.
const VU_MARKS: readonly (readonly [number, string])[] = [
  [-10, '10'],
  [-8, '8'],
  [-6, '6'],
  [-4, '4'],
  [-2, '2'],
  [0, '0'],
  [2, '+2'],
  [4, '+4']
]

const VU_CX = 100
const VU_CY = 118

function vuAngleRad(v: number): number {
  return ((-46 + ((v + 10) / 14) * 92) * Math.PI) / 180
}

function vuPoint(r: number, a: number): readonly [number, number] {
  return [VU_CX + r * Math.sin(a), VU_CY - r * Math.cos(a)]
}

// Memoized with no props: the arc, the eight tick marks, and their labels are
// static, so the needle can move at the meter cadence without rebuilding them.
const VuScale = memo(function VuScale() {
  const [x0, y0] = vuPoint(101, vuAngleRad(0))
  const [x3, y3] = vuPoint(101, vuAngleRad(4))
  return (
    <svg className="mbs-vu-svg" viewBox="0 0 200 132" aria-hidden="true">
      <path
        className="mbs-vu-red-arc"
        d={`M ${x0.toFixed(1)} ${y0.toFixed(1)} A 101 101 0 0 1 ${x3.toFixed(1)} ${y3.toFixed(1)}`}
      />
      {VU_MARKS.map(([v, txt]) => {
        const a = vuAngleRad(v)
        const [x1, y1] = vuPoint(84, a)
        const [x2, y2] = vuPoint(96, a)
        const [tx, ty] = vuPoint(76, a)
        const red = v >= 0 ? ' mbs-vu-red' : ''
        return (
          <g key={v}>
            <line
              className={`mbs-vu-tick${red}`}
              x1={x1.toFixed(1)}
              y1={y1.toFixed(1)}
              x2={x2.toFixed(1)}
              y2={y2.toFixed(1)}
            />
            <text className={`mbs-vu-txt${red}`} x={tx.toFixed(1)} y={(ty + 3).toFixed(1)}>
              {txt}
            </text>
          </g>
        )
      })}
    </svg>
  )
})

function InputMeterModule({ meters }: { meters: MasterBusUiMeters }) {
  const finite = Number.isFinite(meters.vuDb)
  const vuVal = clamp((finite ? meters.vuDb : -120) + 18, -10, 4)
  const needleDeg = -46 + ((vuVal + 10) / 14) * 92
  return (
    <section className="mbs-module mbs-module-meter mbs-finish-meter mbs-fam-meter" aria-label="Input meter">
      <div className="mbs-mod-top">
        <span className="mbs-ordinal" aria-hidden="true">
          02
        </span>
        <span className="mbs-fam-chip">METER</span>
      </div>
      <div className="mbs-mod-name">
        <span className="mbs-mod-title">INPUT</span>
      </div>
      <div className="mbs-mod-body">
        <div className="mbs-vu-window">
          <VuScale />
          <div
            className="mbs-needle"
            style={{ transform: `rotate(${needleDeg.toFixed(2)}deg)` }}
            aria-hidden="true"
          />
          <div className="mbs-vu-legend" aria-hidden="true">
            0 VU = -18 dBFS
          </div>
        </div>
        <div className="mbs-mtr-row">
          <span className="mbs-pk">
            L <span className={`mbs-pk-led${meters.peakL ? ' mbs-pk-led-lit' : ''}`} />
          </span>
          <output className="mbs-lcd mbs-in-db">{finite ? `${meters.vuDb.toFixed(1)} dBFS` : '--'}</output>
          <span className="mbs-pk">
            <span className={`mbs-pk-led${meters.peakR ? ' mbs-pk-led-lit' : ''}`} /> R
          </span>
        </div>
        <p className="mbs-mod-desc">Keep the needle near 0 VU and the peak LEDs dark.</p>
      </div>
    </section>
  )
}

/* ── Output meter (slot 13) ── */

/** Top offset in % for a LUFS value on the -24..-6 bar scale (top = -6). */
function lufsTopPct(v: number): number {
  return (1 - (v + 24) / 18) * 100
}

function OutputMeterModule({
  meters,
  onResetOver
}: {
  meters: MasterBusUiMeters
  onResetOver: () => void
}) {
  const m = meters.momentaryLufs
  const lufsPct = m === null ? 0 : clamp((m + 24) / 18, 0, 1) * 100
  const lufsHot = m !== null && m > -11
  const tp = meters.truePeakDbtp
  const tpPct = tp === null ? 0 : clamp((tp + 12) / 12, 0, 1) * 100
  const tpHot = tp !== null && tp > -1
  const integrated = meters.integratedLufs
  let readClass = 'mbs-lcd mbs-big-read'
  if (integrated === null) {
    readClass += ' mbs-big-read-dim'
  } else {
    const d = integrated + 14
    readClass +=
      Math.abs(d) <= 0.7
        ? ' mbs-big-read-ok'
        : d < 0
          ? ' mbs-big-read-quiet'
          : d <= 2.5
            ? ' mbs-big-read-hot'
            : ' mbs-big-read-over'
  }
  return (
    <section className="mbs-module mbs-module-meter mbs-finish-meter mbs-fam-meter" aria-label="Output meter">
      <div className="mbs-mod-top">
        <span className="mbs-ordinal" aria-hidden="true">
          13
        </span>
        <span className="mbs-fam-chip">METER</span>
      </div>
      <div className="mbs-mod-name">
        <span className="mbs-mod-title">OUTPUT</span>
      </div>
      <div className="mbs-mod-body">
        <div className="mbs-lufs-wrap" aria-hidden="true">
          <div>
            <div className="mbs-bar">
              <div
                className="mbs-t-band"
                style={{
                  top: `${lufsTopPct(-13).toFixed(1)}%`,
                  bottom: `${(100 - lufsTopPct(-15)).toFixed(1)}%`
                }}
              />
              <div
                className={`mbs-fill${lufsHot ? ' mbs-fill-hot' : ''}`}
                style={{ height: `${lufsPct.toFixed(1)}%` }}
              />
            </div>
            <div className="mbs-bar-lbl">LUFS-M</div>
          </div>
          <div className="mbs-scale">
            <span style={{ top: '0%' }}>-6</span>
            <span style={{ top: `${lufsTopPct(-10).toFixed(1)}%` }}>-10</span>
            <span className="mbs-scale-hi" style={{ top: `${lufsTopPct(-14).toFixed(1)}%` }}>
              -14
            </span>
            <span style={{ top: `${lufsTopPct(-18).toFixed(1)}%` }}>-18</span>
            <span style={{ top: '100%' }}>-24</span>
          </div>
          <div>
            <div className="mbs-bar mbs-bar-tp">
              <div className="mbs-t-line" style={{ top: `${((1 / 12) * 100).toFixed(1)}%` }} />
              <div
                className={`mbs-fill${tpHot ? ' mbs-fill-hot' : ''}`}
                style={{ height: `${tpPct.toFixed(1)}%` }}
              />
            </div>
            <div className="mbs-bar-lbl">TP</div>
          </div>
        </div>
        <output className={readClass}>
          {integrated === null ? '--' : integrated.toFixed(1)}
          <small>INTEGRATED LUFS</small>
        </output>
        <output className="mbs-lcd mbs-tp-read">{tp === null ? 'TP -- dB' : `TP ${tp.toFixed(1)} dB`}</output>
        <button
          type="button"
          className={`mbs-over-led${meters.overLatched ? ' mbs-over-led-lit' : ''}`}
          onClick={onResetOver}
        >
          TP OVER
        </button>
        <p className="mbs-mod-desc">Target -14 LUFS integrated, true peak below -1 dBTP.</p>
      </div>
    </section>
  )
}

/* ── Pinned Gain Stage (slot 01) ── */

const GainStageModule = memo(function GainStageModule({
  params,
  onSetParam,
  onGestureStart,
  onGestureEnd
}: {
  params: MasterBusState['params']
  onSetParam: (paramId: MasterBusParamId, value: number) => void
  onGestureStart: () => void
  onGestureEnd: () => void
}) {
  const meta = MODULE_META.gain
  const defs = PARAMS_BY_MODULE.gain
  return (
    <section
      className="mbs-module mbs-finish-cream mbs-fam-gain"
      aria-label={meta.name}
    >
      <div className="mbs-mod-top">
        <span className="mbs-ordinal" aria-hidden="true">01</span>
      </div>
      <div className="mbs-mod-name">
        <span className="mbs-fam-chip">{meta.family}</span>
        <span className="mbs-mod-title">{meta.name}</span>
      </div>
      <div className="mbs-mod-body">
        <div className="mbs-ctl-grid">
          {defs.map((def) => (
            <ModuleKnob
              key={def.id}
              def={def}
              moduleName={meta.name}
              value={params[def.id]}
              powered
              onSetParam={onSetParam}
              onGestureStart={onGestureStart}
              onGestureEnd={onGestureEnd}
            />
          ))}
        </div>
        <p className="mbs-mod-desc">{meta.desc}</p>
      </div>
    </section>
  )
})

/* ── Reorderable processor modules (slots 03..12) ── */

// Memoized. `grDb` is the constant 0 for every module without a GR row, and the
// rest of the props are primitives or stable callbacks, so a meter frame
// re-renders only the two modules whose gain reduction actually moved. The
// drop-target index is a prop rather than a bound closure so the drag handler
// identity stays stable across renders.
const ProcessorModule = memo(function ProcessorModule({
  id,
  index,
  ordinal,
  powered,
  params,
  grDb,
  dragging,
  onSetParam,
  onGestureStart,
  onGestureEnd,
  onTogglePower,
  onGripKeyDown,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop
}: {
  id: ProcessorId
  index: number
  ordinal: number
  powered: boolean
  params: MasterBusState['params']
  grDb: number
  dragging: boolean
  onSetParam: (paramId: MasterBusParamId, value: number) => void
  onGestureStart: () => void
  onGestureEnd: () => void
  onTogglePower: (id: ProcessorId) => void
  onGripKeyDown: (id: ProcessorId, key: string) => boolean
  onDragStart: (id: ProcessorId, event: DragEvent<HTMLElement>) => void
  onDragEnd: () => void
  onDragOver: (index: number, event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
}) {
  const meta = MODULE_META[id]
  const defs = PARAMS_BY_MODULE[id]
  const classes = [
    'mbs-module',
    `mbs-finish-${meta.finish}`,
    `mbs-fam-${meta.family.toLowerCase()}`,
    meta.wide ? 'mbs-module-wide' : '',
    powered ? '' : 'mbs-module-off',
    dragging ? 'mbs-module-dragging' : ''
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <section
      className={classes}
      aria-label={meta.name}
      onDragOver={(event) => onDragOver(index, event)}
      onDrop={onDrop}
    >
      <div className="mbs-mod-top">
        <button
          type="button"
          className="mbs-grip"
          aria-label={`Move ${meta.name}. Use left and right arrow keys.`}
          draggable
          onDragStart={(event) => onDragStart(id, event)}
          onDragEnd={onDragEnd}
          onKeyDown={(event) => {
            if (onGripKeyDown(id, event.key)) event.preventDefault()
          }}
        />
        <span className="mbs-ordinal" aria-hidden="true">
          {pad2(ordinal)}
        </span>
        <button
          type="button"
          className="mbs-power"
          aria-label={`Power: ${meta.name}`}
          aria-pressed={powered}
          onClick={() => onTogglePower(id)}
        />
      </div>
      <div className="mbs-mod-name">
        <span className="mbs-fam-chip">{meta.family}</span>
        <span className="mbs-mod-title">{meta.name}</span>
      </div>
      <div className="mbs-mod-body">
        <div className="mbs-ctl-grid">
          {defs.map((def) =>
            def.isSwitch ? (
              <SpeedSwitch
                key={def.id}
                moduleName={meta.name}
                value={params[def.id]}
                powered={powered}
                onSetParam={onSetParam}
              />
            ) : (
              <ModuleKnob
                key={def.id}
                def={def}
                moduleName={meta.name}
                value={params[def.id]}
                powered={powered}
                onSetParam={onSetParam}
                onGestureStart={onGestureStart}
                onGestureEnd={onGestureEnd}
              />
            )
          )}
        </div>
        {meta.gr && <GrLedRow thresholds={meta.gr} grDb={grDb} powered={powered} />}
        <p className="mbs-mod-desc">{meta.desc}</p>
      </div>
    </section>
  )
})

/* ── Strip ── */

export default function MasterBusStrip({
  state,
  meters,
  onSetParam,
  onGestureStart,
  onGestureEnd,
  onTogglePower,
  onReorder,
  onApplyPreset,
  onResetOver
}: MasterBusStripProps) {
  const [dragId, setDragId] = useState<ProcessorId | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  // Every handler passed down to a memoized module is stabilized, otherwise the
  // memo boundaries below never hold: a fresh closure per render fails the
  // shallow compare exactly as if nothing were memoized at all.
  const { order } = state

  /** Keyboard reorder: swap with the neighbor, clamped at the rack ends. */
  const handleGripKey = useCallback((id: ProcessorId, key: string): boolean => {
    if (key !== 'ArrowLeft' && key !== 'ArrowRight') return false
    const from = order.indexOf(id)
    const to = from + (key === 'ArrowLeft' ? -1 : 1)
    if (from < 0 || to < 0 || to >= order.length) return true
    const next = [...order]
    next[from] = next[to]
    next[to] = id
    onReorder(next)
    return true
  }, [onReorder, order])

  const handleDragStart = useCallback((id: ProcessorId, event: DragEvent<HTMLElement>) => {
    event.dataTransfer.setData(DRAG_MIME, id)
    event.dataTransfer.effectAllowed = 'move'
    setDragId(id)
  }, [])

  const clearDrag = useCallback(() => {
    setDragId(null)
    setDropIndex(null)
  }, [])

  /** Midpoint rule: hovering the left half inserts before the module. */
  const handleDragOverModule = useCallback((index: number, event: DragEvent<HTMLElement>) => {
    if (dragId === null) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const rect = event.currentTarget.getBoundingClientRect()
    const before = event.clientX < rect.left + rect.width / 2
    setDropIndex(before ? index : index + 1)
  }, [dragId])

  const handleDrop = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    if (dragId === null || dropIndex === null) {
      clearDrag()
      return
    }
    const from = order.indexOf(dragId)
    const next = order.filter((p) => p !== dragId)
    const insertAt = dropIndex > from ? dropIndex - 1 : dropIndex
    next.splice(insertAt, 0, dragId)
    clearDrag()
    if (from >= 0 && next.some((p, i) => p !== order[i])) onReorder(next)
  }, [clearDrag, dragId, dropIndex, onReorder, order])

  const slots: ReactNode[] = [
    <GainStageModule
      key="gain"
      params={state.params}
      onSetParam={onSetParam}
      onGestureStart={onGestureStart}
      onGestureEnd={onGestureEnd}
    />,
    <InputMeterModule key="meter-in" meters={meters} />
  ]
  order.forEach((id, index) => {
    if (dragId !== null && dropIndex === index) {
      slots.push(<div key={`ind-${index}`} className="mbs-drop-ind" aria-hidden="true" />)
    }
    slots.push(
      <ProcessorModule
        key={id}
        id={id}
        index={index}
        ordinal={index + 3}
        powered={state.power[id]}
        params={state.params}
        grDb={id === 'comp' ? meters.compGrDb : id === 'lim' ? meters.limGrDb : 0}
        dragging={dragId === id}
        onSetParam={onSetParam}
        onGestureStart={onGestureStart}
        onGestureEnd={onGestureEnd}
        onTogglePower={onTogglePower}
        onGripKeyDown={handleGripKey}
        onDragStart={handleDragStart}
        onDragEnd={clearDrag}
        onDragOver={handleDragOverModule}
        onDrop={handleDrop}
      />
    )
  })
  if (dragId !== null && dropIndex === order.length) {
    slots.push(<div key="ind-end" className="mbs-drop-ind" aria-hidden="true" />)
  }
  slots.push(<OutputMeterModule key="meter-out" meters={meters} onResetOver={onResetOver} />)

  return (
    <div className="mbs-strip">
      <div className="mbs-header">
        <span className="mbs-header-label" aria-hidden="true">
          CHAIN
        </span>
        <div className="mbs-presets" role="group" aria-label="Master bus presets">
          {MASTER_BUS_PRESET_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              className={`mbs-chip${state.preset === name ? ' mbs-chip-active' : ''}`}
              aria-pressed={state.preset === name}
              onClick={() => onApplyPreset(name)}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
      <div
        className="mbs-scroll"
        role="region"
        aria-label="Master bus rack"
        tabIndex={0}
        onWheel={(event) => {
          if (!event.shiftKey || event.deltaY === 0) return
          event.preventDefault()
          event.currentTarget.scrollLeft += event.deltaY
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
          event.preventDefault()
          event.currentTarget.scrollLeft += event.key === 'ArrowLeft' ? -80 : 80
        }}
      >
        <div className="mbs-rack">
          <div className="mbs-slots">{slots}</div>
        </div>
      </div>
    </div>
  )
}
