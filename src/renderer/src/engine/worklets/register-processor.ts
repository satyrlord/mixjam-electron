// Shared guard for AudioWorkletProcessor registration.
//
// `?worker&url` is a Vite concept. Toolchains that do not understand the query
// (tsx, plain node) import worklet modules for real instead of just resolving
// their URL, and the AudioWorklet globals do not exist there. The `extends`
// clause is evaluated when the class definition runs, so each worklet defines
// its processor inside a factory that this helper only calls inside a real
// AudioWorkletGlobalScope.

export type WorkletProcessorFactory = () => new (options?: unknown) => { readonly port: MessagePort }

export function registerWorkletProcessor(name: string, factory: WorkletProcessorFactory): void {
  const g = globalThis as typeof globalThis & {
    AudioWorkletProcessor?: unknown
    registerProcessor?: (name: string, processorCtor: unknown) => void
  }
  if (typeof g.AudioWorkletProcessor === 'undefined') return
  g.registerProcessor?.(name, factory())
}
