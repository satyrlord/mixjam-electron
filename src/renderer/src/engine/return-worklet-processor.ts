import type { ReturnModule, ReturnModuleProcessor } from './return-effects'

/**
 * Shared host-side plumbing for every worklet-backed Return effect.
 *
 * This is contract code, not DSP: the AudioWorklet registration bookkeeping,
 * node creation, the identity fallback for contexts without worklet support,
 * and the connect/dispose lifecycle are identical across every effect. Each
 * effect supplies only what is genuinely its own — the processor name and
 * worklet URL, the `toState` projection of its module, and any extra momentary
 * commands (for example the reverb's Clear Tail). See spec-010 "Module
 * Registration Contract".
 */

/** Node constructor, injectable so tests can drive the real node path. */
export type WorkletFactory = (
  context: BaseAudioContext,
  name: string,
  options: AudioWorkletNodeOptions
) => AudioWorkletNode

function defaultCreateNode(
  context: BaseAudioContext,
  name: string,
  options: AudioWorkletNodeOptions
): AudioWorkletNode {
  return new AudioWorkletNode(context, name, options)
}

function disconnect(node: AudioNode): void {
  try { node.disconnect() } catch { /* already disconnected */ }
}

// Registration is per (context, processor name). Keyed by name so two effects
// sharing a context register independently and each resolves once.
const readyContexts = new WeakMap<BaseAudioContext, Set<string>>()
const registrations = new WeakMap<BaseAudioContext, Map<string, Promise<boolean>>>()

function isReady(context: BaseAudioContext, name: string): boolean {
  return readyContexts.get(context)?.has(name) ?? false
}

/**
 * Register a Return effect's AudioWorklet module before a populated snapshot is
 * materialized. Resolves `false` where worklets are unavailable (unsupported
 * test contexts), so the caller applies the identity fallback. Idempotent per
 * (context, name): repeat calls return the in-flight or settled registration.
 */
export function prepareReturnWorklet(
  context: BaseAudioContext,
  name: string,
  url: string
): Promise<boolean> {
  if (isReady(context, name)) return Promise.resolve(true)
  const perContext = registrations.get(context) ?? new Map<string, Promise<boolean>>()
  registrations.set(context, perContext)
  const existing = perContext.get(name)
  if (existing) return existing
  const worklet = (context as AudioContext).audioWorklet
  if (!worklet?.addModule) return Promise.resolve(false)
  const registration = worklet.addModule(url)
    .then(() => {
      const ready = readyContexts.get(context) ?? new Set<string>()
      ready.add(name)
      readyContexts.set(context, ready)
      return true
    })
    .catch(() => false)
  perContext.set(name, registration)
  return registration
}

export interface ReturnWorkletProcessorConfig<M extends ReturnModule> {
  /** Registered AudioWorkletProcessor name (matches the worklet's registration). */
  readonly name: string
  /** `?worker&url` import for this effect's worklet module. */
  readonly url: string
  /** Serialized module type this processor accepts on update. */
  readonly type: M['type']
  /** Project the host module record to the worklet's transferable state. */
  readonly toState: (module: M) => unknown
  /**
   * Whether the effect reads project tempo. When true, `bpm` is threaded into
   * the initial `processorOptions` and every `state` message; when false (the
   * default) tempo is omitted so a tempo-agnostic effect never sees it.
   */
  readonly tempoAware?: boolean
  /**
   * Extra momentary commands exposed on the processor beyond update/dispose
   * (for example `{ clearTail: (port) => port.postMessage({ type: 'clear-tail' }) }`).
   */
  readonly commands?: Record<string, (port: MessagePort) => void>
}

/**
 * Build the black-box `ReturnModuleProcessor` for a worklet-backed effect.
 * `bpm` is passed to every effect uniformly; effects that ignore tempo simply
 * do not read it. When the context has no registered worklet (or node creation
 * throws), returns a zero-latency identity processor so the graph still runs.
 */
export function createReturnWorkletProcessor<M extends ReturnModule>(
  context: BaseAudioContext,
  module: M,
  bpm: number,
  config: ReturnWorkletProcessorConfig<M>,
  createNode: WorkletFactory = defaultCreateNode
): ReturnModuleProcessor {
  const input = context.createGain()
  const output = context.createGain()

  const identityFallback = (): ReturnModuleProcessor => {
    input.connect(output)
    return {
      input,
      output,
      update(): void {},
      dispose(): void { disconnect(input); disconnect(output) }
    }
  }

  if (!isReady(context, config.name)) return identityFallback()

  const tempoAware = config.tempoAware ?? false
  const processorOptions = tempoAware
    ? { state: config.toState(module), bpm }
    : { state: config.toState(module) }

  let node: AudioWorkletNode
  try {
    node = createNode(context, config.name, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions
    })
  } catch {
    return identityFallback()
  }

  input.connect(node)
  node.connect(output)

  const commands: Record<string, () => void> = {}
  for (const [key, send] of Object.entries(config.commands ?? {})) {
    commands[key] = () => send(node.port)
  }

  return {
    input,
    output,
    ...commands,
    update(next, nextBpm): void {
      if (next.type !== config.type) return
      const message = tempoAware
        ? { type: 'state', state: config.toState(next as M), bpm: nextBpm }
        : { type: 'state', state: config.toState(next as M) }
      node.port.postMessage(message)
    },
    dispose(): void {
      disconnect(input)
      disconnect(node)
      disconnect(output)
      node.port.close()
    }
  }
}
