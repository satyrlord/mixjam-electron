import type { ReturnModule, ReturnModuleProcessor } from './return-effects'

/**
 * The single place that enumerates concrete Return effect types. The engine,
 * the project loader, and the Mixer effect picker all read this registry; none
 * of them names an individual effect. Adding an effect (compression,
 * saturation, granular, ...) means adding its descriptor here and nothing in
 * the host. See spec-010 "Module Registration Contract".
 *
 * `empty` is intentionally NOT a descriptor: it is the built-in silent identity
 * module owned by the host, not a pluggable effect.
 */
export interface ReturnEffectDescriptor<M extends ReturnModule = ReturnModule> {
  /** Serialized module-type string (for example `echoform-delay`). */
  readonly type: M['type']
  /** Human name shown in the container menu and the closed slot. */
  readonly label: string
  /**
   * True when the effect reads project tempo, so the editor shows tempo /
   * Tap-Tempo controls (the delay). The host wires tempo from the registry, not
   * from whether an `onSetBpm` prop happens to be present.
   */
  readonly tempoAware: boolean
  /**
   * True when the effect exposes a Clear Tail momentary command, so the editor
   * shows the Clear Tail control (the reverb). Driven from the registry, not
   * from prop presence.
   */
  readonly supportsClearTail: boolean
  /** Build the black-box processor for the live graph. */
  readonly createProcessor: (context: BaseAudioContext, module: M, bpm: number) => ReturnModuleProcessor
  /**
   * Register this effect's AudioWorklet before a populated snapshot is
   * materialized. Resolves `false` where worklets are unavailable so the
   * identity fallback applies.
   */
  readonly prepareWorklet: (context: BaseAudioContext) => Promise<boolean>
  /** Default module record (its default preset), with the given slot id. */
  readonly createDefault: (id: string) => M
  /**
   * Load-time guard: true only when `module` is a complete, correctly typed,
   * in-range record for this effect. `module.type` is already known to equal
   * `type` when the host calls this.
   */
  readonly validate: (module: Record<string, unknown>) => boolean
  /** Exact serialized field allow-list (excluding the optional `id`). */
  readonly moduleKeys: readonly string[]
}

const descriptors = new Map<string, ReturnEffectDescriptor>()
const order: ReturnEffectDescriptor[] = []

/**
 * Register an effect descriptor. Effects self-register at module load; the
 * host imports `./return-effects` (which imports every effect module) so the
 * registry is fully populated before any lookup. Re-registering a type
 * replaces it, keeping the original menu position.
 */
export function registerReturnEffect(descriptor: ReturnEffectDescriptor): void {
  // `descriptors` and `order` are kept in sync, so a known type is always
  // present in `order`; re-registration replaces it in place (keeping its menu
  // position) rather than appending a duplicate.
  if (descriptors.has(descriptor.type)) {
    order[order.findIndex((d) => d.type === descriptor.type)] = descriptor
  } else {
    order.push(descriptor)
  }
  descriptors.set(descriptor.type, descriptor)
}

/** Descriptor for a module type, or undefined for `empty`/unknown types. */
export function getReturnEffect(type: string): ReturnEffectDescriptor | undefined {
  return descriptors.get(type)
}

/** Every registered descriptor in registration order (menu order). */
export function returnEffectDescriptors(): readonly ReturnEffectDescriptor[] {
  return order
}
