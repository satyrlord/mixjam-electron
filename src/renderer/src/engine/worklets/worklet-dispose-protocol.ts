// The retirement contract every MixJam AudioWorkletNode obeys, shared by the
// host adapters and the worklet shells.
//
// Disconnecting an AudioWorkletNode does NOT stop it. A node whose `process()`
// returns `true` stays "actively processing": Chromium keeps it in the render
// graph, calls `process()` every quantum for the rest of the session, and never
// collects it. Every host that replaces a node — Return-module rebuilds on
// project load, MasterMeter.reset() on seek, master-bus teardown — must tell the
// outgoing processor to retire, and the processor answers by returning `false`.
//
// Host and worklet are separate bundles, so the message shape lives here, in a
// module with no imports, rather than on either side.

/** Post to a worklet node's port to end its active processing. */
export const WORKLET_DISPOSE = { type: 'dispose' } as const

export function isWorkletDisposeMessage(message: unknown): boolean {
  return typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === WORKLET_DISPOSE.type
}
