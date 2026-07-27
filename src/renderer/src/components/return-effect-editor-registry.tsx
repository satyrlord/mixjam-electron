import type { ReactNode } from 'react'
import type { PlaybackReturnSnapshot } from '../engine/playback-engine'
import type {
  AetherformReverbModule,
  EchoformDelayModule,
  ReturnModule
} from '../engine/return-effects'
import AetherformReverbModal from './AetherformReverbModal'
import EchoformDelayModal from './EchoformDelayModal'

export interface ReturnEffectEditingState {
  module: Exclude<ReturnModule, { type: 'empty' }>
  powered: boolean
}

interface EditorRenderProps {
  editing: ReturnEffectEditingState
  bus: PlaybackReturnSnapshot
  bpm: number
  onSetBpm?: (bpm: number) => void
  onCancel: () => void
  onSave: (module: ReturnModule, powered: boolean, mix: number) => void
  onPreview: (module: ReturnModule, powered: boolean, mix: number) => void
  onClearTail?: () => void
  onRestoreFocus: () => void
}

interface ReturnEffectEditorAdapter {
  summary: (module: ReturnModule, mix: number) => string
  render: (props: EditorRenderProps) => ReactNode
}

const EDITORS: Partial<Record<ReturnModule['type'], ReturnEffectEditorAdapter>> = {
  'echoform-delay': {
    summary: (module, mix) => {
      const delay = module as EchoformDelayModule
      return `${delay.mode === 'sync' ? delay.divisionL : `${Math.round(delay.timeMsL)} ms`} · Feedback ${Math.round(delay.feedback)}% · ${delay.character} · Mix ${Math.round(mix * 100)}%`
    },
    render: ({ editing, bus, bpm, onSetBpm, onCancel, onSave, onPreview, onRestoreFocus }) => (
      <EchoformDelayModal
        value={editing.module as EchoformDelayModule}
        powered={editing.powered}
        mix={bus.returnLevel}
        bpm={bpm}
        onSetBpm={onSetBpm}
        slot={bus.index + 1}
        onCancel={onCancel}
        onSave={onSave}
        onRestoreFocus={onRestoreFocus}
        onPreview={onPreview}
      />
    )
  },
  'aetherform-reverb': {
    summary: (module, mix) => {
      const reverb = module as AetherformReverbModule
      const decay = reverb.decaySeconds < 10
        ? reverb.decaySeconds.toFixed(1)
        : String(Math.round(reverb.decaySeconds))
      const shimmer = reverb.shimmerEnabled ? ` · Shimmer +${reverb.shimmerIntervalSemitones}` : ''
      return `${reverb.spaceModel} · ${decay} s · ${reverb.character}${shimmer} · Mix ${Math.round(mix * 100)}%`
    },
    render: ({ editing, bus, onCancel, onSave, onPreview, onClearTail, onRestoreFocus }) => (
      <AetherformReverbModal
        value={editing.module as AetherformReverbModule}
        powered={editing.powered}
        mix={bus.returnLevel}
        slot={bus.index + 1}
        onCancel={onCancel}
        onSave={onSave}
        onClearTail={onClearTail}
        onRestoreFocus={onRestoreFocus}
        onPreview={onPreview}
      />
    )
  }
}

export function openReturnEffectEditor(
  module: ReturnModule,
  powered: boolean
): ReturnEffectEditingState | null {
  if (!EDITORS[module.type] || module.type === 'empty') return null
  return { module, powered }
}

export function returnEffectSummary(module: ReturnModule, mix: number): string {
  if (module.type === 'empty') return 'No effect assigned'
  return EDITORS[module.type]?.summary(module, mix) ?? 'No effect assigned'
}

export function ReturnEffectEditor(props: EditorRenderProps) {
  return EDITORS[props.editing.module.type]?.render(props) ?? null
}
