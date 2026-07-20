/**
 * Shared Opus Delay state. This file has no Web Audio imports so the same
 * contract can be used by the renderer controller, the worklet, and the
 * headless DSP tests.
 */

export const OPUS_DELAY_DIVISIONS = [
  '1/1', '1/2', '1/4', '1/4.', '1/4T',
  '1/8', '1/8.', '1/8T', '1/16', '1/16.', '1/16T'
] as const

export type OpusDelayDivision = (typeof OPUS_DELAY_DIVISIONS)[number]
export type OpusDelayMode = 'sync' | 'free'
export type OpusDelayCharacter = 'digital' | 'analog' | 'tape'

export interface OpusDelayState {
  mode: OpusDelayMode
  divisionL: OpusDelayDivision
  divisionR: OpusDelayDivision
  timeMsL: number
  timeMsR: number
  link: boolean
  feedback: number
  pingPong: boolean
  width: number
  lowCut: number
  highCut: number
  modRate: number
  modDepth: number
  character: OpusDelayCharacter
  duckAmount: number
  duckRelease: number
  mix: number
  outputDb: number
  freeze: boolean
  bypass: boolean
}
