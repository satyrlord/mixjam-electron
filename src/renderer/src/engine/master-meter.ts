import type { LoudnessSnapshot } from 'loudness-worklet'
import loudnessProcessorUrl from './worklets/loudness.worklet.js?url'

export interface MasterMeterSnapshot {
  available: boolean
  rmsDbfs: number
  momentaryLufs: number | null
  shortTermLufs: number | null
  integratedLufs: number | null
  truePeakDbtp: number | null
  loudnessRangeLu: number | null
}

type WorkletNodeFactory = (
  context: BaseAudioContext,
  name: string,
  options: AudioWorkletNodeOptions
) => AudioWorkletNode

export interface MasterMeterOptions {
  processorUrl?: string
  createNode?: WorkletNodeFactory
  warn?: (message: string, cause?: unknown) => void
}

const PROCESSOR_NAME = 'loudness-processor'
const REPORT_INTERVAL_SECONDS = 0.1

export function emptyMasterMeterSnapshot(rmsDbfs = -100): MasterMeterSnapshot {
  return {
    available: false,
    rmsDbfs,
    momentaryLufs: null,
    shortTermLufs: null,
    integratedLufs: null,
    truePeakDbtp: null,
    loudnessRangeLu: null
  }
}

export function masterMeterSnapshotsEqual(
  left: MasterMeterSnapshot,
  right: MasterMeterSnapshot
): boolean {
  return left.available === right.available &&
    left.rmsDbfs === right.rmsDbfs &&
    left.momentaryLufs === right.momentaryLufs &&
    left.shortTermLufs === right.shortTermLufs &&
    left.integratedLufs === right.integratedLufs &&
    left.truePeakDbtp === right.truePeakDbtp &&
    left.loudnessRangeLu === right.loudnessRangeLu
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function normalizeLoudnessSnapshot(
  value: unknown,
  rmsDbfs = -100
): MasterMeterSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const measurements = (value as Partial<LoudnessSnapshot>).currentMeasurements
  if (!Array.isArray(measurements) || measurements.length === 0) return null
  const measurement = measurements[0]
  if (!measurement || typeof measurement !== 'object') return null

  const snapshot: MasterMeterSnapshot = {
    available: true,
    rmsDbfs,
    momentaryLufs: finite(measurement.momentaryLoudness),
    shortTermLufs: finite(measurement.shortTermLoudness),
    integratedLufs: finite(measurement.integratedLoudness),
    truePeakDbtp: finite(measurement.maximumTruePeakLevel),
    loudnessRangeLu: finite(measurement.loudnessRange)
  }

  if (
    snapshot.momentaryLufs === null &&
    snapshot.shortTermLufs === null &&
    snapshot.integratedLufs === null &&
    snapshot.truePeakDbtp === null &&
    snapshot.loudnessRangeLu === null
  ) {
    return null
  }
  return snapshot
}

function defaultCreateNode(
  context: BaseAudioContext,
  name: string,
  options: AudioWorkletNodeOptions
): AudioWorkletNode {
  return new AudioWorkletNode(context, name, options)
}

function defaultWarn(message: string, cause?: unknown): void {
  console.warn(message, cause)
}

/**
 * Owns the optional standards-based branch off the post-master-gain bus.
 * Recreating the processor is the upstream worklet's reset mechanism; the
 * release does not define a reset port message.
 */
export class MasterMeter {
  private readonly processorUrl: string
  private readonly createNode: WorkletNodeFactory
  private readonly warn: (message: string, cause?: unknown) => void
  private initialization: Promise<boolean> | null = null
  private context: AudioContext | null = null
  private source: AudioNode | null = null
  private destination: AudioNode | null = null
  private node: AudioWorkletNode | null = null
  private sink: GainNode | null = null
  private latest = emptyMasterMeterSnapshot()
  private warned = false
  private closed = false

  constructor(options: MasterMeterOptions = {}) {
    this.processorUrl = options.processorUrl ?? loudnessProcessorUrl
    this.createNode = options.createNode ?? defaultCreateNode
    this.warn = options.warn ?? defaultWarn
  }

  initialize(
    context: AudioContext,
    source: AudioNode,
    destination: AudioNode
  ): Promise<boolean> {
    this.context = context
    this.source = source
    this.destination = destination
    if (this.initialization) return this.initialization

    this.initialization = context.audioWorklet.addModule(this.processorUrl)
      .then(() => {
        if (this.closed) return false
        this.attachNode()
        return true
      })
      .catch((cause: unknown) => {
        if (!this.warned) {
          this.warned = true
          this.warn('Master loudness metering failed to load; using RMS dBFS fallback.', cause)
        }
        return false
      })
    return this.initialization
  }

  getSnapshot(rmsDbfs: number): MasterMeterSnapshot {
    return { ...this.latest, rmsDbfs }
  }

  reset(): void {
    this.latest = emptyMasterMeterSnapshot(this.latest.rmsDbfs)
    if (this.node && this.context && this.source && this.destination) {
      this.detachNode()
      this.attachNode()
    }
  }

  close(): void {
    this.closed = true
    this.detachNode()
    this.context = null
    this.source = null
    this.destination = null
  }

  private attachNode(): void {
    const { context, source, destination } = this
    if (!context || !source || !destination || this.node) return

    const node = this.createNode(context, PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: { interval: REPORT_INTERVAL_SECONDS }
    })
    const sink = context.createGain()
    sink.gain.value = 0
    node.port.onmessage = (event: MessageEvent<unknown>) => {
      const normalized = normalizeLoudnessSnapshot(event.data, this.latest.rmsDbfs)
      if (normalized) this.latest = normalized
    }
    this.node = node
    this.sink = sink
    try {
      source.connect(node)
      node.connect(sink)
      sink.connect(destination)
    } catch (cause) {
      this.detachNode()
      throw cause
    }
  }

  private detachNode(): void {
    const { source, node, sink } = this
    if (node) {
      node.port.onmessage = null
      node.port.close()
      try {
        source?.disconnect(node)
      } catch {
        // The source may already have been disconnected during graph teardown.
      }
      node.disconnect()
    }
    sink?.disconnect()
    this.node = null
    this.sink = null
  }
}
