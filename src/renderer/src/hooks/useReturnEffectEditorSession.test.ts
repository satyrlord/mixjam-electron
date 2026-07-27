import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useReturnEffectEditorSession } from './useReturnEffectEditorSession'

interface Draft {
  amount: number
  bypass: boolean
}

const PRESET_MIX = { Default: 80, Wide: 95 } as const

function detectPreset(value: Draft, mix: number): keyof typeof PRESET_MIX | 'Custom' {
  if (value.amount === 1 && mix === 0.8) return 'Default'
  if (value.amount === 2 && mix === 0.95) return 'Wide'
  return 'Custom'
}

function applyPreset(value: Draft, preset: keyof typeof PRESET_MIX): Draft {
  return { ...value, amount: preset === 'Default' ? 1 : 2, bypass: false }
}

describe('useReturnEffectEditorSession', () => {
  it('publishes live edits and marks a detected preset Custom', () => {
    const onPreview = vi.fn()
    const { result } = renderHook(() => useReturnEffectEditorSession({
      value: { amount: 1, bypass: false },
      powered: true,
      mix: 0.8,
      detectPreset,
      applyPreset,
      presetMix: PRESET_MIX,
      onPreview
    }))

    expect(result.current.preset).toBe('Default')
    act(() => result.current.setField('amount', 1.5))
    expect(result.current.preset).toBe('Custom')
    expect(onPreview).toHaveBeenLastCalledWith(
      { amount: 1.5, bypass: false }, true, 0.8
    )

    act(() => result.current.setMixPercent(63.6))
    expect(result.current.mixPercent).toBe(64)
    expect(onPreview).toHaveBeenLastCalledWith(
      { amount: 1.5, bypass: false }, true, 0.64
    )
  })

  it('applies module, Mix, power, and preset selection atomically', () => {
    const { result } = renderHook(() => useReturnEffectEditorSession({
      value: { amount: 1.5, bypass: true },
      powered: false,
      mix: 0.5,
      detectPreset,
      applyPreset,
      presetMix: PRESET_MIX
    }))

    act(() => result.current.applyPreset('Wide'))

    expect(result.current.draft).toEqual({ amount: 2, bypass: false })
    expect(result.current.mixPercent).toBe(95)
    expect(result.current.powerOn).toBe(true)
    expect(result.current.preset).toBe('Wide')
  })
})
