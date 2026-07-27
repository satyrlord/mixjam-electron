import { useEffect, useState } from 'react'
import { clamp } from '../lib/sample-utils'

interface ReturnEffectEditorSessionOptions<M, P extends string> {
  value: M
  powered: boolean
  mix: number
  detectPreset: (value: M, mix: number) => P | 'Custom'
  applyPreset: (value: M, preset: P) => M
  presetMix: Readonly<Record<P, number>>
  onPreview?: (value: M, powered: boolean, mix: number) => void
}

/**
 * Owns the draft/preview/commit state shared by every Return effect editor.
 * Effect modules retain their distinct controls and visualizers; this hook
 * keeps the live-preview and preset-session rules identical.
 */
export function useReturnEffectEditorSession<M extends object, P extends string>({
  value,
  powered,
  mix,
  detectPreset,
  applyPreset: applyEffectPreset,
  presetMix,
  onPreview
}: ReturnEffectEditorSessionOptions<M, P>) {
  const [draft, setDraft] = useState(value)
  const [powerOn, setPowerOn] = useState(powered)
  const [mixPercent, setMixPercentState] = useState(Math.round(clamp(mix, 0, 1) * 100))
  const [preset, setPreset] = useState<P | 'Custom'>(() => detectPreset(value, mix))

  useEffect(() => {
    onPreview?.(draft, powerOn, mixPercent / 100)
  }, [draft, mixPercent, onPreview, powerOn])

  const setField = <K extends keyof M>(key: K, next: M[K]) => {
    setDraft((current) => ({ ...current, [key]: next }))
    setPreset('Custom')
  }

  const setMixPercent = (next: number) => {
    setMixPercentState(Math.round(clamp(next, 0, 100)))
    setPreset('Custom')
  }

  const applyPreset = (name: P) => {
    setDraft((current) => applyEffectPreset(current, name))
    setMixPercentState(presetMix[name])
    setPowerOn(true)
    setPreset(name)
  }

  return {
    draft,
    powerOn,
    mixPercent,
    preset,
    setField,
    setMixPercent,
    setPowerOn,
    applyPreset
  }
}
